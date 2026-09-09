import { JournalEntrySourceType } from '@prisma/client';
import { assertBalancedLines, DECIMAL_ZERO, toDecimal } from './decimal';
import { formatPostedEntryNumber } from './entry-number';
import type { PostingTemplate, SalesInvoiceIssuedSource } from './types';

/**
 * sales_invoice_issued template (plan §4.1).
 *
 * Dr AR_CONTROL            invoice.total
 * Dr SALES_DISCOUNTS       invoice.discountTotal  // contra-revenue (plan §5.1 NormalBalance=DEBIT)
 * Cr SALES_REVENUE         invoice.subtotal
 * Cr VAT_OUTPUT            invoice.vatTotal
 *
 * Zero-amount VAT / discount legs are kept in the template for
 * audit symmetry (plan §4.1); the future insert path should run
 * omitZeroAmountLines() because Phase 6 rejects 0/0 lines.
 */
export function buildSalesInvoiceIssuedTemplate(
  source: SalesInvoiceIssuedSource,
): PostingTemplate {
  const subtotal = toDecimal(source.subtotal);
  const vatTotal = toDecimal(source.vatTotal);
  const discountTotal = toDecimal(source.discountTotal);
  const total = toDecimal(source.total);

  const lines = [
    {
      accountCode: 'AR_CONTROL' as const,
      debit: total,
      credit: DECIMAL_ZERO,
      description: `AR control — ${source.invoiceNumber}`,
    },
    {
      accountCode: 'SALES_DISCOUNTS' as const,
      debit: discountTotal,
      credit: DECIMAL_ZERO,
      description: `Sales discounts — ${source.invoiceNumber}`,
    },
    {
      accountCode: 'SALES_REVENUE' as const,
      debit: DECIMAL_ZERO,
      credit: subtotal,
      description: `Sales revenue — ${source.invoiceNumber}`,
    },
    {
      accountCode: 'VAT_OUTPUT' as const,
      debit: DECIMAL_ZERO,
      credit: vatTotal,
      description: `VAT output — ${source.invoiceNumber}`,
    },
  ];

  const totals = assertBalancedLines(lines);
  return {
    sourceType: JournalEntrySourceType.SALES_INVOICE,
    sourceId: source.id,
    entryNumber: formatPostedEntryNumber(
      JournalEntrySourceType.SALES_INVOICE,
      source.invoiceNumber,
    ),
    description: `Sales invoice ${source.invoiceNumber} issued`,
    lines,
    totalDebit: totals.totalDebit,
    totalCredit: totals.totalCredit,
  };
}
