// Phase 6: Accounting Core — Manual Journal Entry create DTO.
//
// Constraints (server-enforced):
//   * Must have ≥2 lines (no single-sided entries).
//   * Each line has exactly one of (debit > 0) or (credit > 0).
//   * Total debit must equal total credit (server-side Decimal arithmetic).
//   * Each account in a line must be active, non-deleted, in same company.
//   * totals are NEVER sent in body — server computes them.
//
// Money regex: same DECIMAL_QTY_REGEX as purchases/18,4 scale,
// no percentage here since debit/credit are amounts.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const DECIMAL_MONEY_REGEX = /^\d{1,14}(\.\d{1,4})?$/;

export class CreateJournalEntryLineDto {
  @ApiProperty({ description: 'Account id for this line (same company).' })
  @IsString()
  @Length(1, 64)
  accountId!: string;

  @ApiPropertyOptional({
    description: 'Per-line memo / narration. 500 chars max.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: '100.0000', description: 'Debit amount (> 0).' })
  @IsNumberString()
  @Matches(DECIMAL_MONEY_REGEX, {
    message: 'debit must be a decimal up to 4 fractional digits',
  })
  debit!: string;

  @ApiProperty({ example: '0.0000', description: 'Credit amount (>= 0).' })
  @IsNumberString()
  @Matches(DECIMAL_MONEY_REGEX, {
    message: 'credit must be a decimal up to 4 fractional digits',
  })
  credit!: string;
}

export class CreateJournalEntryDto {
  @ApiPropertyOptional({ example: '2026-09-07' })
  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @ApiPropertyOptional({
    description: 'Header narrative / description (top-of-entry).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Optional external reference (e.g. doc id, invoice no).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @ApiPropertyOptional({ description: 'Internal notes.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ type: () => [CreateJournalEntryLineDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateJournalEntryLineDto)
  lines!: CreateJournalEntryLineDto[];
}
