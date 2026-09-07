// =====================================================
// UpdatePartnerDto — PATCH /api/partners/:id
// =====================================================
import { ApiProperty } from '@nestjs/swagger';
import { PartnerType } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdatePartnerDto {
  @ApiProperty({ example: 'CUST-0001', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  code?: string;

  @ApiProperty({ example: 'Acme Trading Co.', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiProperty({ example: 'شركة أكمي التجارية', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiProperty({ enum: PartnerType, required: false })
  @IsOptional()
  @IsEnum(PartnerType)
  type?: PartnerType;

  @ApiProperty({ example: '300000000000003', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\d{15}$/, { message: 'vatNumber must be exactly 15 digits' })
  vatNumber?: string;

  @ApiProperty({ example: '1010101010', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  commercialRegistration?: string;

  @ApiProperty({ example: 'contact@example.sa', required: false })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiProperty({ example: '+966501234567', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiProperty({ example: 'King Fahd Rd', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiProperty({ example: 'Riyadh', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ example: 'SA', required: false })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
