// =====================================================
// Phase 13A-B-2: ReconciliationModule
// Encapsulates bank account management, statement ingestion,
// and matching reconciliation workflows.
// =====================================================
import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
