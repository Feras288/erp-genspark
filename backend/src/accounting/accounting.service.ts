// =====================================================
// Phase 6: Accounting Core — service.
//
// Strict scope:
//   * Chart of Accounts CRUD (code/name/type/normalbalance/parent/active/deletedAt).
//   * Manual Journal Entries with DRAFT/POSTED/CANCELLED lifecycle.
//   * Double-entry validation: ≥2 lines, debit-or-credit per line, totalDebit==totalCredit
//     (server-side Decimal arithmetic, no Float, no Number for money math).
//
// What is INTENTIONALLY not here:
//   * No GET aggregations → no Trial Balance / Balance Sheet / P&L / VAT reports.
//   * No automated posting from Sales / Purchases invoices.
//   * No AR/AP ledgers, no customer/supplier statements.
//   * No payments / bank recon / cash management / costing / COGS / fixed assets.
//   * No payroll, no SaaS billing, no payment gateway, no returns / debit / credit notes.
//   * No reverse entries, no period locking.
//   * No default seed/demo chart of accounts (Company Admin creates their own).
//
// All Decimal columns serialize to strings at the JSON boundary (Prisma Decimal
// default behaviour); server-side arithmetic uses `Prisma.Decimal` exclusively.
// =====================================================
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  JournalEntryStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccountingQueryDto, JournalEntryQueryDto } from './dto/accounting-query.dto';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { PostJournalEntryDto } from './dto/post-journal-entry.dto';
import { CancelJournalEntryDto } from './dto/cancel-journal-entry.dto';

const ACCOUNT_SELECT = {
  id: true,
  companyId: true,
  code: true,
  name: true,
  nameAr: true,
  type: true,
  normalBalance: true,
  parentId: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  updatedById: true,
} as const;

const JOURNAL_SELECT = {
  id: true,
  companyId: true,
  entryNumber: true,
  status: true,
  entryDate: true,
  description: true,
  reference: true,
  totalDebit: true,
  totalCredit: true,
  notes: true,
  postedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  updatedById: true,
  postedById: true,
  cancelledById: true,
  _count: { select: { lines: true } },
} as const;

