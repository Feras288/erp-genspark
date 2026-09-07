// Phase 6: Accounting Core — query DTOs.
//
// `AccountingQueryDto` is used for chart-of-accounts listing (no companyId
// filter via body — companyId is always JWT).
//
// `JournalEntryQueryDto` filters journal entries by status / search.
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AccountType,
  JournalEntryStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AccountingQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Search by code or name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  // 'true' default to also include inactive; pass 'false' to only active.
  @ApiPropertyOptional({ description: 'Include inactive accounts (default true)' })
  @IsOptional()
  @Type(() => Boolean)
  @IsOptional()
  includeInactive?: boolean;

  @ApiPropertyOptional({ description: 'Filter to top-level only (no parent)' })
  @IsOptional()
  @Type(() => Boolean)
  @IsOptional()
  rootsOnly?: boolean;
}

export class JournalEntryQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'Search by entryNumber, description or notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: JournalEntryStatus })
  @IsOptional()
  @IsEnum(JournalEntryStatus)
  status?: JournalEntryStatus;
}
