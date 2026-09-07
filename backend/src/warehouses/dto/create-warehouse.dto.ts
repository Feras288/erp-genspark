// =====================================================
// CreateWarehouseDto — input for POST /api/warehouses
// companyId is NEVER accepted here — it comes from JWT.
// =====================================================
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'WH-001', description: 'Unique warehouse code per company (NOT NULL)' })
  @IsString()
  @Length(1, 32)
  code!: string;

  @ApiProperty({ example: 'Main Riyadh Warehouse' })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({ example: 'المستودع الرئيسي - الرياض', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiProperty({ example: 'King Fahd Road, Exit 12', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiProperty({ example: 'Riyadh', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiProperty({ example: true, required: false, description: 'Defaults to true on creation' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
