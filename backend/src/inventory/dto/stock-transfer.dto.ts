// =====================================================
// StockTransferDto — POST /api/inventory/transfers
// Move quantity FROM one warehouse TO another for the same product.
// fromWarehouseId != toWarehouseId. product MUST be type=PRODUCT.
// quantity > 0. companyId from JWT only.
// =====================================================
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { DECIMAL_REGEX } from './stock-adjustment.dto';

export class StockTransferDto {
  @ApiProperty({ example: 'clxxxxxxxxxxxxxxxxxxxx' })
  @IsString()
  @Length(1, 64)
  fromWarehouseId!: string;

  @ApiProperty({ example: 'clxxxxxxxxxxxxxxxxxxxx', description: 'Must differ from fromWarehouseId' })
  @IsString()
  @Length(1, 64)
  toWarehouseId!: string;

  @ApiProperty({ example: 'clxxxxxxxxxxxxxxxxxxxx', description: 'Product id (must be PRODUCT type)' })
  @IsString()
  @Length(1, 64)
  productId!: string;

  @ApiProperty({ example: '5.0000', description: 'Transfer quantity, up to 4 decimals, > 0' })
  @IsNumberString()
  @Matches(DECIMAL_REGEX, { message: 'quantity must be a decimal up to 4 fractional digits' })
  quantity!: string;

  @ApiProperty({ example: 'Rebalancing stock between branches', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
