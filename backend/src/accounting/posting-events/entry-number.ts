// Phase 11B-B-1: JournalEntry.entryNumber derivation (locked here).
//
// SALES_INVOICE     → SL-{invoiceNumber}   (plan §4.1)
// PURCHASE_INVOICE  → PI-{invoiceNumber}
// AR_PAYMENT        → AR-{paymentId}
// AP_PAYMENT        → AP-{paymentId}
import { JournalEntrySourceType } from '@prisma/client';

export const JOURNAL_ENTRY_NUMBER_PREFIX: Record<
  JournalEntrySourceType,
  string
> = {
  SALES_INVOICE: 'SL',
  PURCHASE_INVOICE: 'PI',
  AR_PAYMENT: 'AR',
  AP_PAYMENT: 'AP',
};

export function formatPostedEntryNumber(
  sourceType: JournalEntrySourceType,
  sourceNumber: string,
): string {
  return `${JOURNAL_ENTRY_NUMBER_PREFIX[sourceType]}-${sourceNumber}`;
}
