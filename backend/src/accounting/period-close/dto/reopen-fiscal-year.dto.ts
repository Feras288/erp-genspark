// =====================================================
// Phase 14A-B-6: ReopenFiscalYearDto
// Request body for POST /api/accounting/period-close/fiscal-years/:id/reopen
// =====================================================
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ReopenFiscalYearDto {
  @ApiProperty({
    example: 'Correction needed before year-end close',
    description: 'Justification reason for reopening a closed fiscal year',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  reason!: string;
}
