// =====================================================
// CreatePartnerDto — input for POST /api/partners
// companyId NEVER accepted.
// Decimal fields as strings. VAT number validated.
// =====================================================
import { ApiProperty } from '@nestjs/swagger';
import { PartnerType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreatePartnerDto {
  @ApiProperty({ example: 'CUST-0001', required: false, description: 'Optional unique code per company' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  code?: string;

  @ApiProperty({ example: 'Acme Trading Co.' })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({ example: 'شركة أكمي التجارية', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiProperty({ enum: PartnerType, example: 'CUSTOMER' })
  @IsEnum(PartnerType)
  type!: PartnerType;

  @ApiProperty({ example: '300000000000003', required: false, description: 'ZATCA VAT number (15 digits)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{15}$/, { message: 'vatNumber must be exactly 15 digits' })
  vatNumber?: string;

  @ApiProperty({ example: '1010101010', required: false, description: 'Commercial Registration (CR)' })
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

  @ApiProperty({ example: 'SA', required: false, default: 'SA' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiProperty({ example: true, required: false, default: true })
  @IsOptional()
  isActive?: boolean;
}
