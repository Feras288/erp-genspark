// =====================================================
// Phase 13A-B-4: Matching Suggestions Scorer
// Deterministic 0-100 confidence scoring between BankTransaction and Payment.
// Max score = 100 (Amount: 60, Date: 25, Reference: 15).
// =====================================================
import { BankTransactionType, Prisma } from '@prisma/client';

export interface ScoreResult {
  score: number;
  matchType: 'EXACT' | 'SUGGESTED';
  reasons: string[];
}

/**
 * Checks accounting directional compatibility:
 * INFLOW (credits/receipts) <-> AR payment (SALES)
 * OUTFLOW (debits/disbursements) <-> AP payment (PURCHASE)
 */
export function isDirectionCompatible(
  bankTxType: BankTransactionType,
  invoiceType: string,
): boolean {
  if (bankTxType === BankTransactionType.INFLOW && invoiceType === 'SALES') {
    return true;
  }
  if (bankTxType === BankTransactionType.OUTFLOW && invoiceType === 'PURCHASE') {
    return true;
  }
  return false;
}

/**
 * Amount match scoring (60 points max):
 * Exact equality via Prisma.Decimal.equals -> 60 points.
 * Otherwise 0 points.
 */
export function computeAmountScore(
  a1: Prisma.Decimal,
  a2: Prisma.Decimal,
): { score: number; reason?: string } {
  if (a1.equals(a2)) {
    return { score: 60, reason: 'Exact amount match (+60)' };
  }
  return { score: 0 };
}

/**
 * Date proximity scoring (25 points max):
 * Compares UTC calendar days between bank booking date and payment paid date.
 */
export function computeDateScore(
  d1: Date,
  d2: Date,
): { score: number; reason?: string } {
  const utc1 = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate());
  const utc2 = Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate());
  const diffDays = Math.round(Math.abs(utc1 - utc2) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { score: 25, reason: 'Same day transaction (+25)' };
  }
  if (diffDays === 1) {
    return { score: 20, reason: 'Within 1 day (+20)' };
  }
  if (diffDays === 2) {
    return { score: 15, reason: 'Within 2 days (+15)' };
  }
  if (diffDays <= 5) {
    return { score: 10, reason: `Within ${diffDays} days (+10)` };
  }
  return { score: 0 };
}

/**
 * Reference / textual similarity scoring (15 points max):
 * Compares reference strings, description, counterparty, and invoice number.
 */
export function computeReferenceScore(params: {
  bankReference?: string | null;
  bankDescription?: string | null;
  bankPayerPayee?: string | null;
  paymentReference?: string | null;
  paymentNotes?: string | null;
  invoiceNumber?: string | null;
}): { score: number; reason?: string } {
  const clean = (s: string | null | undefined) =>
    (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const bankRef = clean(params.bankReference);
  const payRef = clean(params.paymentReference);
  const invNum = clean(params.invoiceNumber);
  const bankDesc = clean(params.bankDescription);
  const payNotes = clean(params.paymentNotes);

  // Exact reference match (min 2 chars)
  if (bankRef && payRef && bankRef.length >= 2 && bankRef === payRef) {
    return { score: 15, reason: 'Exact reference match (+15)' };
  }

  // Exact invoice number match in bank reference
  if (invNum && bankRef && invNum.length >= 3 && bankRef === invNum) {
    return { score: 15, reason: 'Exact invoice number match (+15)' };
  }

  // Partial substring matches (min 3 chars)
  // 1. Invoice number in bank description or reference
  if (invNum && invNum.length >= 3) {
    if (bankDesc.includes(invNum) || bankRef.includes(invNum)) {
      return { score: 10, reason: 'Invoice number found in bank text (+10)' };
    }
  }

  // 2. Payment reference in bank description or reference
  if (payRef && payRef.length >= 3) {
    if (bankDesc.includes(payRef) || bankRef.includes(payRef)) {
      return { score: 10, reason: 'Payment reference found in bank text (+10)' };
    }
  }

  // 3. Bank reference in payment notes
  if (bankRef && bankRef.length >= 3 && payNotes.includes(bankRef)) {
    return { score: 10, reason: 'Bank reference found in payment notes (+10)' };
  }

  return { score: 0 };
}

/**
 * Full match score calculation combining amount, date, and reference.
 */
export function computeMatchScore(params: {
  bankAmount: Prisma.Decimal;
  paymentAmount: Prisma.Decimal;
  bankDate: Date;
  paymentDate: Date;
  bankReference?: string | null;
  bankDescription?: string | null;
  bankPayerPayee?: string | null;
  paymentReference?: string | null;
  paymentNotes?: string | null;
  invoiceNumber?: string | null;
}): ScoreResult {
  const reasons: string[] = [];

  const amountRes = computeAmountScore(params.bankAmount, params.paymentAmount);
  if (amountRes.reason) reasons.push(amountRes.reason);

  const dateRes = computeDateScore(params.bankDate, params.paymentDate);
  if (dateRes.reason) reasons.push(dateRes.reason);

  const refRes = computeReferenceScore({
    bankReference: params.bankReference,
    bankDescription: params.bankDescription,
    bankPayerPayee: params.bankPayerPayee,
    paymentReference: params.paymentReference,
    paymentNotes: params.paymentNotes,
    invoiceNumber: params.invoiceNumber,
  });
  if (refRes.reason) reasons.push(refRes.reason);

  const totalScore = amountRes.score + dateRes.score + refRes.score;

  return {
    score: totalScore,
    matchType: totalScore === 100 ? 'EXACT' : 'SUGGESTED',
    reasons,
  };
}
