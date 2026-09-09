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
import { AccountType, BankTransactionType, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { ImportStatementCsvDto } from './dto/import-statement-csv.dto';
import { UploadedCsvFile } from './types/reconciliation.types';
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
   * Stub: Unmatched reconciliation report.
   */
  async unmatchedReport(companyId: string) {
    return {
      status: 'ok',
      companyId,
      data: {
        unmatchedTransactions: [],
        unmatchedPayments: [],
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
}
