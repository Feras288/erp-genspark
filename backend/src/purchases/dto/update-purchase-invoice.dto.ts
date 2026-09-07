// Phase 5: Purchases Core — update DTO.
// Mirrors UpdateSalesInvoiceDto. All fields optional for PATCH.
import { PartialType } from '@nestjs/swagger';
import { CreatePurchaseInvoiceDto } from './create-purchase-invoice.dto';

export class UpdatePurchaseInvoiceDto extends PartialType(CreatePurchaseInvoiceDto) {}
