// =====================================================
// Phase 13A-B-3: CSV Statement Parser & Helpers
// RFC-4180 compliant CSV tokenization, date/amount normalization,
// and SHA-256 transaction fingerprint generation.
// =====================================================
import { BadRequestException } from '@nestjs/common';
import { BankTransactionType, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

export interface CsvHeaderMapping {
  dateIndex: number;
  valueDateIndex?: number;
  debitIndex?: number;
  creditIndex?: number;
  amountIndex?: number;
  typeIndex?: number;
  balanceIndex?: number;
  referenceIndex?: number;
  descriptionIndex?: number;
  payerPayeeIndex?: number;
}

/**
 * Tokenize CSV content into 2D string array.
 * Supports quoted fields, embedded commas/newlines, escaped quotes, and BOM.
 */
export function parseCsvRecords(csvContent: string): string[][] {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  // Normalize UTF-8 BOM if present
  const content = csvContent.charCodeAt(0) === 0xfeff ? csvContent.slice(1) : csvContent;

  // Auto-detect delimiter from the first non-empty line (default comma, support semicolon)
  const firstLine = content.split(/\r?\n/)[0] || '';
  const delimiter = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';

  while (i < content.length) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRecord.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < content.length && content[i + 1] === '\n') {
          i++;
        }
        currentRecord.push(currentField.trim());
        currentField = '';
        if (currentRecord.some((f) => f.length > 0)) {
          records.push(currentRecord);
        }
        currentRecord = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRecord.push(currentField.trim());
        currentField = '';
        if (currentRecord.some((f) => f.length > 0)) {
          records.push(currentRecord);
        }
        currentRecord = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Flush last record
  currentRecord.push(currentField.trim());
  if (currentRecord.some((f) => f.length > 0)) {
    records.push(currentRecord);
  }

  return records;
}

/**
 * Normalizes header string: lowercase and alphanumeric only.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Maps CSV headers to column indices based on standard bank statement aliases.
 */
export function mapCsvHeaders(headers: string[]): CsvHeaderMapping {
  const norm = headers.map(normalizeHeader);

  const dateAliases = ['transactiondate', 'date', 'bookingdate', 'txdate', 'postingdate'];
  const valueDateAliases = ['valuedate'];
  const debitAliases = ['debit', 'withdrawal', 'withdrawals', 'outflow', 'dr', 'payments'];
  const creditAliases = ['credit', 'deposit', 'deposits', 'inflow', 'cr', 'receipts'];
  const amountAliases = ['amount', 'netamount', 'txamount'];
  const typeAliases = ['type', 'direction', 'debitcredit', 'trxtype', 'transactiontype', 'drcr'];
  const balanceAliases = ['balance', 'runningbalance', 'balanceafter', 'closingbalance', 'currentbalance'];
  const referenceAliases = ['reference', 'ref', 'refnumber', 'transactionid', 'checknumber', 'chequenumber', 'txid'];
  const descriptionAliases = ['description', 'narration', 'memo', 'details', 'particulars', 'remarks'];
  const payerPayeeAliases = ['payerpayee', 'counterparty', 'beneficiary', 'sender', 'party', 'customer', 'supplier'];

  const findIdx = (aliases: string[]): number => {
    return norm.findIndex((h) => aliases.includes(h));
  };

  const dateIndex = findIdx(dateAliases);
  if (dateIndex === -1) {
    throw new BadRequestException(
      'CSV is missing a required date column (e.g. date, transactionDate, bookingDate)',
    );
  }

  const debitIndex = findIdx(debitAliases);
  const creditIndex = findIdx(creditAliases);
  const amountIndex = findIdx(amountAliases);

  if (debitIndex === -1 && creditIndex === -1 && amountIndex === -1) {
    throw new BadRequestException(
      'CSV must contain either debit/credit columns or an amount column',
    );
  }

  return {
    dateIndex,
    valueDateIndex: findIdx(valueDateAliases) >= 0 ? findIdx(valueDateAliases) : undefined,
    debitIndex: debitIndex >= 0 ? debitIndex : undefined,
    creditIndex: creditIndex >= 0 ? creditIndex : undefined,
    amountIndex: amountIndex >= 0 ? amountIndex : undefined,
    typeIndex: findIdx(typeAliases) >= 0 ? findIdx(typeAliases) : undefined,
    balanceIndex: findIdx(balanceAliases) >= 0 ? findIdx(balanceAliases) : undefined,
    referenceIndex: findIdx(referenceAliases) >= 0 ? findIdx(referenceAliases) : undefined,
    descriptionIndex: findIdx(descriptionAliases) >= 0 ? findIdx(descriptionAliases) : undefined,
    payerPayeeIndex: findIdx(payerPayeeAliases) >= 0 ? findIdx(payerPayeeAliases) : undefined,
  };
}

/**
 * Parses dates conservatively (YYYY-MM-DD or DD/MM/YYYY) into UTC start of day.
 */
