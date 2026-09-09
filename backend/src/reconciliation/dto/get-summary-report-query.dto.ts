// =====================================================
// Phase 13A-B-6: GetSummaryReportQueryDto
// Query parameters for GET /api/reconciliation/reports/summary
// =====================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class GetSummaryReportQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by bank account ID (aggregates all if omitted)',
  })
  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'As-of date cutoff (default now/today)',
  })
  @IsOptional()
  @IsDateString()
  asOfDate?: string;
}
