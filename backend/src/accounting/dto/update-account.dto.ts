// Phase 6: Accounting Core — update DTO.
// Cannot update code once an Account has posted journal entry lines
// referring to it (FK Restrict). Inactive accounts can be reactived.
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AccountType,
  NormalBalance,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateAccountDto {
  @ApiPropertyOptional({ example: 'Cash on hand' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional({ example: 'النقدية بالصندوق' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiPropertyOptional({ enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @ApiPropertyOptional({ enum: NormalBalance })
  @IsOptional()
  @IsEnum(NormalBalance)
  normalBalance?: NormalBalance;

  @ApiPropertyOptional({ description: 'null clears parent' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
