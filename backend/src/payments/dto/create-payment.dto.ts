// =====================================================
// Phase 10A: AR Payments + Settlement Tracking.
//
// Phase 10A-B-1: CreatePaymentDto — exact request shape
// for POST /api/sales-invoices/:invoiceId/payments.
//
//   class-validator validates the body BEFORE reaching
//   PaymentsController.register(), so callers receive
//   400 BadRequestException on bad input, and only valid
//   bodies reach the 501 NotImplementedException throw.
//
//   This DTO is the contract documented for 10A-C-code
//   (frontend register form). Phase 10A-B-2 will not change
//   the DTO shape; it will simply replace the 501 thrown by
//   the service with a real settlement transaction.
//
// Strict (Phase 10A-B-1):
//   * No settlement calculations.
//   * No PAID / PARTIALLY_PAID status enum (deferred — T-2 lock).
//   * No AR-Aging source change.
//   * No AP payments (10B).
//   * No GL / bank reconciliation / drill-down.
// =====================================================
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsEnum(PaymentMethod, {
    message: `paymentMethod must be one of: ${Object.values(PaymentMethod).join(', ')}`,
  })
  paymentMethod!: PaymentMethod;

  // Server-side Decimal arithmetic — payloads carry strings
  // matching Prisma.Decimal @db.Decimal(18,4). Any numeric
  // octet is rejected.
  @IsString({ message: 'amount must be a string (Decimal/18,4)' })
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'amount must match /^\d{1,14}(\.\d{1,4})?$/ (max 14 integer, max 4 fractional)',
  })
  amount!: string;

  // Optional — server defaults to new Date() if absent.
  // ISO-8601 string (class-validator friendly).
  @IsOptional()
  @IsDateString(
    { strict: true } as unknown as { strict: boolean },
    { message: 'paidAt must be ISO-8601 string' },
  )
  paidAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  notes?: string;

  // Phase 10A-B-2: server stores unique (invoiceId, idempotencyKey)
  // within the last 24h, returning the existing payment row with
  // 200 OK. Phase 10A-B-1: accepted by DTO, ignored by service.
  @IsOptional()
  @IsString()
  @Length(8, 128)
  idempotencyKey?: string;
}
