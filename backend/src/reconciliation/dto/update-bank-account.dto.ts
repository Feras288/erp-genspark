// =====================================================
// Phase 13A-B-2: UpdateBankAccountDto
// Validation for PATCH /api/reconciliation/bank-accounts/:id.
// Balances are immutable here; companyId from JWT only.
// =====================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateBankAccountDto {
  @ApiPropertyOptional({ example: 'Al Rajhi Bank' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  bankName?: string;

  @ApiPropertyOptional({ example: 'Main Operating Account' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountName?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'SA0380000000608010167519' })
  @IsOptional()
  @IsString()
  @Length(5, 34)
  iban?: string;

  @ApiPropertyOptional({ example: 'SAR' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Chart of accounts asset account ID' })
  @IsOptional()
  @IsString()
  glAccountId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
