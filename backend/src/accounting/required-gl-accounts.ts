// =====================================================
// Phase 11B-B-1: required GL account mapping.
//
// Delivery vehicle (locked here, plan §5.3 / §10):
//   1. Migration 20260909180000_phase11b_gl_posting_linkage
//      backfills the eight codes for companies that already
//      exist at `prisma migrate deploy`.
//   2. `prisma db seed` calls `ensureRequiredGlAccounts`
//      for every company (idempotent re-run).
//   3. Opportunistic first-invoice ensure is this helper;
//      it is NOT invoked from sales/purchases/payments in
//      11B-B-1 (no auto-post wiring yet).
//
// Auto-post (later 11B-B-2+) looks up accounts by `code`
// per `companyId` — never by hard-coded account ids.
// A tenant missing any of the eight codes cannot post;
// callers should use `missingRequiredGlAccountCodes`.
// =====================================================
import { AccountType, NormalBalance, Prisma, PrismaClient } from '@prisma/client';

export const REQUIRED_GL_ACCOUNT_CODES = [
  'AR_CONTROL',
  'AP_CONTROL',
  'CASH_OR_BANK',
  'SALES_REVENUE',
  'INVENTORY_OR_EXPENSE',
  'VAT_OUTPUT',
  'VAT_INPUT',
  'SALES_DISCOUNTS',
] as const;

export type RequiredGlAccountCode = (typeof REQUIRED_GL_ACCOUNT_CODES)[number];

export type RequiredGlAccountSpec = {
  code: RequiredGlAccountCode;
  name: string;
  nameAr: string;
  type: AccountType;
  normalBalance: NormalBalance;
};

export const REQUIRED_GL_ACCOUNTS: readonly RequiredGlAccountSpec[] = [
  {
    code: 'AR_CONTROL',
    name: 'Accounts Receivable Control',
    nameAr: 'حساب المدينين',
    type: AccountType.ASSET,
    normalBalance: NormalBalance.DEBIT,
  },
  {
    code: 'AP_CONTROL',
    name: 'Accounts Payable Control',
    nameAr: 'حساب الدائنين',
    type: AccountType.LIABILITY,
    normalBalance: NormalBalance.CREDIT,
  },
  {
    code: 'CASH_OR_BANK',
    name: 'Cash / Bank',
    nameAr: 'النقدية / البنك',
    type: AccountType.ASSET,
    normalBalance: NormalBalance.DEBIT,
  },
  {
    code: 'SALES_REVENUE',
    name: 'Sales Revenue',
    nameAr: 'إيرادات المبيعات',
    type: AccountType.REVENUE,
    normalBalance: NormalBalance.CREDIT,
  },
  {
    code: 'INVENTORY_OR_EXPENSE',
    name: 'Inventory or Purchases Expense',
    nameAr: 'المخزون أو مصروف المشتريات',
    type: AccountType.EXPENSE,
    normalBalance: NormalBalance.DEBIT,
  },
  {
    code: 'VAT_OUTPUT',
    name: 'VAT Output (Sales)',
    nameAr: 'ضريبة القيمة المضافة مخرجات',
    type: AccountType.LIABILITY,
    normalBalance: NormalBalance.CREDIT,
  },
  {
    code: 'VAT_INPUT',
    name: 'VAT Input (Purchases)',
    nameAr: 'ضريبة القيمة المضافة مدخلات',
    type: AccountType.ASSET,
    normalBalance: NormalBalance.DEBIT,
  },
  {
    code: 'SALES_DISCOUNTS',
    name: 'Sales Discounts',
    nameAr: 'خصومات المبيعات',
    type: AccountType.REVENUE,
    normalBalance: NormalBalance.DEBIT,
  },
];

type AccountDb = PrismaClient | Prisma.TransactionClient;

export type EnsureRequiredGlAccountsResult = {
  created: RequiredGlAccountCode[];
  existing: RequiredGlAccountCode[];
};

/**
 * Idempotent per (companyId, code) among non-deleted accounts.
 * Safe to call from seed, migrate-follow-up, or (later) first-invoice.
 * Does not post, does not open a nested $transaction.
 */
export async function ensureRequiredGlAccounts(
  db: AccountDb,
  companyId: string,
): Promise<EnsureRequiredGlAccountsResult> {
  const created: RequiredGlAccountCode[] = [];
  const existing: RequiredGlAccountCode[] = [];

  for (const spec of REQUIRED_GL_ACCOUNTS) {
    const found = await db.account.findFirst({
      where: { companyId, code: spec.code, deletedAt: null },
      select: { id: true },
    });
    if (found) {
      existing.push(spec.code);
      continue;
    }
    try {
      await db.account.create({
        data: {
          companyId,
          code: spec.code,
          name: spec.name,
          nameAr: spec.nameAr,
          type: spec.type,
          normalBalance: spec.normalBalance,
          isActive: true,
        },
      });
      created.push(spec.code);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        existing.push(spec.code);
        continue;
      }
      throw err;
    }
  }

  return { created, existing };
}

export function missingRequiredGlAccountCodes(
  presentCodes: Iterable<string>,
): RequiredGlAccountCode[] {
  const present = new Set(presentCodes);
  return REQUIRED_GL_ACCOUNT_CODES.filter((code) => !present.has(code));
}

export function formatMissingRequiredGlAccountsMessage(
  missing: readonly string[],
): string {
  return `Missing required GL accounts: ${missing.join(', ')}`;
}
