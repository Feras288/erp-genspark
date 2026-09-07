// =====================================================
// CreateProductDto — input for POST /api/products
// All money fields are Decimal-like strings.
// companyId is NEVER accepted here — it comes from JWT.
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
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'SKU-0001', description: 'Unique SKU per company' })
  @IsString()
  @Length(1, 64)
  sku!: string;

  @ApiProperty({ example: 'Office Chair' })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({ example: 'كرسي مكتب', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiProperty({ example: 'Ergonomic chair with lumbar support', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: ProductType, example: 'PRODUCT' })
  @IsEnum(ProductType)
  type!: ProductType;

  @ApiProperty({ example: '6281234567890', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiProperty({ example: 'pcs', required: false, description: 'Unit of measure code, e.g. pcs/kg/box' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @ApiProperty({ example: '250.0000', required: false, description: 'Price before VAT, up to 4 decimals' })
  @IsOptional()
  @IsNumberString()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'priceBeforeVat must be a decimal up to 4 fractional digits',
  })
  priceBeforeVat?: string;

  @ApiProperty({ example: '15.00', description: 'VAT rate percentage, default 15' })
  @IsOptional()
  @IsNumberString()
  @Matches(/^\d{1,3}(\.\d{1,2})?$/, { message: 'vatRate must be a decimal up to 2 fractional digits' })
  vatRate?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// re-export to keep whole module referencing one enum
export { ProductType };
