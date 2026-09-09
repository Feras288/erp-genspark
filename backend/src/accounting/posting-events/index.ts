// Phase 11B-B-1: posting-event templates (read-only builders).
// Phase 11B-B-2: sales_invoice_issued handler (called from SalesService.issue).
// Phase 11B-B-3: purchase_invoice_received handler (called from PurchasesService.receive).
// Phase 11B-B-4: ar_payment_posted handler (called from PaymentsService.register).
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
export { postSalesInvoiceIssued } from './handlers/sales-invoice-issued.handler';
export type { PostSalesInvoiceIssuedResult } from './handlers/sales-invoice-issued.handler';
export { postPurchaseInvoiceReceived } from './handlers/purchase-invoice-received.handler';
export type { PostPurchaseInvoiceReceivedResult } from './handlers/purchase-invoice-received.handler';
export { postArPaymentPosted } from './handlers/ar-payment-posted.handler';
export type { PostArPaymentPostedResult } from './handlers/ar-payment-posted.handler';
export type {
  ApPaymentPostedSource,
  ArPaymentPostedSource,
  PostingTemplate,
  PostingTemplateLine,
  PurchaseInvoiceReceivedSource,
  SalesInvoiceIssuedSource,
} from './types';
