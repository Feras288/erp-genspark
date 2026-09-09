// =====================================================
// Phase 11B-B-5: ap_payment_posted auto-post.
//
// Inserts exactly one POSTED JournalEntry per
// (companyId, AP_PAYMENT, payment.id) inside the
// caller's Prisma $transaction. Unique-index P2002 is
// treated as success (idempotent retry).
//
// No Number() in amount math. Account lookup is by code
// per companyId (never by hard-coded account ids).
// =====================================================
import { BadRequestException } from '@nestjs/common';
import {
  JournalEntrySourceType,
  JournalEntryStatus,
  Prisma,
} from '@prisma/client';
import {
  REQUIRED_GL_ACCOUNT_CODES,
  ensureRequiredGlAccounts,
  formatMissingRequiredGlAccountsMessage,
  missingRequiredGlAccountCodes,
} from '../../required-gl-accounts';
import { assertBalancedLines, omitZeroAmountLines } from '../decimal';
import { buildApPaymentPostedTemplate } from '../ap-payment-posted.template';
import type { ApPaymentPostedSource } from '../types';

const SOURCE_TYPE = JournalEntrySourceType.AP_PAYMENT;

export type PostApPaymentPostedResult = {
  id: string;
  reused: boolean;
};

async function findExistingPosted(
  tx: Prisma.TransactionClient,
  companyId: string,
  sourceId: string,
): Promise<{ id: string } | null> {
  return tx.journalEntry.findFirst({
    where: { companyId, sourceType: SOURCE_TYPE, sourceId },
    select: { id: true },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

export async function postApPaymentPosted(
  tx: Prisma.TransactionClient,
  args: {
    companyId: string;
    userId: string;
    payment: ApPaymentPostedSource;
  },
): Promise<PostApPaymentPostedResult> {
  const existing = await findExistingPosted(
    tx,
    args.companyId,
    args.payment.id,
  );
  if (existing) return { id: existing.id, reused: true };

  await ensureRequiredGlAccounts(tx, args.companyId);

  const accountRows = await tx.account.findMany({
    where: {
      companyId: args.companyId,
      code: { in: [...REQUIRED_GL_ACCOUNT_CODES] },
      deletedAt: null,
      isActive: true,
    },
    select: { id: true, code: true },
  });
  const missing = missingRequiredGlAccountCodes(accountRows.map((a) => a.code));
  if (missing.length) {
    throw new BadRequestException(
      formatMissingRequiredGlAccountsMessage(missing),
    );
  }
  const accountIdByCode = new Map(accountRows.map((a) => [a.code, a.id]));

  const template = buildApPaymentPostedTemplate(args.payment);
  const lines = omitZeroAmountLines(template.lines);
  if (lines.length < 2) {
    throw new BadRequestException(
      'AP payment posting requires at least 2 non-zero journal lines',
    );
  }
  const totals = assertBalancedLines(lines);

  const prepared = lines.map((line) => {
    const accountId = accountIdByCode.get(line.accountCode);
    if (!accountId) {
      throw new BadRequestException(
        formatMissingRequiredGlAccountsMessage([line.accountCode]),
      );
    }
    const isDebit = line.debit.gt(0);
    return {
      companyId: args.companyId,
      debitAccountId: isDebit ? accountId : null,
      creditAccountId: isDebit ? null : accountId,
      description: line.description ?? null,
      debit: line.debit,
      credit: line.credit,
    };
  });

  const postedAt = new Date();
  const createWithEntryNumber = (entryNumber: string) =>
    tx.journalEntry.create({
      data: {
        companyId: args.companyId,
        entryNumber,
        status: JournalEntryStatus.POSTED,
        entryDate: postedAt,
        description: template.description,
        reference: args.payment.reference ?? args.payment.id,
        notes: template.memo ?? null,
        totalDebit: totals.totalDebit,
        totalCredit: totals.totalCredit,
        postedAt,
        postedById: args.userId,
        createdById: args.userId,
        updatedById: args.userId,
        sourceType: SOURCE_TYPE,
        sourceId: args.payment.id,
        lines: { create: prepared },
      },
      select: { id: true },
    });

  try {
    const created = await createWithEntryNumber(template.entryNumber);
    return { id: created.id, reused: false };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await findExistingPosted(
      tx,
      args.companyId,
      args.payment.id,
    );
    if (raced) return { id: raced.id, reused: true };
    const fallbackNumber = `${template.entryNumber}-${args.payment.id.slice(-6)}`;
    try {
      const created = await createWithEntryNumber(fallbackNumber);
      return { id: created.id, reused: false };
    } catch (retryErr) {
      if (!isUniqueViolation(retryErr)) throw retryErr;
      const again = await findExistingPosted(
        tx,
        args.companyId,
        args.payment.id,
      );
      if (again) return { id: again.id, reused: true };
      throw retryErr;
    }
  }
}
