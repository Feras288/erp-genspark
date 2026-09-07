// =====================================================
// StockMovementQueryDto — query for GET /api/inventory/movements
// Lists the append-only stock movement log.
// companyId is never accepted here.
// =====================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementType } from '@prisma/client';
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

export class StockMovementQueryDto {
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

  @ApiPropertyOptional({ example: 'clxxxxxxxxxxxxxxxxxxxx', description: 'Filter by productId' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ example: 'clxxxxxxxxxxxxxxxxxxxx', description: 'Filter by warehouseId' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: StockMovementType, description: 'Filter by movementType' })
  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Movement date >= this (ISO date, inclusive). Accepts Date or string.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d;
    }
    return value;
  })
  dateFrom?: Date | string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Movement date <= this (ISO date, inclusive). Accepts Date or string.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d;
    }
    return value;
  })
  dateTo?: Date | string;
}
