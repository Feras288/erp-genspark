import { JournalEntrySourceType } from '@prisma/client';
import { assertBalancedLines, DECIMAL_ZERO, toDecimal } from './decimal';
import { formatPostedEntryNumber } from './entry-number';
import type {
  PostingTemplate,
  PurchaseInvoiceReceivedSource,
} from './types';

/**
 * purchase_invoice_received template (Phase 11B-B-3).
 *
 * Existing PurchaseInvoice fields (do not invent):
 *   subtotal, discountTotal, vatTotal, total
 * where total = sum(lineTotal) = net-of-discount + VAT.
 *
 * Dr INVENTORY_OR_EXPENSE  total - vatTotal   // net purchase (after discount)
 * Dr VAT_INPUT             vatTotal           // omitted when 0
 * Cr AP_CONTROL            total
 */
export function buildPurchaseInvoiceReceivedTemplate(
  source: PurchaseInvoiceReceivedSource,
): PostingTemplate {
  const vatTotal = toDecimal(source.vatTotal);
  const total = toDecimal(source.total);
  const inventoryOrExpense = total.minus(vatTotal);

  const lines = [
    {
      accountCode: 'INVENTORY_OR_EXPENSE' as const,
      debit: inventoryOrExpense,
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
      credit: total,
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