export function parseBankDate(raw: string): Date {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new BadRequestException('Empty date field in CSV row');
  }

  // 1. YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s].*)?$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }
  }

  // Fallback: standard Date parsing
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0));
  }

  throw new BadRequestException(`Unparseable date in CSV: "${raw}"`);
}

/**
 * Strips currency symbols, thousands separators, and handles accounting brackets (x) -> -x.
 */
export function cleanDecimalString(raw: string | undefined | null): string {
  if (!raw) return '';
  let cleaned = raw.replace(/[,\sSAR$€£]/gi, '').trim();
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

/**
 * Determines transaction direction (INFLOW/OUTFLOW) and magnitude as Prisma.Decimal.
 * Returns null if row has zero amount (should be skipped).
 */
export function detectTransactionTypeAndAmount(
  row: string[],
  mapping: CsvHeaderMapping,
): { type: BankTransactionType; amount: Prisma.Decimal } | null {
  // Case 1: Separate debit and credit columns
  if (mapping.debitIndex !== undefined || mapping.creditIndex !== undefined) {
    const debitStr = mapping.debitIndex !== undefined ? cleanDecimalString(row[mapping.debitIndex]) : '';
    const creditStr = mapping.creditIndex !== undefined ? cleanDecimalString(row[mapping.creditIndex]) : '';

    let debitDecimal: Prisma.Decimal | null = null;
    let creditDecimal: Prisma.Decimal | null = null;

    if (debitStr) {
      try {
        debitDecimal = new Prisma.Decimal(debitStr).abs();
      } catch {
        throw new BadRequestException(`Invalid debit amount: "${debitStr}"`);
      }
    }

    if (creditStr) {
      try {
        creditDecimal = new Prisma.Decimal(creditStr).abs();
      } catch {
        throw new BadRequestException(`Invalid credit amount: "${creditStr}"`);
      }
    }

    const hasDebit = debitDecimal !== null && debitDecimal.greaterThan(0);
    const hasCredit = creditDecimal !== null && creditDecimal.greaterThan(0);

    if (hasDebit && hasCredit) {
      throw new BadRequestException('CSV row cannot contain both debit and credit amounts');
    }

    if (hasCredit) {
      return { type: BankTransactionType.INFLOW, amount: creditDecimal! };
    }
    if (hasDebit) {
      return { type: BankTransactionType.OUTFLOW, amount: debitDecimal! };
    }

    // Both are 0 or empty -> skip zero amount
    return null;
  }

  // Case 2: Single amount column
  if (mapping.amountIndex !== undefined) {
    const amtStr = cleanDecimalString(row[mapping.amountIndex]);
    if (!amtStr) return null;

    let decimalVal: Prisma.Decimal;
    try {
      decimalVal = new Prisma.Decimal(amtStr);
    } catch {
      throw new BadRequestException(`Invalid amount: "${amtStr}"`);
    }

    if (decimalVal.equals(0)) return null;

    // Check type/direction column if present
    if (mapping.typeIndex !== undefined) {
      const typeRaw = (row[mapping.typeIndex] || '').trim().toLowerCase();
      if (['credit', 'cr', 'inflow', 'deposit', '+'].includes(typeRaw)) {
        return { type: BankTransactionType.INFLOW, amount: decimalVal.abs() };
      } else if (['debit', 'dr', 'outflow', 'withdrawal', '-'].includes(typeRaw)) {
        return { type: BankTransactionType.OUTFLOW, amount: decimalVal.abs() };
      } else {
        throw new BadRequestException(`Unrecognized transaction direction/type: "${row[mapping.typeIndex]}"`);
      }
    }

    // Sign of amount determines direction
    if (decimalVal.isNegative()) {
      return { type: BankTransactionType.OUTFLOW, amount: decimalVal.abs() };
    } else {
      return { type: BankTransactionType.INFLOW, amount: decimalVal };
    }
  }

  return null;
}

/**
 * Computes SHA-256 fingerprint for a bank transaction row:
 * SHA256(companyId + bankAccountId + transactionDate + amount + type + reference + balanceAfter)
 */
export function buildBankTransactionFingerprint(params: {
  companyId: string;
  bankAccountId: string;
  transactionDate: Date;
  amount: Prisma.Decimal;
  type: BankTransactionType;
  reference?: string | null;
  balanceAfter?: Prisma.Decimal | null;
}): string {
  const dateStr = params.transactionDate.toISOString().slice(0, 10);
  const amountStr = params.amount.toFixed(4);
  const typeStr = params.type;
  const refStr = params.reference?.trim() || '';
  const balStr = params.balanceAfter ? params.balanceAfter.toFixed(4) : '';

  const raw = `${params.companyId}|${params.bankAccountId}|${dateStr}|${amountStr}|${typeStr}|${refStr}|${balStr}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}
