// =====================================================
// Phase 6: Accounting Core — Chart of Accounts create DTO.
// All money fields are server-side Decimal only.
// No tenant data accepted from body; companyId always from JWT.
// =====================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AccountType,
  NormalBalance,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export const ACCOUNT_CODE_REGEX = /^[A-Za-z0-9._\-]{1,32}$/;

export class CreateAccountDto {
  @ApiProperty({ example: '1000' })
  @IsString()
  @Length(1, 32)
  @Matches(ACCOUNT_CODE_REGEX, {
    message:
      'code must be 1..32 chars from [A-Za-z0-9._-] and unique per company',
  })
  code!: string;

  @ApiProperty({ example: 'Cash' })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiPropertyOptional({ example: 'النقدية' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiProperty({ enum: AccountType })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiProperty({ enum: NormalBalance })
  @IsEnum(NormalBalance)
  normalBalance!: NormalBalance;

  @ApiPropertyOptional({
    description: 'Optional parent account id (same company)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  parentId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
