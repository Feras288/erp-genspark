// =====================================================
// PosModule — Phase 4B-4.
//
// Reuses SalesService (provided by SalesModule, already exports it) so POS
// create goes through the same DRAFT-create + issue $transaction that the
// Sales controller uses. AuditModule is @Global() so AuditService is
// available without an explicit import.
// =====================================================
import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { PosService } from './pos.service';
import { PosController } from './pos.controller';

@Module({
  imports: [SalesModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
