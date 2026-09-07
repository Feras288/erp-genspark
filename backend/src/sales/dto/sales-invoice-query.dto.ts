// Phase 4B-1 skeleton: query DTO for GET /api/sales/invoices
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SalesInvoiceStatus, SalesInvoiceType } from '@prisma/client';
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

export class SalesInvoiceQueryDto {
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

  @ApiPropertyOptional({ enum: SalesInvoiceStatus })
  @IsOptional()
  @IsEnum(SalesInvoiceStatus)
  status?: SalesInvoiceStatus;

  @ApiPropertyOptional({ enum: SalesInvoiceType })
  @IsOptional()
  @IsEnum(SalesInvoiceType)
  type?: SalesInvoiceType;

  @ApiPropertyOptional({ description: 'Filter by customerId' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerId?: string;
}
