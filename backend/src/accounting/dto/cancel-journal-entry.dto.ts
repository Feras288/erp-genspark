// Phase 6: Accounting Core — CANCEL journal entry DTO.
// DRAFT only. No reversing entry (out of scope this phase).
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelJournalEntryDto {
  @ApiPropertyOptional({ description: 'Reason for cancellation (audit).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
