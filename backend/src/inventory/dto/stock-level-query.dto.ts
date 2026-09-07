// =====================================================
// StockLevelQueryDto — query for GET /api/inventory/levels
// companyId is never accepted here.
// Lists balances with optional filter by product / warehouse.
// =====================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class StockLevelQueryDto {
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

  @ApiPropertyOptional({ example: 'chair', description: 'Search by product SKU or product name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ example: 'clxxxxxxx', description: 'Filter by productId' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ example: 'clxxxxxxx', description: 'Filter by warehouseId' })
  @IsOptional()
  @IsString()
  warehouseId?: string;
}
