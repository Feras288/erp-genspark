// =====================================================
// Phase 14A-B-4: ClosePeriodDto
// Request body for POST /api/accounting/period-close/periods/close
// =====================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class ClosePeriodDto {
  @ApiProperty({
    example: '2026-01-01',
    description: 'Period start date (ISO date string)',
  })
  @IsNotEmpty()
  @IsDateString()
  periodStart!: string;

  @ApiProperty({
    example: '2026-01-31',
    description: 'Period end date (ISO date string)',
  })
  @IsNotEmpty()
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({
    example: 2026,
    description: 'Fiscal year',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fiscalYear?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Period number within the fiscal year',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  periodNumber?: number;

  @ApiPropertyOptional({
    example: 'Month-end January 2026 close',
    description: 'Optional notes for the period close',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
