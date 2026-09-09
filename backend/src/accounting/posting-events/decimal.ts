// Phase 11B-B-1: Prisma.Decimal helpers for posting templates.
// No Number() in any amount path.
import { Prisma } from '@prisma/client';

export const DECIMAL_ZERO = new Prisma.Decimal('0');

export function toDecimal(
  value: Prisma.Decimal | string | null | undefined,
): Prisma.Decimal {
  return new Prisma.Decimal(
    value == null || value === '' ? '0' : String(value),
  );
}

export function sumDebitCredit(
  lines: { debit: Prisma.Decimal; credit: Prisma.Decimal }[],
): { totalDebit: Prisma.Decimal; totalCredit: Prisma.Decimal } {
  let totalDebit = new Prisma.Decimal('0');
  let totalCredit = new Prisma.Decimal('0');
  for (const line of lines) {
    totalDebit = totalDebit.add(line.debit);
    totalCredit = totalCredit.add(line.credit);
  }
  return { totalDebit, totalCredit };
}

export function assertBalancedLines(
  lines: { debit: Prisma.Decimal; credit: Prisma.Decimal }[],
): { totalDebit: Prisma.Decimal; totalCredit: Prisma.Decimal } {
  const totals = sumDebitCredit(lines);
  if (!totals.totalDebit.equals(totals.totalCredit)) {
    throw new Error(
      `Unbalanced posting template: totalDebit=${totals.totalDebit.toFixed(
        4,
      )} != totalCredit=${totals.totalCredit.toFixed(4)}`,
    );
  }
  return totals;
}

/** Phase 6 reject-zero-lines guard: future insert path drops 0.0000 legs. */
export function omitZeroAmountLines<
  T extends { debit: Prisma.Decimal; credit: Prisma.Decimal },
>(lines: T[]): T[] {
  return lines.filter((line) => line.debit.gt(0) || line.credit.gt(0));
}
