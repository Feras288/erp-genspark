// =====================================================
// Phase 11B-B-1: read-only posting template types.
//
// `buildTemplate(source) -> { lines, ... }` only. No $transaction,
// no Prisma writes, no sales/purchases/payments call sites.
// =====================================================
import { JournalEntrySourceType, Prisma } from '@prisma/client';
import type { RequiredGlAccountCode } from '../required-gl-accounts';

export type PostingTemplateLine = {
  accountCode: RequiredGlAccountCode;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  description?: string;
};

export type PostingTemplate = {
  sourceType: JournalEntrySourceType;
  sourceId: string;
  entryNumber: string;
  description: string;
  memo?: string;
  lines: PostingTemplateLine[];
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
};

export type SalesInvoiceIssuedSource = {
  id: string;
  invoiceNumber: string;
  subtotal: Prisma.Decimal | string;
  vatTotal: Prisma.Decimal | string;
  discountTotal: Prisma.Decimal | string;
  total: Prisma.Decimal | string;
};

export type PurchaseInvoiceReceivedSource = {
  id: string;
  invoiceNumber: string;
  subtotal: Prisma.Decimal | string;
  vatTotal: Prisma.Decimal | string;
  discountTotal: Prisma.Decimal | string;
  total: Prisma.Decimal | string;
};

export type ArPaymentPostedSource = {
  id: string;
  amount: Prisma.Decimal | string;
  paymentMethod?: string | null;
  salesInvoiceId?: string | null;
};

export type ApPaymentPostedSource = {
  id: string;
  amount: Prisma.Decimal | string;
  paymentMethod?: string | null;
  purchaseInvoiceId?: string | null;
};
