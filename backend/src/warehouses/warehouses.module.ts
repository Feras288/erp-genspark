// =====================================================
// WarehousesModule — Phase 3 inventory core.
// Wires controller + service. Guards are applied at the controller.
// =====================================================
import { Module } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { WarehousesController } from './warehouses.controller';

@Module({
  controllers: [WarehousesController],
  providers: [WarehousesService],
  exports: [WarehousesService],
})
export class WarehousesModule {}
