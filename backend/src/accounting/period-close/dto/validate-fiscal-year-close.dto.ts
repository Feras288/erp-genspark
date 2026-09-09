// =====================================================
// Phase 14A-B-6: ValidateFiscalYearCloseDto
// Request body for POST /api/accounting/period-close/fiscal-years/validate
// =====================================================
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty } from 'class-validator';

export class ValidateFiscalYearCloseDto {
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
}
