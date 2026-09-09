// =====================================================
// Phase 13A-B-2: CreateBankAccountDto
// Validation for POST /api/reconciliation/bank-accounts.
// companyId always extracted from JWT.
// =====================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({ example: 'Al Rajhi Bank' })
  @IsString()
  @Length(1, 100)
  bankName!: string;

  @ApiProperty({ example: 'Main Operating Account' })
  @IsString()
  @Length(1, 100)
  accountName!: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  @Length(1, 50)
  accountNumber!: string;

  @ApiProperty({ example: 'SA0380000000608010167519' })
  @IsString()
  @Length(5, 34)
  iban!: string;

  @ApiPropertyOptional({ example: 'SAR', default: 'SAR' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Chart of accounts asset account ID' })
  @IsOptional()
  @IsString()
  glAccountId?: string;

  @ApiPropertyOptional({ example: '10000.0000', default: '0.0000' })
  @IsOptional()
  @IsString({ message: 'openingBalance must be a string (Decimal/18,4)' })
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'openingBalance must match /^\\d{1,14}(\\.\\d{1,4})?$/ (max 14 integer, max 4 fractional digits)',
  })
  openingBalance?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
