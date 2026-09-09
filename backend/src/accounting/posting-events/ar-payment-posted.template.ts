import { JournalEntrySourceType } from '@prisma/client';
import { assertBalancedLines, DECIMAL_ZERO, toDecimal } from './decimal';
import { formatPostedEntryNumber } from './entry-number';
import type { ArPaymentPostedSource, PostingTemplate } from './types';

/**
 * ar_payment_posted template (plan §4.3).
 *
 * Dr CASH_OR_BANK   payment.amount
 * Cr AR_CONTROL     payment.amount
 *
 * paymentMethod is memo-only (not a separate leg).
 */
export function buildArPaymentPostedTemplate(
  source: ArPaymentPostedSource,
): PostingTemplate {
  const amount = toDecimal(source.amount);
  const methodLabel = source.paymentMethod ?? 'OTHER';
  const invoiceNote = source.salesInvoiceId
    ? ` invoice ${source.salesInvoiceId}`
    : '';

  const lines = [
    {
      accountCode: 'CASH_OR_BANK' as const,
      debit: amount,
      credit: DECIMAL_ZERO,
      description: `Cash / bank — AR payment ${methodLabel}`,
    },
    {
      accountCode: 'AR_CONTROL' as const,
      debit: DECIMAL_ZERO,
      credit: amount,
      description: `AR control — receipt${invoiceNote}`,
    },
  ];

  const totals = assertBalancedLines(lines);
  const refNote = source.reference ? ` ref ${source.reference}` : '';
  const description = `AR payment ${source.id}${refNote}${invoiceNote} (${methodLabel})`;

  return {
    sourceType: JournalEntrySourceType.AR_PAYMENT,
    sourceId: source.id,
    entryNumber: formatPostedEntryNumber(
      JournalEntrySourceType.AR_PAYMENT,
      source.id,
    ),
    description,
    memo: methodLabel,
    lines,
    totalDebit: totals.totalDebit,
    totalCredit: totals.totalCredit,
  };
}
