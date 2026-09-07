// Phase 6: Accounting Core — Update Manual Journal Entry DTO.
//
// Used by PATCH /api/accounting/journal/:id. DRAFT only on the server.
// Same shape as create; all fields optional but lines, if provided,
// must still satisfy ≥2 / debit-or-credit / totals = totals.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { CreateJournalEntryDto } from './create-journal-entry.dto';

// We deliberately don't extend from CreateDto via PartialType because
// PartialType would relax the @ArrayMinSize(2) constraint, but the
// service still enforces ≥2 if `lines` is provided. Keeping it explicit.
export class UpdateJournalEntryDto {
  @ApiPropertyOptional()
  entryDate?: string;
  @ApiPropertyOptional()
  description?: string;
  @ApiPropertyOptional()
  reference?: string;
  @ApiPropertyOptional()
  notes?: string;
  @ApiPropertyOptional({ type: () => [Object] })
  lines?: unknown[];
}
