// =====================================================
// Phase 13A-B-5: CreateReconciliationMatchDto
// Body for POST /api/reconciliation/matches
// =====================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MatchType } from '@prisma/client';

export class CreateReconciliationMatchDto {
  @ApiProperty({ description: 'Bank transaction ID to match' })
  @IsNotEmpty()
  @IsString()
  bankTransactionId!: string;

  @ApiProperty({ description: 'Payment ID to match' })
  @IsNotEmpty()
  @IsString()
  paymentId!: string;

  @ApiPropertyOptional({
    enum: MatchType,
    default: MatchType.MANUAL,
    description: 'Match type category',
  })
  @IsOptional()
  @IsEnum(MatchType)
  matchType?: MatchType = MatchType.MANUAL;

  @ApiPropertyOptional({ description: 'Optional reconciliation notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
