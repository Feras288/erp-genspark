// =====================================================
// Phase 15A-B-2: Audit Log Query DTOs
// Validation for read-only audit log query endpoints
// =====================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditCategory, AuditSeverity, AuditStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AuditLogQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Filter logs created on or after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59.999Z',
    description: 'Filter logs created on or before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    enum: AuditCategory,
    description: 'Filter by audit category',
  })
  @IsOptional()
  @IsEnum(AuditCategory)
  category?: AuditCategory;

  @ApiPropertyOptional({
    example: 'JOURNAL_POSTED',
    description: 'Filter by event name',
  })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({
    enum: AuditSeverity,
    description: 'Filter by audit severity (INFO, WARNING, ERROR, SECURITY)',
  })
  @IsOptional()
  @IsEnum(AuditSeverity)
  severity?: AuditSeverity;

  @ApiPropertyOptional({
    enum: AuditStatus,
    description: 'Filter by status (SUCCESS, FAILURE, BLOCKED)',
  })
  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  @ApiPropertyOptional({
    description: 'Filter by actor user ID',
  })
  @IsOptional()
  @IsString()
  actorUserId?: string;

  @ApiPropertyOptional({
    example: 'JournalEntry',
    description: 'Filter by target entity type',
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({
    description: 'Filter by target entity ID',
  })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({
    description: 'Filter by request correlation ID',
  })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional({
    example: 100,
    default: 100,
    description: 'Maximum number of items to return (1-200)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 100;

  @ApiPropertyOptional({
    description: 'Pagination cursor (ID of the last item from previous page)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class EntityTimelineQueryDto {
  @ApiPropertyOptional({
    example: 100,
    default: 100,
    description: 'Maximum number of items to return (1-200)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 100;

  @ApiPropertyOptional({
    description: 'Pagination cursor (ID of the last item from previous page)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
