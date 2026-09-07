// Phase 6: Accounting Core — POST journal entry DTO.
// POST is the explicit transition DRAFT → POSTED for double-entry commit.
// No money fields accepted — POST must use the already-existing lines.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PostJournalEntryDto {
  @ApiPropertyOptional({ description: 'Optional posting date override.' })
  @IsOptional()
  @IsString()
  entryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
