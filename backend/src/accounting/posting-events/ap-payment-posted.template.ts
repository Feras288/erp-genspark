import { JournalEntrySourceType } from '@prisma/client';
import { assertBalancedLines, DECIMAL_ZERO, toDecimal } from './decimal';
import { formatPostedEntryNumber } from './entry-number';
import type { ApPaymentPostedSource, PostingTemplate } from './types';

/**
 * ap_payment_posted template (plan §4.4).
 *
 * Dr AP_CONTROL      payment.amount
 * Cr CASH_OR_BANK    payment.amount
 *
 * paymentMethod is memo-only (not a separate leg).
 */
export function buildApPaymentPostedTemplate(
  source: ApPaymentPostedSource,
): PostingTemplate {
  const amount = toDecimal(source.amount);
  const methodLabel = source.paymentMethod ?? 'OTHER';
  const invoiceNote = source.purchaseInvoiceId
    ? ` invoice ${source.purchaseInvoiceId}`
    : '';

  const lines = [
    {
      accountCode: 'AP_CONTROL' as const,
      debit: amount,
      credit: DECIMAL_ZERO,
      description: `AP control — payment${invoiceNote}`,
    },
    {
      accountCode: 'CASH_OR_BANK' as const,
      debit: DECIMAL_ZERO,
      credit: amount,
      description: `Cash / bank — AP payment ${methodLabel}`,
    },
  ];

  const totals = assertBalancedLines(lines);
  return {
    sourceType: JournalEntrySourceType.AP_PAYMENT,
    sourceId: source.id,
    entryNumber: formatPostedEntryNumber(
      JournalEntrySourceType.AP_PAYMENT,
      source.id,
    ),
    description: `AP payment posted (${methodLabel})`,
    memo: methodLabel,
    lines,
    totalDebit: totals.totalDebit,
    totalCredit: totals.totalCredit,
  };
}