const JOURNAL_LINE_SELECT = {
  id: true,
  companyId: true,
  entryId: true,
  debitAccountId: true,
  creditAccountId: true,
  description: true,
  debit: true,
  credit: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ACCOUNT_CODE_REGEX_FOR_SERVER = /^[A-Za-z0-9._\-]{1,32}$/;

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ===================================================
  // Chart of Accounts — helpers
  // ===================================================

  private dec(value: string | number | Prisma.Decimal | null | undefined) {
    return new Prisma.Decimal(value == null || value === '' ? '0' : String(value));
  }

  private fmt4(value: Prisma.Decimal) {
    return value.toFixed(4);
  }

  private assertAccountWithinCompany(
    tx: Prisma.TransactionClient,
    companyId: string,
    accountId: string,
    select: { id: true; isActive: true; deletedAt: true; companyId: true } = {
      id: true,
      isActive: true,
      deletedAt: true,
      companyId: true,
    },
  ) {
    return tx.account.findFirst({
      where: { id: accountId, companyId },
      select,
    });
  }

  // ===================================================
  // Chart of Accounts — public methods
  // ===================================================

  async listAccounts(companyId: string, q: AccountingQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.AccountWhereInput = {
      companyId,
      ...(q.includeInactive ? {} : { isActive: true }),
      ...(q.type ? { type: q.type } : {}),
      ...(q.rootsOnly ? { parentId: null } : {}),
      ...(q.search
        ? {
            OR: [
              { code: { contains: q.search, mode: 'insensitive' as const } },
              { name: { contains: q.search, mode: 'insensitive' as const } },
              { nameAr: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.account.count({ where }),
      this.prisma.account.findMany({
        where,
        orderBy: [{ code: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ACCOUNT_SELECT,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getAccount(companyId: string, id: string) {
    const acc = await this.prisma.account.findFirst({
      where: { id, companyId },
      select: { ...ACCOUNT_SELECT, parent: true, children: true },
    });
    if (!acc) throw new NotFoundException('Account not found');
    return acc;
  }

  async createAccount(
    companyId: string,
    userId: string,
    dto: CreateAccountDto,
  ) {
    if (!ACCOUNT_CODE_REGEX_FOR_SERVER.test(dto.code)) {
      throw new BadRequestException(
        'code must be 1..32 chars from [A-Za-z0-9._-]',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      // Reject duplicate code among non-deleted accounts (partial unique index
      // also enforces this at DB level).
      const dup = await tx.account.findFirst({
        where: { companyId, code: dto.code, deletedAt: null },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          `Account code '${dto.code}' is already in use in this company`,
        );
      }
      // parent must be in same company if provided
      if (dto.parentId) {
        const parent = await tx.account.findFirst({
          where: { id: dto.parentId, companyId, deletedAt: null },
          select: { id: true },
        });
        if (!parent) {
          throw new BadRequestException('parentId account is invalid');
        }
      }
      const acc = await tx.account.create({
        data: {
          companyId,
          code: dto.code,
          name: dto.name,
          nameAr: dto.nameAr ?? null,
          type: dto.type,
          normalBalance: dto.normalBalance,
          parentId: dto.parentId ?? null,
          isActive: dto.isActive ?? true,
          createdById: userId,
          updatedById: userId,
        },
        select: ACCOUNT_SELECT,
      });
      await this.audit.record({
        action: 'accounting.account.created',
        entity: 'Account',
        entityId: acc.id,
        companyId,
        userId,
        metadata: { code: acc.code, name: acc.name, type: acc.type },
      });
      return acc;
    });
  }

  async updateAccount(
    companyId: string,
    id: string,
    userId: string,
    dto: UpdateAccountDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const acc = await tx.account.findFirst({
        where: { id, companyId, deletedAt: null },
        select: { id: true, parentId: true, deletedAt: true },
      });
      if (!acc) throw new NotFoundException('Account not found');

      if (dto.parentId) {
        if (dto.parentId === id) {
          throw new BadRequestException('Account cannot be its own parent');
        }
        const parent = await tx.account.findFirst({
          where: { id: dto.parentId, companyId, deletedAt: null },
          select: { id: true },
        });
        if (!parent) {
          throw new BadRequestException('parentId account is invalid');
        }
      }

      const updated = await tx.account.update({
        where: { id: acc.id },
        data: {
          name: dto.name,
          nameAr: dto.nameAr,
          type: dto.type,
          normalBalance: dto.normalBalance,
          parentId: dto.parentId,
          isActive: dto.isActive,
          updatedById: userId,
        },
        select: ACCOUNT_SELECT,
      });
      await this.audit.record({
        action: 'accounting.account.updated',
        entity: 'Account',
        entityId: updated.id,
        companyId,
        userId,
        metadata: { code: updated.code },
      });
      return updated;
    });
  }

  async removeAccount(companyId: string, id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const acc = await tx.account.findFirst({
        where: { id, companyId, deletedAt: null },
        select: { id: true, code: true },
      });
      if (!acc) throw new NotFoundException('Account not found');

      // Block deletion if any POSTED journal line references this account.
      // FK is Restrict, so this is hardened by the schema, but we surface a
      // friendlier 409 message instead.
      const usedOnPosted = await tx.journalEntryLine.findFirst({
        where: {
          companyId,
          OR: [{ debitAccountId: id }, { creditAccountId: id }],
          entry: { status: JournalEntryStatus.POSTED },
        },
        select: { id: true },
      });
      if (usedOnPosted) {
        throw new ConflictException(
          'Account has posted journal entry lines and cannot be deleted',
        );
      }
      const updated = await tx.account.update({
        where: { id: acc.id },
        data: { deletedAt: new Date(), isActive: false, updatedById: userId },
        select: { id: true, deletedAt: true, isActive: true },
      });
      await this.audit.record({
        action: 'accounting.account.deleted',
        entity: 'Account',
        entityId: updated.id,
        companyId,
        userId,
        metadata: { code: acc.code },
      });
      return updated;
    });
  }

  // ===================================================
  // Manual Journal Entries — helpers
  // ===================================================

  private async generateEntryNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
  ) {
    const d = new Date();
    const yyyymmdd =
      d.getUTCFullYear().toString().padStart(4, '0') +
      (d.getUTCMonth() + 1).toString().padStart(2, '0') +
      d.getUTCDate().toString().padStart(2, '0');
    const prefix = `je-${yyyymmdd}-`;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Pick a random 4-digit sequence; the partial unique index on
      // (companyId, entryNumber) prevents collisions on the rare clash.
      const seq = Math.floor(1000 + Math.random() * 9000);
      const candidate = `${prefix}${seq}`;
      const exists = await tx.journalEntry.findFirst({
        where: { companyId, entryNumber: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    // Last fallback: epoch-ms sequence.
    return `${prefix}${Date.now().toString().slice(-6)}`;
  }

  private validateLinesShape(
    raw: {
      accountId: string;
      debit: string;
      credit: string;
      description?: string;
    }[],
  ) {
    if (!Array.isArray(raw) || raw.length < 2) {
      throw new BadRequestException(
        'Journal entry must contain at least 2 lines',
      );
    }
    const accounts = new Set<string>();
    for (const [idx, l] of raw.entries()) {
      if (!l.accountId) {
        throw new BadRequestException(`Line ${idx + 1}: missing accountId`);
      }
      accounts.add(l.accountId);
      const debit = this.dec(l.debit);
      const credit = this.dec(l.credit);
      const debitPos = debit.gt(0);
      const creditPos = credit.gt(0);
      if (debitPos && creditPos) {
        throw new BadRequestException(
          `Line ${idx + 1}: cannot have both debit and credit > 0`,
        );
      }
      if (!debitPos && !creditPos) {
        throw new BadRequestException(
          `Line ${idx + 1}: debit and credit cannot both be zero`,
        );
      }
    }
    return accounts;
  }

  private computeTotalDecimals(
    lines: { debit: Prisma.Decimal; credit: Prisma.Decimal }[],
  ) {
    let td = new Prisma.Decimal(0);
    let tc = new Prisma.Decimal(0);
    for (const l of lines) {
      td = td.add(l.debit);
      tc = tc.add(l.credit);
    }
    return { totalDebit: td, totalCredit: tc };
  }

  private async assertAccountsForLines(
    tx: Prisma.TransactionClient,
    companyId: string,
    accountIds: Set<string>,
  ) {
    if (accountIds.size === 0) return;
    const rows = await tx.account.findMany({
      where: { id: { in: Array.from(accountIds) }, companyId, deletedAt: null },
      select: { id: true, isActive: true, type: true, code: true },
    });
    if (rows.length !== accountIds.size) {
      throw new BadRequestException(
        'One or more line accounts are missing or deleted',
      );
    }
    for (const a of rows) {
      if (!a.isActive) {
        throw new BadRequestException(
          `Account ${a.code} is inactive and cannot be used on a new line`,
        );
      }
    }
  }

  // ===================================================
  // Manual Journal Entries — public methods
  // ===================================================

  async listJournalEntries(companyId: string, q: JournalEntryQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.JournalEntryWhereInput = {
      companyId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { entryNumber: { contains: q.search, mode: 'insensitive' as const } },
              { description: { contains: q.search, mode: 'insensitive' as const } },
              { notes: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.journalEntry.count({ where }),
      this.prisma.journalEntry.findMany({
        where,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: JOURNAL_SELECT,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getJournalEntry(companyId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, companyId },
      select: {
        ...JOURNAL_SELECT,
        lines: {
          select: {
            ...JOURNAL_LINE_SELECT,
            debitAccount: {
              select: { id: true, code: true, name: true, type: true },
            },
            creditAccount: {
              select: { id: true, code: true, name: true, type: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  async createJournalEntry(
    companyId: string,
    userId: string,
    dto: CreateJournalEntryDto,
  ) {
    const accounts = this.validateLinesShape(dto.lines);
    return this.prisma.$transaction(async (tx) => {
      await this.assertAccountsForLines(tx, companyId, accounts);
      const prepared = dto.lines.map((l) => ({
        debitAccountId: this.dec(l.debit).gt(0) ? l.accountId : null,
        creditAccountId: this.dec(l.credit).gt(0) ? l.accountId : null,
        description: l.description ?? null,
        debit: this.dec(l.debit),
        credit: this.dec(l.credit),
      }));
      const totals = this.computeTotalDecimals(prepared);
      if (!totals.totalDebit.equals(totals.totalCredit)) {
        throw new BadRequestException(
          `Unbalanced entry: totalDebit=${totals.totalDebit.toFixed(
            4,
          )} != totalCredit=${totals.totalCredit.toFixed(4)}`,
        );
      }
      const entryNumber = await this.generateEntryNumber(tx, companyId);
      const entry = await tx.journalEntry.create({
        data: {
          companyId,
          entryNumber,
          status: JournalEntryStatus.DRAFT,
          entryDate: dto.entryDate ? new Date(dto.entryDate) : new Date(),
          description: dto.description ?? null,
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          totalDebit: totals.totalDebit,
          totalCredit: totals.totalCredit,
          createdById: userId,
          updatedById: userId,
          lines: {
            create: prepared.map((p) => ({
              companyId,
              ...p,
            })),
          },
        },
        select: JOURNAL_SELECT,
      });
      await this.audit.record({
        action: 'accounting.journal.created',
        entity: 'JournalEntry',
        entityId: entry.id,
        companyId,
        userId,
        metadata: { entryNumber: entry.entryNumber, totalDebit: this.fmt4(totals.totalDebit) },
      });
      return entry;
    });
  }

  async updateJournalEntry(
    companyId: string,
    id: string,
    userId: string,
    dto: UpdateJournalEntryDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.journalEntry.findFirst({
        where: { id, companyId },
        select: { id: true, status: true },
      });
      if (!existing) throw new NotFoundException('Journal entry not found');
      if (existing.status !== JournalEntryStatus.DRAFT) {
        throw new ConflictException(
          `Cannot edit a ${existing.status} journal entry`,
        );
      }
      if (Array.isArray(dto.lines)) {
        const accounts = this.validateLinesShape(
          dto.lines as { accountId: string; debit: string; credit: string; description?: string }[],
        );
        await this.assertAccountsForLines(tx, companyId, accounts);
        const prepared = (dto.lines as { accountId: string; debit: string; credit: string; description?: string }[]).map(
          (l) => ({
            debitAccountId: this.dec(l.debit).gt(0) ? l.accountId : null,
            creditAccountId: this.dec(l.credit).gt(0) ? l.accountId : null,
            description: l.description ?? null,
            debit: this.dec(l.debit),
            credit: this.dec(l.credit),
          }),
        );
        const totals = this.computeTotalDecimals(prepared);
        if (!totals.totalDebit.equals(totals.totalCredit)) {
          throw new BadRequestException(
            `Unbalanced entry: totalDebit=${totals.totalDebit.toFixed(
              4,
            )} != totalCredit=${totals.totalCredit.toFixed(4)}`,
          );
        }
        await tx.journalEntryLine.deleteMany({ where: { entryId: existing.id } });
        await tx.journalEntryLine.createMany({
          data: prepared.map((p) => ({
            companyId,
            entryId: existing.id,
            ...p,
          })),
        });
        await tx.journalEntry.update({
          where: { id: existing.id },
          data: {
            totalDebit: totals.totalDebit,
            totalCredit: totals.totalCredit,
            updatedById: userId,
          },
        });
      }
      const headerPatch: Prisma.JournalEntryUpdateInput = {};
      if (typeof dto.entryDate === 'string' && dto.entryDate) {
        headerPatch.entryDate = new Date(dto.entryDate);
      }
      if (typeof dto.description === 'string') {
        headerPatch.description = dto.description;
      }
      if (typeof dto.reference === 'string') {
        headerPatch.reference = dto.reference;
      }
      if (typeof dto.notes === 'string') {
        headerPatch.notes = dto.notes;
      }
      headerPatch.updatedBy = { connect: { id: userId } };
      const updated = await tx.journalEntry.update({
        where: { id: existing.id },
        data: headerPatch,
        select: JOURNAL_SELECT,
      });
      await this.audit.record({
        action: 'accounting.journal.updated',
        entity: 'JournalEntry',
        entityId: updated.id,
        companyId,
        userId,
        metadata: { entryNumber: updated.entryNumber },
      });
      return updated;
    });
  }

  async postJournalEntry(
    companyId: string,
    id: string,
    userId: string,
    dto: PostJournalEntryDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findFirst({
        where: { id, companyId },
        select: { id: true, status: true, totalDebit: true, totalCredit: true },
      });
      if (!entry) throw new NotFoundException('Journal entry not found');
      if (entry.status !== JournalEntryStatus.DRAFT) {
        throw new ConflictException(
          `Only DRAFT entries can be posted (current: ${entry.status})`,
        );
      }
      if (!entry.totalDebit.equals(entry.totalCredit)) {
        throw new BadRequestException(
          'Entry is not balanced — cannot post',
        );
      }
      const updated = await tx.journalEntry.update({
        where: { id: entry.id },
        data: {
          status: JournalEntryStatus.POSTED,
          postedAt: new Date(),
          postedBy: { connect: { id: userId } },
          entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
          notes: dto.notes ?? undefined,
          updatedBy: { connect: { id: userId } },
        },
        select: JOURNAL_SELECT,
      });
      await this.audit.record({
        action: 'accounting.journal.posted',
        entity: 'JournalEntry',
        entityId: updated.id,
        companyId,
        userId,
        metadata: {
          entryNumber: updated.entryNumber,
          totalDebit: this.fmt4(entry.totalDebit),
        },
      });
      return updated;
    });
  }

  async cancelJournalEntry(
    companyId: string,
    id: string,
    userId: string,
    dto: CancelJournalEntryDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findFirst({
        where: { id, companyId },
        select: { id: true, status: true },
      });
      if (!entry) throw new NotFoundException('Journal entry not found');
      if (entry.status === JournalEntryStatus.POSTED) {
        throw new ConflictException(
          'Posted journal entries require reversing entries, which are out of scope in Phase 6',
        );
      }
      if (entry.status === JournalEntryStatus.CANCELLED) {
        throw new ConflictException('Journal entry is already cancelled');
      }
      const updated = await tx.journalEntry.update({
        where: { id: entry.id },
        data: {
          status: JournalEntryStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId,
          notes: dto.notes ?? undefined,
          updatedById: userId,
        },
        select: JOURNAL_SELECT,
      });
      await this.audit.record({
        action: 'accounting.journal.cancelled',
        entity: 'JournalEntry',
        entityId: updated.id,
        companyId,
        userId,
        metadata: {
          entryNumber: updated.entryNumber,
          reason: dto.reason ?? null,
        },
      });
      return updated;
    });
  }
}
