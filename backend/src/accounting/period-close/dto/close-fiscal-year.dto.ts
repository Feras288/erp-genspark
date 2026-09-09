// =====================================================
// Phase 14A-B-6: CloseFiscalYearDto
// Request body for POST /api/accounting/period-close/fiscal-years/close
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

export class CloseFiscalYearDto {
  @ApiProperty({ example: 2026, description: 'Fiscal year' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  fiscalYear!: number;

  @ApiProperty({
    example: '2026-01-01',
    description: 'Fiscal year start date (ISO date string)',
  })
  @IsNotEmpty()
  @IsDateString()
  fiscalYearStart!: string;

  @ApiProperty({
    example: '2026-12-31',
    description: 'Fiscal year end date (ISO date string)',
  })
  @IsNotEmpty()
  @IsDateString()
  fiscalYearEnd!: string;

  @ApiPropertyOptional({
    example: 'Year-end 2026 close',
    description: 'Optional notes for the fiscal year close',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
