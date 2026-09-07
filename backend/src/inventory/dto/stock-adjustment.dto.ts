// =====================================================
// StockAdjustmentDto — POST /api/inventory/adjustments
// Manual stock adjustment (in or out). product MUST be type=PRODUCT.
// Reason required. quantity > 0. companyId from JWT only.
// =====================================================
import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

// Adjustments only accept IN or OUT of the explicit adjustment types.
// (Transfers are handled by /api/inventory/transfers; OPENING_BALANCE is
// reserved for future Phase and not exposed in Phase 3.)
export const ADJUSTMENT_TYPES = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const;
export type AdjustmentType = typeof ADJUSTMENT_TYPES[number];

export const DECIMAL_REGEX = /^\d{1,14}(\.\d{1,4})?$/;

export class StockAdjustmentDto {
  @ApiProperty({ example: 'clxxxxxxxxxxxxxxxxxxxx', description: 'Product id (must be PRODUCT type)' })
  @IsString()
  @Length(1, 64)
  productId!: string;

  @ApiProperty({ example: 'clxxxxxxxxxxxxxxxxxxxx', description: 'Warehouse id (must be active)' })
  @IsString()
  @Length(1, 64)
  warehouseId!: string;

  @ApiProperty({
    enum: ADJUSTMENT_TYPES,
    example: 'ADJUSTMENT_IN',
    description: 'ADJUSTMENT_IN adds stock; ADJUSTMENT_OUT removes stock',
  })
  @IsIn(ADJUSTMENT_TYPES, {
    message: 'adjustmentType must be ADJUSTMENT_IN or ADJUSTMENT_OUT',
  })
  adjustmentType!: AdjustmentType;

  @ApiProperty({ example: '10.0000', description: 'Quantity to adjust, up to 4 decimals, > 0' })
  @IsNumberString()
  @Matches(DECIMAL_REGEX, { message: 'quantity must be a decimal up to 4 fractional digits' })
  quantity!: string;

  @ApiProperty({ example: 'Stock count correction', description: 'Reason is required for adjust' })
  @IsString()
  @Length(1, 500)
  reason!: string;

  @ApiProperty({ example: 'Annual inventory count discrepancy', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
