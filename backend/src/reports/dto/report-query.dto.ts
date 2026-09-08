// =====================================================
// Phase 7B-1: Reports Core — query DTO skeleton.
//
//   * Single base DTO shared across all 6 report endpoints.
//   * All fields optional (skeleton only — no enum coupling
//     to Prisma, no domain-bound validation yet).
//   * Pagination fields kept lean: page + pageSize (1..200).
//   * Date filters are stringly typed (raw, validated only
//     by IsString). Parsing/tz enforcement will land in
//     Phase 7B-2+ once the consumers are concrete.
//   * No `companyId` field — companyId always comes from the
//     JWT (@CurrentUser). The DTO explicitly forbids it.
// =====================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ReportQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  // ===== Date range (skeleton — no parsing yet) =====

  @ApiPropertyOptional({
    example: '2026-01-01',
    description:
      'Inclusive lower-bound ISO date (e.g. 2026-01-01 or 2026-01-01T00:00:00Z). Parsing/tz handling lands in Phase 7B-2+. Skeleton-only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description:
      'Inclusive upper-bound ISO date (e.g. 2026-12-31 or 2026-12-31T23:59:59Z). Parsing/tz handling lands in Phase 7B-2+. Skeleton-only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  toDate?: string;

  // ===== Domain-specific filters (skeleton) =====

  @ApiPropertyOptional({
    enum: ['DRAFT', 'ISSUED', 'CANCELLED', 'RECEIVED', 'POSTED'],
    description:
      "Optional status filter. Skeleton-only — values are NOT yet bound to Prisma enums. Sales default 'ISSUED'; purchases default 'RECEIVED'; journal default 'POSTED'. Will be per-endpoint IsEnum() in Phase 7B-2+.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({
    description:
      "Optional invoice type (e.g. 'POS' to scope the POS summary endpoint). Skeleton-only — not yet validated against Prisma's SalesInvoiceType enum.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  type?: string;

  @ApiPropertyOptional({
    description: 'Filter by customerId (sales/POS summary endpoints).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by supplierId (purchases summary endpoint).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  supplierId?: string;

  @ApiPropertyOptional({
    description: 'Filter by productId (inventory / stock movements summary).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  productId?: string;

  @ApiPropertyOptional({
    description: 'Filter by warehouseId (inventory / stock movements summary).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  warehouseId?: string;

  @ApiPropertyOptional({
    description:
      "Filter by paymentMethod (POS summary endpoint). Skeleton-only — not yet validated against Prisma's PaymentMethod enum.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  paymentMethod?: string;
}
