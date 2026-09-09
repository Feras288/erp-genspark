// =====================================================
// Phase 14A-B-2: Period Close Query DTOs
// Validation for read-only period close query endpoints
// =====================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PeriodCloseAuditAction, PeriodCloseStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GetPeriodCloseStatusQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-15',
    description: 'ISO date to check status for. Defaults to current date UTC.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class GetPeriodClosesQueryDto {
  @ApiPropertyOptional({ example: 2026, description: 'Filter by fiscal year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fiscalYear?: number;

  @ApiPropertyOptional({
    enum: PeriodCloseStatus,
    description: 'Filter by period status (OPEN, CLOSING, CLOSED, REOPENED)',
  })
  @IsOptional()
  @IsEnum(PeriodCloseStatus)
  status?: PeriodCloseStatus;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Filter periods starting on or after this date',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Filter periods ending on or before this date',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 100;
}

export class GetFiscalYearClosesQueryDto {
  @ApiPropertyOptional({ example: 2026, description: 'Filter by fiscal year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fiscalYear?: number;

  @ApiPropertyOptional({
    enum: PeriodCloseStatus,
    description: 'Filter by fiscal year status (OPEN, CLOSING, CLOSED, REOPENED)',
  })
  @IsOptional()
  @IsEnum(PeriodCloseStatus)
  status?: PeriodCloseStatus;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class GetPeriodCloseAuditLogsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by period close ID' })
  @IsOptional()
  @IsString()
  periodCloseId?: string;

  @ApiPropertyOptional({ description: 'Filter by fiscal year close ID' })
  @IsOptional()
  @IsString()
  fiscalYearCloseId?: string;

  @ApiPropertyOptional({
    enum: PeriodCloseAuditAction,
    description: 'Filter by audit action',
  })
  @IsOptional()
  @IsEnum(PeriodCloseAuditAction)
  action?: PeriodCloseAuditAction;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 100;
}
