// Phase 4B-1 skeleton: all create fields optional for PATCH /api/sales/invoices/:id
import { PartialType } from '@nestjs/swagger';
import { CreateSalesInvoiceDto } from './create-sales-invoice.dto';

// All fields inherited as optional because of PartialType.
export class UpdateSalesInvoiceDto extends PartialType(CreateSalesInvoiceDto) {}
