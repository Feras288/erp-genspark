import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  // optional: if any client prefers body over cookie. Cookie takes precedence.
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
