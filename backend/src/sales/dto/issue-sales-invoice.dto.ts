// Phase 4B-1 skeleton: optional overrides when issuing a DRAFT invoice.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class IssueSalesInvoiceDto {
  @ApiPropertyOptional({ example: '2026-09-07' })
  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
