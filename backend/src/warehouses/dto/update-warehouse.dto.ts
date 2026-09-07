// =====================================================
// UpdateWarehouseDto — PATCH /api/warehouses/:id
// All fields optional. companyId NEVER accepted.
// code change allowed (still unique per company under @RequirePermissions).
// =====================================================
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateWarehouseDto {
  @ApiProperty({ example: 'WH-001', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  code?: string;

  @ApiProperty({ example: 'Main Riyadh Warehouse', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

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

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
