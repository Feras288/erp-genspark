// Phase 6: Accounting Core — wires AccountingService + AccountingController.
// Phase 12A-B-1: FinancialStatementsService (read-only skeleton).
import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { FinancialStatementsService } from './financial-statements.service';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, FinancialStatementsService],
  exports: [AccountingService],
})
export class AccountingModule {}
