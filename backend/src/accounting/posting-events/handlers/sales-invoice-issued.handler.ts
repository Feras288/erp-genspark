// =====================================================
// Phase 11B-B-2: sales_invoice_issued auto-post.
//
// Inserts exactly one POSTED JournalEntry per
// (companyId, SALES_INVOICE, invoice.id) inside the
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
import { buildSalesInvoiceIssuedTemplate } from '../sales-invoice-issued.template';
import type { SalesInvoiceIssuedSource } from '../types';

const SOURCE_TYPE = JournalEntrySourceType.SALES_INVOICE;

export type PostSalesInvoiceIssuedResult = {
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

export async function postSalesInvoiceIssued(
  tx: Prisma.TransactionClient,
  args: {
    companyId: string;
    userId: string;
    invoice: SalesInvoiceIssuedSource;
  },
): Promise<PostSalesInvoiceIssuedResult> {
  const existing = await findExistingPosted(
    tx,
    args.companyId,
    args.invoice.id,
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

  const template = buildSalesInvoiceIssuedTemplate(args.invoice);
  const lines = omitZeroAmountLines(template.lines);
  if (lines.length < 2) {
    throw new BadRequestException(
      'Sales invoice posting requires at least 2 non-zero journal lines',
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
        reference: args.invoice.id,
        totalDebit: totals.totalDebit,
        totalCredit: totals.totalCredit,
        postedAt,
        postedById: args.userId,
        createdById: args.userId,
        updatedById: args.userId,
        sourceType: SOURCE_TYPE,
        sourceId: args.invoice.id,
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
      args.invoice.id,
    );
    if (raced) return { id: raced.id, reused: true };
    const fallbackNumber = `${template.entryNumber}-${args.invoice.id.slice(-6)}`;
    try {
      const created = await createWithEntryNumber(fallbackNumber);
      return { id: created.id, reused: false };
    } catch (retryErr) {
      if (!isUniqueViolation(retryErr)) throw retryErr;
      const again = await findExistingPosted(
        tx,
        args.companyId,
        args.invoice.id,
      );
      if (again) return { id: again.id, reused: true };
      throw retryErr;
    }
  }
}
