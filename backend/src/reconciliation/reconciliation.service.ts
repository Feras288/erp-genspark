// =====================================================
// Phase 13A: ReconciliationService
// Bank account CRUD and CSV statement import with duplicate detection.
// No GL posting mutation. No direct floats for money math.
// =====================================================
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, BankTransactionType, JournalEntryStatus, MatchType, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { ImportStatementCsvDto } from './dto/import-statement-csv.dto';
import { GetSuggestionsQueryDto } from './dto/get-suggestions-query.dto';
import { CreateReconciliationMatchDto } from './dto/create-reconciliation-match.dto';
import { GetUnmatchedReportQueryDto } from './dto/get-unmatched-report-query.dto';
import { GetSummaryReportQueryDto } from './dto/get-summary-report-query.dto';
import { UploadedCsvFile } from './types/reconciliation.types';
import { computeMatchScore, isDirectionCompatible } from './utils/matching-scorer';
import {
  buildBankTransactionFingerprint,
  cleanDecimalString,
  detectTransactionTypeAndAmount,
  mapCsvHeaders,
  parseBankDate,
  parseCsvRecords,
} from './utils/csv-parser';

const BANK_ACCOUNT_INCLUDE = {
  glAccount: {
    select: {
      id: true,
      code: true,
      name: true,
      nameAr: true,
      type: true,
    },
  },
} as const;

