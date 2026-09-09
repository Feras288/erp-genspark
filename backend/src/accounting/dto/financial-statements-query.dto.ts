// =====================================================
// Phase 12A-B-1: Financial statements query DTOs (skeleton).
//
// companyId is never accepted from query/body — JWT only.
// Date parsing and fiscal-year defaults land in 12A-B-2+.
// =====================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class TrialBalanceQueryDto {
  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Inclusive lower-bound ISO date (YYYY-MM-DD). Skeleton only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Inclusive upper-bound ISO date (YYYY-MM-DD). Skeleton only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  toDate?: string;

  @ApiPropertyOptional({
    description:
      'When true, later 12A-B-2 includes zero-activity accounts. Default false.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeZero?: boolean;
}

export class IncomeStatementQueryDto {
  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Inclusive period start (YYYY-MM-DD). Skeleton only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Inclusive period end (YYYY-MM-DD). Skeleton only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  toDate?: string;
}

export class BalanceSheetQueryDto {
  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'As-of ISO date (YYYY-MM-DD). Skeleton only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  asOfDate?: string;
}
