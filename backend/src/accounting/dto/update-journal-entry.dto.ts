// Phase 6: Accounting Core — Update Manual Journal Entry DTO.
//
// Used by PATCH /api/accounting/journal/:id. DRAFT only on the server.
// Same shape as create; all fields optional but lines, if provided,
// must still satisfy ≥2 / debit-or-credit / totals = totals.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateJournalEntryLineDto } from './create-journal-entry.dto';

// We deliberately don't extend from CreateDto via PartialType because
// PartialType would relax the @ArrayMinSize(2) constraint, but the
// service still enforces ≥2 if `lines` is provided. Keeping it explicit.
//
// class-validator decorators are required here so the global ValidationPipe
// (`whitelist: true, forbidNonWhitelisted: true, transform: true`) accepts
// these properties; without them, the pipe forbids every property in the
// body with "property X should not exist".
export class UpdateJournalEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ type: () => [CreateJournalEntryLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateJournalEntryLineDto)
  lines?: CreateJournalEntryLineDto[];
}