function parseDateStartUtc(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  if (dateStr.length === 10) {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
  return d;
}

function parseDateEndUtc(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  if (dateStr.length === 10) {
    return new Date(`${dateStr}T23:59:59.999Z`);
  }
  return d;
}

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all active, non-deleted bank accounts for the tenant company.
   */
  async listBankAccounts(companyId: string) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: {
        companyId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: BANK_ACCOUNT_INCLUDE,
    });

    return {
      status: 'ok',
      companyId,
      data: accounts,
    };
  }

  /**
   * Create a new bank account scoped to companyId.
   */
  async createBankAccount(companyId: string, dto: CreateBankAccountDto) {
    // Check IBAN uniqueness within company for non-deleted accounts
    const existing = await this.prisma.bankAccount.findFirst({
      where: {
        companyId,
        iban: dto.iban,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Bank account with IBAN "${dto.iban}" already exists for this company`,
      );
    }

    // Validate GL account if specified
    if (dto.glAccountId) {
      const glAccount = await this.prisma.account.findFirst({
        where: {
          id: dto.glAccountId,
          companyId,
          deletedAt: null,
        },
      });

      if (!glAccount) {
        throw new BadRequestException(
          `GL account with id "${dto.glAccountId}" not found for this company`,
        );
      }

      if (glAccount.type !== AccountType.ASSET) {
        throw new BadRequestException(
          `GL account must be of type ASSET, received ${glAccount.type}`,
        );
      }
    }

    // Parse decimal safely with Prisma.Decimal
    let openingDecimal = new Prisma.Decimal('0.0000');
    if (dto.openingBalance) {
      try {
        openingDecimal = new Prisma.Decimal(dto.openingBalance);
      } catch {
        throw new BadRequestException('Invalid openingBalance decimal value');
      }
    }

    const created = await this.prisma.bankAccount.create({
      data: {
        companyId,
        bankName: dto.bankName,
        accountName: dto.accountName,
        accountNumber: dto.accountNumber,
        iban: dto.iban,
        currency: dto.currency || 'SAR',
        glAccountId: dto.glAccountId || null,
        openingBalance: openingDecimal,
        currentBalance: openingDecimal,
        isActive: dto.isActive ?? true,
      },
      include: BANK_ACCOUNT_INCLUDE,
    });

    return {
      status: 'ok',
      companyId,
      data: created,
    };
  }

  /**
   * Update an existing bank account.
   */
  async updateBankAccount(companyId: string, id: string, dto: UpdateBankAccountDto) {
    const existing = await this.prisma.bankAccount.findFirst({
      where: {
        id,
        companyId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Bank account with id "${id}" not found`);
    }

    // If IBAN is changed, ensure no conflict within non-deleted company accounts
    if (dto.iban && dto.iban !== existing.iban) {
      const duplicate = await this.prisma.bankAccount.findFirst({
        where: {
          companyId,
          iban: dto.iban,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (duplicate) {
        throw new ConflictException(
          `Bank account with IBAN "${dto.iban}" already exists for this company`,
        );
      }
    }

    // Validate GL account if specified
    if (dto.glAccountId) {
      const glAccount = await this.prisma.account.findFirst({
        where: {
          id: dto.glAccountId,
          companyId,
          deletedAt: null,
        },
      });

      if (!glAccount) {
        throw new BadRequestException(
          `GL account with id "${dto.glAccountId}" not found for this company`,
        );
      }

      if (glAccount.type !== AccountType.ASSET) {
        throw new BadRequestException(
          `GL account must be of type ASSET, received ${glAccount.type}`,
        );
      }
    }

    const updated = await this.prisma.bankAccount.update({
      where: { id },
      data: {
        ...(dto.bankName !== undefined && { bankName: dto.bankName }),
        ...(dto.accountName !== undefined && { accountName: dto.accountName }),
        ...(dto.accountNumber !== undefined && { accountNumber: dto.accountNumber }),
        ...(dto.iban !== undefined && { iban: dto.iban }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.glAccountId !== undefined && { glAccountId: dto.glAccountId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: BANK_ACCOUNT_INCLUDE,
    });

    return {
      status: 'ok',
      companyId,
      data: updated,
    };
  }

  /**
   * Soft-delete a bank account (set deletedAt and isActive = false).
   */
  async deleteBankAccount(companyId: string, id: string) {
    const existing = await this.prisma.bankAccount.findFirst({
      where: {
        id,
        companyId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Bank account with id "${id}" not found`);
    }

    await this.prisma.bankAccount.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return {
      status: 'ok',
      companyId,
      data: { id, deleted: true },
    };
  }

  /**
   * Stub: List bank transactions for company.
   */
  async listBankTransactions(companyId: string) {
    const transactions = await this.prisma.bankTransaction.findMany({
      where: { companyId },
      take: 50,
      orderBy: { transactionDate: 'desc' },
    });

    return {
      status: 'ok',
      companyId,
      data: transactions,
    };
  }

  /**
   * Unmatched reconciliation report: returns unmatched bank transactions,
   * unmatched posted ERP payments, and summary totals.
   * Read-only. Does not mutate database records.
   */
  async unmatchedReport(companyId: string, dto?: GetUnmatchedReportQueryDto) {
    const limit = Math.min(dto?.limit ?? 100, 200);
    const fromStart = parseDateStartUtc(dto?.fromDate);
    const toEnd = parseDateEndUtc(dto?.toDate);

    // 1. Unmatched bank transactions
    const bankTransactions = await this.prisma.bankTransaction.findMany({
      where: {
        companyId,
        status: 'UNMATCHED',
        ...(dto?.bankAccountId && { bankAccountId: dto.bankAccountId }),
        ...((fromStart || toEnd) && {
          transactionDate: {
            ...(fromStart && { gte: fromStart }),
            ...(toEnd && { lte: toEnd }),
          },
        }),
      },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    // 2. Exclude actively matched payments (unmatchedAt IS NULL)
    const activeMatches = await this.prisma.reconciliationMatch.findMany({
      where: {
        companyId,
        unmatchedAt: null,
      },
      select: { paymentId: true },
    });
    const matchedPaymentIds = new Set(activeMatches.map((m) => m.paymentId));

    // 3. Unmatched posted ERP payments
    const payments = await this.prisma.payment.findMany({
      where: {
        companyId,
        status: 'POSTED',
        deletedAt: null,
        id: { notIn: Array.from(matchedPaymentIds) },
        ...((fromStart || toEnd) && {
          paidAt: {
            ...(fromStart && { gte: fromStart }),
            ...(toEnd && { lte: toEnd }),
          },
        }),
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    // 4. Compute totals
    let unmatchedBankInflow = new Prisma.Decimal('0.0000');
    let unmatchedBankOutflow = new Prisma.Decimal('0.0000');
    let unmatchedArPayments = new Prisma.Decimal('0.0000');
    let unmatchedApPayments = new Prisma.Decimal('0.0000');

    for (const tx of bankTransactions) {
      if (tx.type === 'INFLOW') {
        unmatchedBankInflow = unmatchedBankInflow.plus(tx.amount);
      } else {
        unmatchedBankOutflow = unmatchedBankOutflow.plus(tx.amount);
      }
    }

    for (const p of payments) {
      if (p.invoiceType === 'SALES') {
        unmatchedArPayments = unmatchedArPayments.plus(p.amount);
      } else {
        unmatchedApPayments = unmatchedApPayments.plus(p.amount);
      }
    }

    const filters = {
      bankAccountId: dto?.bankAccountId || null,
      fromDate: dto?.fromDate || null,
      toDate: dto?.toDate || null,
      limit,
    };

    return {
      status: 'ok',
      companyId,
      filters,
      data: {
        bankTransactions: bankTransactions.map((tx) => ({
          id: tx.id,
          bankAccountId: tx.bankAccountId,
          transactionDate: tx.transactionDate.toISOString(),
          type: tx.type,
          amount: tx.amount.toFixed(4),
          reference: tx.reference,
          description: tx.description,
          payerPayee: tx.payerPayee,
          status: tx.status,
        })),
        payments: payments.map((p) => ({
          id: p.id,
          invoiceType: p.invoiceType,
          amount: p.amount.toFixed(4),
          paidAt: p.paidAt.toISOString(),
          reference: p.reference,
          status: p.status,
        })),
        totals: {
          unmatchedBankInflow: unmatchedBankInflow.toFixed(4),
          unmatchedBankOutflow: unmatchedBankOutflow.toFixed(4),
          unmatchedArPayments: unmatchedArPayments.toFixed(4),
          unmatchedApPayments: unmatchedApPayments.toFixed(4),
          unmatchedBankCount: bankTransactions.length,
          unmatchedPaymentCount: payments.length,
        },
      },
    };
  }

  /**
   * Reconciliation summary report:
   * Computes bankBalance (from latest bank statements or opening/current balance),
   * bookBalance (from linked GL accounts in posted journal entries),
   * variance (bookBalance - bankBalance),
   * and unmatched counts & amounts.
   * Read-only. Does not mutate database records.
   */
  async summaryReport(companyId: string, dto?: GetSummaryReportQueryDto) {
    const asOfEnd = parseDateEndUtc(dto?.asOfDate) ?? new Date();
    const warnings: string[] = [];

    // 1. Fetch target bank accounts
    const bankAccounts = await this.prisma.bankAccount.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        ...(dto?.bankAccountId && { id: dto.bankAccountId }),
      },
      include: {
        glAccount: { select: { id: true, code: true, name: true } },
      },
    });

    if (dto?.bankAccountId && bankAccounts.length === 0) {
      throw new NotFoundException(
        `Bank account with id "${dto.bankAccountId}" not found for this company`,
      );
    }

    // 2. Bank balance calculation
    let bankBalance = new Prisma.Decimal('0.0000');

    for (const acc of bankAccounts) {
      const latestStatement = await this.prisma.bankStatement.findFirst({
        where: {
          companyId,
          bankAccountId: acc.id,
          endDate: { lte: asOfEnd },
        },
        orderBy: [{ endDate: 'desc' }, { importedAt: 'desc' }],
      });

      if (latestStatement) {
        bankBalance = bankBalance.plus(latestStatement.closingBalance);
      } else {
        const fallback = !acc.currentBalance.isZero()
          ? acc.currentBalance
          : acc.openingBalance;
        bankBalance = bankBalance.plus(fallback);
      }
    }

    // 3. Book balance calculation from linked GL accounts
    let bookBalance = new Prisma.Decimal('0.0000');
    const linkedGlAccounts = bankAccounts.filter((a) => Boolean(a.glAccountId));
    const unlinkedAccounts = bankAccounts.filter((a) => !a.glAccountId);

    if (unlinkedAccounts.length > 0) {
      if (bankAccounts.length === 1) {
        warnings.push(
          `Bank account "${bankAccounts[0].accountName}" has no linked GL account; book balance is 0.0000`,
        );
      } else {
        warnings.push(
          `${unlinkedAccounts.length} bank account(s) have no linked GL account`,
        );
      }
    }

    if (linkedGlAccounts.length > 0) {
      const glAccountIds = linkedGlAccounts.map((a) => a.glAccountId as string);

      const lines = await this.prisma.journalEntryLine.findMany({
        where: {
          companyId,
          entry: {
            companyId,
            status: JournalEntryStatus.POSTED,
            entryDate: { lte: asOfEnd },
          },
          OR: [
            { debitAccountId: { in: glAccountIds } },
            { creditAccountId: { in: glAccountIds } },
          ],
        },
        select: {
          debit: true,
          credit: true,
          debitAccountId: true,
          creditAccountId: true,
        },
      });

      const glAccountSet = new Set(glAccountIds);
      let totalDebits = new Prisma.Decimal('0.0000');
      let totalCredits = new Prisma.Decimal('0.0000');

      for (const line of lines) {
        if (line.debitAccountId && glAccountSet.has(line.debitAccountId)) {
          totalDebits = totalDebits.plus(line.debit);
        }
        if (line.creditAccountId && glAccountSet.has(line.creditAccountId)) {
          totalCredits = totalCredits.plus(line.credit);
        }
      }

      // Cash/Bank is an Asset with normal balance DEBIT: Debits - Credits
      bookBalance = totalDebits.minus(totalCredits);
    }

    // 4. Variance = bookBalance - bankBalance
    const variance = bookBalance.minus(bankBalance);

    // 5. Unmatched items up to asOfEnd
    const targetAccountIds = bankAccounts.map((a) => a.id);

    const activeMatches = await this.prisma.reconciliationMatch.findMany({
      where: {
        companyId,
        unmatchedAt: null,
      },
      select: { paymentId: true },
    });
    const matchedPaymentIds = new Set(activeMatches.map((m) => m.paymentId));

    const [unmatchedTxs, unmatchedPayments] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where: {
          companyId,
          status: 'UNMATCHED',
          bankAccountId: { in: targetAccountIds },
          transactionDate: { lte: asOfEnd },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          companyId,
          status: 'POSTED',
          deletedAt: null,
          id: { notIn: Array.from(matchedPaymentIds) },
          paidAt: { lte: asOfEnd },
        },
      }),
    ]);

    let bankInflow = new Prisma.Decimal('0.0000');
    let bankOutflow = new Prisma.Decimal('0.0000');
    let arPayments = new Prisma.Decimal('0.0000');
    let apPayments = new Prisma.Decimal('0.0000');

    for (const tx of unmatchedTxs) {
      if (tx.type === 'INFLOW') {
        bankInflow = bankInflow.plus(tx.amount);
      } else {
        bankOutflow = bankOutflow.plus(tx.amount);
      }
    }

    for (const p of unmatchedPayments) {
      if (p.invoiceType === 'SALES') {
        arPayments = arPayments.plus(p.amount);
      } else {
        apPayments = apPayments.plus(p.amount);
      }
    }

    const filters = {
      bankAccountId: dto?.bankAccountId || null,
      asOfDate: dto?.asOfDate || null,
    };

    return {
      status: 'ok',
      companyId,
      filters,
      data: {
        bankBalance: bankBalance.toFixed(4),
        bookBalance: bookBalance.toFixed(4),
        variance: variance.toFixed(4),
        unmatchedCounts: {
          bankTransactions: unmatchedTxs.length,
          payments: unmatchedPayments.length,
        },
        unmatchedAmounts: {
          bankInflow: bankInflow.toFixed(4),
          bankOutflow: bankOutflow.toFixed(4),
          arPayments: arPayments.toFixed(4),
          apPayments: apPayments.toFixed(4),
        },
        warnings,
      },
    };
  }

  /**
   * Import bank statement CSV with row normalization, duplicate detection,
   * and atomic persistence under a single Prisma transaction.
   */
  async importStatementCsv(
    companyId: string,
    userId: string | undefined,
    file: UploadedCsvFile | undefined,
    bankAccountId: string | undefined,
    dto: ImportStatementCsvDto,
  ) {
    if (!bankAccountId) {
      throw new BadRequestException('bankAccountId is required');
    }

    // 1. Validate bank account belongs to company and is active/not deleted
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: {
        id: bankAccountId,
        companyId,
        deletedAt: null,
      },
    });

    if (!bankAccount) {
      throw new NotFoundException(
        `Bank account with id "${bankAccountId}" not found for this company`,
      );
    }

    // 2. Validate uploaded file
    if (!file || !file.buffer) {
      throw new BadRequestException('CSV file is required');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File exceeds maximum size of 5 MB');
    }

    const isCsvMime =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/plain';
    const isCsvExt =
      file.originalname && file.originalname.toLowerCase().endsWith('.csv');

    if (!isCsvMime && !isCsvExt) {
      throw new BadRequestException('Uploaded file must be a CSV file (.csv)');
    }

    // 3. Duplicate detection via SHA-256 fileHash
    const fileHash = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    const existingStatement = await this.prisma.bankStatement.findFirst({
      where: {
        companyId,
        fileHash,
      },
    });

    if (existingStatement) {
      throw new ConflictException(
        'This bank statement has already been imported for this company',
      );
    }

    // 4. Tokenize CSV records
    const csvText = file.buffer.toString('utf-8');
    const records = parseCsvRecords(csvText);

    if (records.length < 2) {
      throw new BadRequestException(
        'CSV file must contain a header row and at least one data row',
      );
    }

    const headerMapping = mapCsvHeaders(records[0]);
    const dataRows = records.slice(1);

    const valDateIdx = headerMapping.valueDateIndex;
    const balIdx = headerMapping.balanceIndex;
    const refIdx = headerMapping.referenceIndex;
    const descIdx = headerMapping.descriptionIndex;
    const ppIdx = headerMapping.payerPayeeIndex;

    const transactionsData: Array<{
      companyId: string;
      bankAccountId: string;
      transactionDate: Date;
      valueDate: Date | null;
      type: BankTransactionType;
      amount: Prisma.Decimal;
      balanceAfter: Prisma.Decimal | null;
      reference: string | null;
      description: string | null;
      payerPayee: string | null;
      fingerprint: string;
      status: 'UNMATCHED';
    }> = [];

    let skippedRows = 0;
    const seenFingerprintsInFile = new Set<string>();

    for (const row of dataRows) {
      if (row.length === 0 || row.every((c) => !c.trim())) {
        skippedRows++;
        continue;
      }

      const dateStr = row[headerMapping.dateIndex];
      if (!dateStr || !dateStr.trim()) {
        throw new BadRequestException('Date field cannot be empty in CSV data row');
      }
      const transactionDate = parseBankDate(dateStr);

      let valueDate: Date | null = null;
      if (valDateIdx !== undefined && row[valDateIdx]) {
        try {
          valueDate = parseBankDate(row[valDateIdx]);
        } catch {
          valueDate = null;
        }
      }

      const detected = detectTransactionTypeAndAmount(row, headerMapping);
      if (!detected) {
        // Zero-amount or empty row -> skip
        skippedRows++;
        continue;
      }

      const txType: BankTransactionType = detected.type;
      const txAmount: Prisma.Decimal = detected.amount;

      let balanceAfter: Prisma.Decimal | null = null;
      if (balIdx !== undefined && row[balIdx]) {
        const balStr = cleanDecimalString(row[balIdx]);
        if (balStr) {
          try {
            balanceAfter = new Prisma.Decimal(balStr);
          } catch {
            balanceAfter = null;
          }
        }
      }

      const reference =
        refIdx !== undefined && row[refIdx] ? row[refIdx].trim() : null;

      const description =
        descIdx !== undefined && row[descIdx] ? row[descIdx].trim() : null;

      const payerPayee =
        ppIdx !== undefined && row[ppIdx] ? row[ppIdx].trim() : null;

      const fingerprint = buildBankTransactionFingerprint({
        companyId,
        bankAccountId,
        transactionDate,
        amount: txAmount,
        type: txType,
        reference,
        balanceAfter,
      });

      if (seenFingerprintsInFile.has(fingerprint)) {
        skippedRows++;
        continue;
      }
      seenFingerprintsInFile.add(fingerprint);

      transactionsData.push({
        companyId,
        bankAccountId,
        transactionDate,
        valueDate,
        type: txType,
        amount: txAmount,
        balanceAfter,
        reference,
        description,
        payerPayee,
        fingerprint,
        status: 'UNMATCHED',
      });
    }

    if (transactionsData.length === 0) {
      throw new BadRequestException(
        'No valid transactions found in the imported CSV file',
      );
    }

    // 5. Compute aggregate metrics
    let totalInflow = new Prisma.Decimal('0.0000');
    let totalOutflow = new Prisma.Decimal('0.0000');
    let minDate = transactionsData[0].transactionDate;
    let maxDate = transactionsData[0].transactionDate;

    for (const tx of transactionsData) {
      if (tx.type === 'INFLOW') {
        totalInflow = totalInflow.plus(tx.amount);
      } else {
        totalOutflow = totalOutflow.plus(tx.amount);
      }

      if (tx.transactionDate < minDate) {
        minDate = tx.transactionDate;
      }
      if (tx.transactionDate > maxDate) {
        maxDate = tx.transactionDate;
      }
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : minDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : maxDate;

    let openingDecimal = new Prisma.Decimal('0.0000');
    if (dto.openingBalance) {
      openingDecimal = new Prisma.Decimal(dto.openingBalance);
    }

    let closingDecimal = openingDecimal.plus(totalInflow).minus(totalOutflow);
    if (dto.closingBalance) {
      closingDecimal = new Prisma.Decimal(dto.closingBalance);
    } else {
      const reversedTxs = [...transactionsData].reverse();
      const lastWithBalance = reversedTxs.find((t) => t.balanceAfter !== null);
      if (lastWithBalance && lastWithBalance.balanceAfter !== null) {
        closingDecimal = lastWithBalance.balanceAfter;
      }
    }

    // 6. Atomically persist statement and transactions
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const statement = await tx.bankStatement.create({
          data: {
            companyId,
            bankAccountId,
            statementIdentifier: dto.statementIdentifier || null,
            startDate,
            endDate,
            openingBalance: openingDecimal,
            closingBalance: closingDecimal,
            totalInflow,
            totalOutflow,
            rawFileName: file.originalname || 'statement.csv',
            fileHash,
            status: 'DRAFT',
            importedById: userId || null,
          },
        });

        const transactionsToInsert = transactionsData.map((t) => ({
          ...t,
          statementId: statement.id,
        }));

        const insertResult = await tx.bankTransaction.createMany({
          data: transactionsToInsert,
          skipDuplicates: true,
        });

        const duplicateRows = transactionsToInsert.length - insertResult.count;

        return {
          statementId: statement.id,
          bankAccountId,
          fileHash,
          importedRows: insertResult.count,
          skippedRows,
          duplicateRows,
          totalInflow: totalInflow.toFixed(4),
          totalOutflow: totalOutflow.toFixed(4),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        };
      });

      return {
        status: 'ok',
        companyId,
        data: result,
      };
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException(
          'This bank statement has already been imported for this company',
        );
      }
      throw err;
    }
  }

  /**
   * Deterministic matching suggestions between unmatched bank transactions
   * and posted payments for the company.
   * Read-only. Does not mutate or create matches.
   */
  async getMatchingSuggestions(
    companyId: string,
    dto: GetSuggestionsQueryDto,
  ) {
    const minScore = dto.minScore ?? 80;
    const limit = Math.min(dto.limit ?? 50, 100);

    // 1. Fetch target unmatched bank transactions
    const bankTransactions = await this.prisma.bankTransaction.findMany({
      where: {
        companyId,
        status: 'UNMATCHED',
        ...(dto.bankAccountId && { bankAccountId: dto.bankAccountId }),
        ...(dto.bankTransactionId && { id: dto.bankTransactionId }),
        ...((dto.fromDate || dto.toDate) && {
          transactionDate: {
            ...(dto.fromDate && { gte: new Date(dto.fromDate) }),
            ...(dto.toDate && { lte: new Date(dto.toDate) }),
          },
        }),
      },
      orderBy: { transactionDate: 'desc' },
      take: limit,
    });

    const filters = {
      bankAccountId: dto.bankAccountId || null,
      bankTransactionId: dto.bankTransactionId || null,
      fromDate: dto.fromDate || null,
      toDate: dto.toDate || null,
      minScore,
      limit,
    };

    if (bankTransactions.length === 0) {
      return {
        status: 'ok',
        companyId,
        filters,
        data: [],
      };
    }

    // 2. Determine payments already actively matched (unmatchedAt IS NULL)
    const activeMatches = await this.prisma.reconciliationMatch.findMany({
      where: {
        companyId,
        unmatchedAt: null,
      },
      select: { paymentId: true },
    });
    const matchedPaymentIds = new Set(activeMatches.map((m) => m.paymentId));

    // 3. Fetch candidate posted payments
    const payments = await this.prisma.payment.findMany({
      where: {
        companyId,
        status: 'POSTED',
        deletedAt: null,
        id: { notIn: Array.from(matchedPaymentIds) },
      },
      include: {
        salesInvoice: { select: { invoiceNumber: true } },
        purchaseInvoice: { select: { invoiceNumber: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 500,
    });

    // 4. Calculate score for each compatible transaction/payment pair
    const results: Array<{
      bankTransaction: {
        id: string;
        transactionDate: string;
        type: string;
        amount: string;
        reference: string | null;
        description: string | null;
        payerPayee: string | null;
      };
      candidates: Array<{
        paymentId: string;
        invoiceType: string;
        amount: string;
        paidAt: string;
        reference: string | null;
        score: number;
        matchType: 'EXACT' | 'SUGGESTED';
        reasons: string[];
      }>;
    }> = [];

    for (const bankTx of bankTransactions) {
      const candidates: Array<{
        paymentId: string;
        invoiceType: string;
        amount: string;
        paidAt: string;
        reference: string | null;
        score: number;
        matchType: 'EXACT' | 'SUGGESTED';
        reasons: string[];
      }> = [];

      for (const payment of payments) {
        if (!isDirectionCompatible(bankTx.type, payment.invoiceType)) {
          continue;
        }

        const scoreResult = computeMatchScore({
          bankAmount: bankTx.amount,
          paymentAmount: payment.amount,
          bankDate: bankTx.transactionDate,
          paymentDate: payment.paidAt,
          bankReference: bankTx.reference,
          bankDescription: bankTx.description,
          bankPayerPayee: bankTx.payerPayee,
          paymentReference: payment.reference,
          paymentNotes: payment.notes,
          invoiceNumber:
            payment.salesInvoice?.invoiceNumber ||
            payment.purchaseInvoice?.invoiceNumber,
        });

        if (scoreResult.score >= minScore) {
          candidates.push({
            paymentId: payment.id,
            invoiceType: payment.invoiceType,
            amount: payment.amount.toFixed(4),
            paidAt: payment.paidAt.toISOString(),
            reference: payment.reference,
            score: scoreResult.score,
            matchType: scoreResult.matchType,
            reasons: scoreResult.reasons,
          });
        }
      }

      // Sort candidates by score descending
      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length > 0 || dto.bankTransactionId) {
        results.push({
          bankTransaction: {
            id: bankTx.id,
            transactionDate: bankTx.transactionDate.toISOString(),
            type: bankTx.type,
            amount: bankTx.amount.toFixed(4),
            reference: bankTx.reference,
            description: bankTx.description,
            payerPayee: bankTx.payerPayee,
          },
          candidates,
        });
      }
    }

    return {
      status: 'ok',
      companyId,
      filters,
      data: results,
    };
  }

  /**
   * Manual match between an unmatched bank transaction and a posted payment.
   * Transactional: creates ReconciliationMatch and marks BankTransaction as MATCHED.
   * Does NOT update Payment.status.
   * Does NOT mutate JournalEntry or JournalEntryLine.
   */
  async createMatch(
    companyId: string,
    userId: string,
    dto: CreateReconciliationMatchDto,
  ) {
    // 1. Validate BankTransaction
    const bankTx = await this.prisma.bankTransaction.findFirst({
      where: {
        id: dto.bankTransactionId,
        companyId,
      },
    });

    if (!bankTx) {
      throw new NotFoundException(
        `Bank transaction with id "${dto.bankTransactionId}" not found`,
      );
    }

    if (bankTx.status !== 'UNMATCHED') {
      throw new ConflictException(
        `Bank transaction is already matched (status: ${bankTx.status})`,
      );
    }

    // 2. Validate Payment
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: dto.paymentId,
        companyId,
        deletedAt: null,
      },
      include: {
        salesInvoice: { select: { invoiceNumber: true } },
        purchaseInvoice: { select: { invoiceNumber: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException(
        `Payment with id "${dto.paymentId}" not found`,
      );
    }

    if (payment.status !== 'POSTED') {
      throw new BadRequestException(
        `Payment must be POSTED to be matched (current status: ${payment.status})`,
      );
    }

    // Check if payment is already actively matched
    const activePaymentMatch = await this.prisma.reconciliationMatch.findFirst({
      where: {
        companyId,
        paymentId: dto.paymentId,
        unmatchedAt: null,
      },
    });

    if (activePaymentMatch) {
      throw new ConflictException(
        `Payment is already actively matched in reconciliation match "${activePaymentMatch.id}"`,
      );
    }

    // 3. Direction compatibility
    if (!isDirectionCompatible(bankTx.type, payment.invoiceType)) {
      throw new BadRequestException(
        `Direction incompatible: bank transaction is ${bankTx.type} but payment invoiceType is ${payment.invoiceType}`,
      );
    }

    // 4. Amount equality
    if (!bankTx.amount.equals(payment.amount)) {
      throw new ConflictException(
        `Amount mismatch: bank transaction amount (${bankTx.amount.toFixed(4)}) does not equal payment amount (${payment.amount.toFixed(4)})`,
      );
    }

    // 5. Confidence score
    const matchType = dto.matchType || MatchType.MANUAL;
    let confidenceScore: number | null = null;
    if (matchType === MatchType.EXACT || matchType === MatchType.SUGGESTED) {
      const scoreResult = computeMatchScore({
        bankAmount: bankTx.amount,
        paymentAmount: payment.amount,
        bankDate: bankTx.transactionDate,
        paymentDate: payment.paidAt,
        bankReference: bankTx.reference,
        bankDescription: bankTx.description,
        bankPayerPayee: bankTx.payerPayee,
        paymentReference: payment.reference,
        paymentNotes: payment.notes,
        invoiceNumber:
          payment.salesInvoice?.invoiceNumber ||
          payment.purchaseInvoice?.invoiceNumber,
      });
      confidenceScore = scoreResult.score;
    }

    // 6. Transactional persistence
    try {
      const match = await this.prisma.$transaction(async (tx) => {
        const created = await tx.reconciliationMatch.create({
          data: {
            companyId,
            bankTransactionId: bankTx.id,
            paymentId: payment.id,
            amount: bankTx.amount,
            matchType,
            confidenceScore,
            notes: dto.notes || null,
            matchedById: userId || null,
          },
        });

        await tx.bankTransaction.update({
          where: { id: bankTx.id },
          data: { status: 'MATCHED' },
        });

        return created;
      });

      return {
        status: 'ok',
        companyId,
        data: {
          matchId: match.id,
          bankTransactionId: match.bankTransactionId,
          paymentId: match.paymentId,
          amount: match.amount.toFixed(4),
          matchType: match.matchType,
          confidenceScore: match.confidenceScore,
          matchedAt: match.matchedAt.toISOString(),
        },
      };
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException(
          'This bank transaction or payment is already actively matched',
        );
      }
      throw err;
    }
  }

  /**
   * Soft-unmatch an active reconciliation match.
   * Marks ReconciliationMatch as unmatched (unmatchedAt, unmatchedById).
   * Returns related BankTransaction to UNMATCHED status.
   * Does NOT delete the match row.
   * Does NOT update Payment.status.
   * Does NOT mutate JournalEntry or JournalEntryLine.
   */
  async unmatch(companyId: string, userId: string, matchId: string) {
    const match = await this.prisma.reconciliationMatch.findFirst({
      where: {
        id: matchId,
        companyId,
        unmatchedAt: null,
      },
    });

    if (!match) {
      throw new NotFoundException(
        `Active reconciliation match with id "${matchId}" not found`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.reconciliationMatch.update({
        where: { id: match.id },
        data: {
          unmatchedAt: new Date(),
          unmatchedById: userId || null,
        },
      });

      await tx.bankTransaction.update({
        where: { id: match.bankTransactionId },
        data: { status: 'UNMATCHED' },
      });

      return updated;
    });

    return {
      status: 'ok',
      companyId,
      data: {
        matchId: result.id,
        bankTransactionId: result.bankTransactionId,
        paymentId: result.paymentId,
        unmatchedAt: result.unmatchedAt!.toISOString(),
      },
    };
  }
}

