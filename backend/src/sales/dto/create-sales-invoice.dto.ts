// Phase 4B-1 skeleton: DTOs are typed and validated, but the service does
// not yet run Decimal arithmetic or persist lines. Build-only.
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const DECIMAL_QTY_REGEX = /^\d{1,14}(\.\d{1,4})?$/;
export const DECIMAL_RATE_REGEX = /^\d{1,3}(\.\d{1,2})?$/;

export class CreateSalesInvoiceLineDto {
  @ApiProperty()
  @IsString()
  @Length(1, 64)
  productId!: string;

  @ApiProperty({ required: false, description: 'Required for PRODUCT lines at issue time' })
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
  @Matches(DECIMAL_QTY_REGEX, { message: 'quantity must be a decimal up to 4 fractional digits' })
  quantity!: string;

  @ApiProperty({ example: '100.0000' })
  @IsNumberString()
  @Matches(DECIMAL_QTY_REGEX, { message: 'unitPrice must be a decimal up to 4 fractional digits' })
  unitPrice!: string;

  @ApiProperty({ required: false, example: '0.0000' })
  @IsOptional()
  @IsNumberString()
  @Matches(DECIMAL_QTY_REGEX, { message: 'discountAmount must be a decimal up to 4 fractional digits' })
  discountAmount?: string;

  @ApiProperty({ required: false, example: '15.00' })
  @IsOptional()
  @IsNumberString()
  @Matches(DECIMAL_RATE_REGEX, { message: 'vatRate must be a decimal up to 2 fractional digits' })
  vatRate?: string;
}

export class CreateSalesInvoiceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  customerId?: string;

  @ApiProperty({ required: false, example: '2026-09-07' })
  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @ApiProperty({ required: false, example: '2026-10-07' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ type: () => [CreateSalesInvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceLineDto)
  lines!: CreateSalesInvoiceLineDto[];
}
