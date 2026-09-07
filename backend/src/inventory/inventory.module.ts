// =====================================================
// InventoryModule — Phase 3 inventory core.
// Wires controller + service. Guards applied at the controller.
// =====================================================
import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
