// =====================================================
// Phase 13A-B-4: GetSuggestionsQueryDto
// Query parameters for GET /api/reconciliation/suggestions
// =====================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GetSuggestionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by bank account ID' })
  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @ApiPropertyOptional({ description: 'Filter by specific bank transaction ID' })
  @IsOptional()
  @IsString()
  bankTransactionId?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ example: 80, default: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number = 80;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
