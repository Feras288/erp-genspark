// Phase 11B-B-1: posting-event templates (read-only).
// No $transaction, no trigger wiring, no service call sites.
export {
  assertBalancedLines,
  DECIMAL_ZERO,
  omitZeroAmountLines,
  sumDebitCredit,
  toDecimal,
} from './decimal';
export {
  formatPostedEntryNumber,
  JOURNAL_ENTRY_NUMBER_PREFIX,
} from './entry-number';
export { buildSalesInvoiceIssuedTemplate } from './sales-invoice-issued.template';
export { buildPurchaseInvoiceReceivedTemplate } from './purchase-invoice-received.template';
export { buildArPaymentPostedTemplate } from './ar-payment-posted.template';
export { buildApPaymentPostedTemplate } from './ap-payment-posted.template';
export type {
  ApPaymentPostedSource,
  ArPaymentPostedSource,
  PostingTemplate,
  PostingTemplateLine,
  PurchaseInvoiceReceivedSource,
  SalesInvoiceIssuedSource,
} from './types';
