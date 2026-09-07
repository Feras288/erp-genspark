// Phase 4B-1 skeleton: minimal module wiring controller + service.
// POS will land in Phase 4B-3 and will import this module to reuse SalesService.
import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
