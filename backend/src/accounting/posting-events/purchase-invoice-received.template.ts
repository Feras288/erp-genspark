import { JournalEntrySourceType } from '@prisma/client';
import { assertBalancedLines, DECIMAL_ZERO, toDecimal } from './decimal';
import { formatPostedEntryNumber } from './entry-number';
import type {
  PostingTemplate,
  PurchaseInvoiceReceivedSource,
} from './types';

/**
 * purchase_invoice_received template (plan §4.2).
 *
 * Dr INVENTORY_OR_EXPENSE  invoice.total
 * Dr VAT_INPUT             invoice.vatTotal
 * Cr AP_CONTROL            invoice.total + invoice.vatTotal
 */
export function buildPurchaseInvoiceReceivedTemplate(
  source: PurchaseInvoiceReceivedSource,
): PostingTemplate {
  const vatTotal = toDecimal(source.vatTotal);
  const total = toDecimal(source.total);
  const apCredit = total.add(vatTotal);

  const lines = [
    {
      accountCode: 'INVENTORY_OR_EXPENSE' as const,
      debit: total,
      credit: DECIMAL_ZERO,
      description: `Inventory / purchases expense — ${source.invoiceNumber}`,
    },
    {
      accountCode: 'VAT_INPUT' as const,
      debit: vatTotal,
      credit: DECIMAL_ZERO,
      description: `VAT input — ${source.invoiceNumber}`,
    },
    {
      accountCode: 'AP_CONTROL' as const,
      debit: DECIMAL_ZERO,
      credit: apCredit,
      description: `AP control — ${source.invoiceNumber}`,
    },
  ];

  const totals = assertBalancedLines(lines);
  return {
    sourceType: JournalEntrySourceType.PURCHASE_INVOICE,
    sourceId: source.id,
    entryNumber: formatPostedEntryNumber(
      JournalEntrySourceType.PURCHASE_INVOICE,
      source.invoiceNumber,
    ),
    description: `Purchase invoice ${source.invoiceNumber} received`,
    lines,
    totalDebit: totals.totalDebit,
    totalCredit: totals.totalCredit,
  };
}
