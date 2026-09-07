// Phase 5: Purchases Core — receive DTO.
// Optional overrides applied on DRAFT → RECEIVED transition.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReceivePurchaseInvoiceDto {
  @ApiPropertyOptional({ example: '2026-09-07' })
  @IsOptional()
  @IsISO8601()
  purchaseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
