// Re-used across modules but kept here for clarity.
import { IsEmail, IsOptional, IsString, MinLength, IsArray, ArrayMinSize } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  roleKeys?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  password?: string; // validated below if present

  @IsOptional()
  isActive?: boolean;
}
