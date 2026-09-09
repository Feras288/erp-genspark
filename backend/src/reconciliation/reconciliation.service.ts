// =====================================================
// Phase 13A-B-2: ReconciliationService
// Bank account CRUD skeleton with strict tenant isolation.
// No GL posting mutation. No direct floats for money math.
// =====================================================
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

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
}
