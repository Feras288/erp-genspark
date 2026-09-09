// =====================================================
// Phase 13A-B-3: ImportStatementCsvDto
// Validation for POST /api/reconciliation/statements/import-csv
// =====================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class ImportStatementCsvDto {
  @ApiPropertyOptional({ description: 'Target Bank Account ID' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  bankAccountId?: string;

  @ApiPropertyOptional({ example: 'STMT-2026-09' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  statementIdentifier?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: '10000.0000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'openingBalance must match /^\\d{1,14}(\\.\\d{1,4})?$/',
  })
  openingBalance?: string;

  @ApiPropertyOptional({ example: '15000.0000' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'closingBalance must match /^\\d{1,14}(\\.\\d{1,4})?$/',
  })
  closingBalance?: string;
}
