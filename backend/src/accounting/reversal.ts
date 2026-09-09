// =====================================================
// Phase 11B-B-1: reversing-entry helper skeleton.
//
// Signature locked by docs/PHASE_11B_REAL_GL_POSTING_PLAN.md §3.5:
//   reverseJournalEntry(companyId, originalId, reason, userId)
//
// 11B-B-1 does NOT write journal rows and does NOT open a
// $transaction. Cancellation hooks in 11B-B-2..5 will replace
// the NotImplementedException with a real reversing insert:
//   * original JournalEntry is never mutated or deleted
//   * new POSTED entry with debit ↔ credit swapped (same Decimal)
//   * reversalOf links the new row to the original
//   * JournalEntryStatus stays DRAFT | POSTED | CANCELLED
//
// Phase 6 / 11A cancel-on-POSTED still throws ConflictException
// with the Fork A wording from accounting.service.ts. This helper
// is additive and is not wired to that endpoint yet.
// =====================================================
import { NotImplementedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type ReversableJournalLine = {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  description?: string | null;
};

/**
 * Pure debit ↔ credit swap. Same Prisma.Decimal amounts, no Number().
 * Used later by reverseJournalEntry; no database access.
 */
export function mirrorJournalLines<T extends ReversableJournalLine>(
  lines: T[],
): T[] {
  return lines.map((line) => ({
    ...line,
    debit: line.credit,
    credit: line.debit,
    description: line.description
      ? `Reversal: ${line.description}`
      : 'Reversal',
  }));
}

export async function reverseJournalEntry(
  _companyId: string,
  _originalId: string,
  _reason: string,
  _userId: string,
): Promise<never> {
  throw new NotImplementedException(
    'Posted journal entries require reversing entries; reverseJournalEntry is scaffolded in Phase 11B-B-1 and is not wired yet',
  );
}
