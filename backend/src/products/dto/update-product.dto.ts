// =====================================================
// UpdateProductDto — PATCH /api/products/:id
// All fields optional. companyId NEVER accepted.
// =====================================================
import { ApiProperty } from '@nestjs/swagger';
import { ProductType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateProductDto {
  @ApiProperty({ example: 'SKU-0001', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  sku?: string;

  @ApiProperty({ example: 'Office Chair', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiProperty({ example: 'كرسي مكتب', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiProperty({ example: 'Ergonomic chair', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: ProductType, required: false })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiProperty({ example: '6281234567890', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiProperty({ example: 'pcs', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @ApiProperty({ example: '250.0000', required: false })
  @IsOptional()
  @IsNumberString()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'priceBeforeVat must be a decimal up to 4 fractional digits',
  })
  priceBeforeVat?: string;

  @ApiProperty({ example: '15.00', required: false })
  @IsOptional()
  @IsNumberString()
  @Matches(/^\d{1,3}(\.\d{1,2})?$/, { message: 'vatRate must be a decimal up to 2 fractional digits' })
  vatRate?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
