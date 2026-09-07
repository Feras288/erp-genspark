// =====================================================
// Phase 4B-4 — POS endpoint DTOs.
//
// Reuses the same Decimal regex shape as Sales create DTOs so behaviour is
// internally consistent (decimal-string in, server-side arithmetic, decimal
// string out). POS does NOT accept totals from the frontend; the server
// recomputes them inside SalesService.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// Quantity / price / discount follow the same constraints as sales lines.
export const POS_DECIMAL_QTY_REGEX = /^\d{1,14}(\.\d{1,4})?$/;
// VAT-rate precision matches the schema column `Decimal(5, 2)`.
export const POS_DECIMAL_RATE_REGEX = /^\d{1,3}(\.\d{1,2})?$/;

export class CreatePosSaleLineDto {
  @ApiProperty({ example: 'clxxxxxxxxxxxxxxxxxxxx' })
  @IsString()
  @Length(1, 64)
  productId!: string;

  @ApiProperty({
    required: false,
    description: 'Required for PRODUCT lines at issue time (server-side stock deduction).',
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  warehouseId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: '2.0000' })
  @IsNumberString()
  @Matches(POS_DECIMAL_QTY_REGEX, {
    message: 'quantity must be a decimal up to 4 fractional digits',
  })
  quantity!: string;

  @ApiProperty({ example: '100.0000' })
  @IsNumberString()
  @Matches(POS_DECIMAL_QTY_REGEX, {
    message: 'unitPrice must be a decimal up to 4 fractional digits',
  })
  unitPrice!: string;

  @ApiProperty({ required: false, example: '0.0000' })
  @IsOptional()
  @IsNumberString()
  @Matches(POS_DECIMAL_QTY_REGEX, {
    message: 'discountAmount must be a decimal up to 4 fractional digits',
  })
  discountAmount?: string;

  @ApiProperty({ required: false, example: '15.00' })
  @IsOptional()
  @IsNumberString()
  @Matches(POS_DECIMAL_RATE_REGEX, {
    message: 'vatRate must be a decimal up to 2 fractional digits',
  })
  vatRate?: string;
}

export class CreatePosSaleDto {
  @ApiProperty({ required: false, description: 'Optional walk-in customer (Partner).' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  customerId?: string;

  @ApiProperty({ required: false, enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod, {
    message:
      'paymentMethod must be one of: CASH, CARD, TRANSFER, OTHER (Phase 4B-4: no gateway, no cash drawer, just audit fields)',
  })
  paymentMethod?: PaymentMethod;

  @ApiProperty({ required: false, example: '100.0000' })
  @IsOptional()
  @IsNumberString()
  @Matches(POS_DECIMAL_QTY_REGEX, {
    message: 'paidAmount must be a decimal up to 4 fractional digits',
  })
  paidAmount?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ type: () => [CreatePosSaleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePosSaleLineDto)
  lines!: CreatePosSaleLineDto[];
}

export class PosSalesQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by customerId' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerId?: string;
}
