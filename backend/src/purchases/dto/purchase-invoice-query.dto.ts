// Phase 5: Purchases Core — query DTO.
// Mirrors SalesInvoiceQueryDto. No `type` filter (Phase 5 has only one type).
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseInvoiceStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PurchaseInvoiceQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Search by invoiceNumber / notes' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: PurchaseInvoiceStatus })
  @IsOptional()
  @IsEnum(PurchaseInvoiceStatus)
  status?: PurchaseInvoiceStatus;

  @ApiPropertyOptional({ description: 'Filter by supplierId' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  supplierId?: string;
}
