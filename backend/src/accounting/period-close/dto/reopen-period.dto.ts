// =====================================================
// Phase 14A-B-4: ReopenPeriodDto
// Request body for POST /api/accounting/period-close/periods/:id/reopen
// =====================================================
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ReopenPeriodDto {
  @ApiProperty({
    example: 'Correction needed for vendor invoice posting',
    description: 'Justification reason for reopening a closed period',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  reason!: string;
}
