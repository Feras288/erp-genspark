// Phase 5: Purchases Core — minimal module wiring controller + service.
// Mirrors SalesModule exactly, so the system prompt can keep its current shape.
// Future phases (accounting, returns, credit notes) will import this module.
import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';

@Module({
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
