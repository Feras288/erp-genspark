// Phase 6: Accounting Core — wires AccountingService + AccountingController.
// Phase 12A-B-1: FinancialStatementsService (read-only skeleton).
// Phase 14A-B-2: PeriodCloseController + PeriodCloseService (read-only skeleton).
import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { FinancialStatementsService } from './financial-statements.service';
import { PeriodCloseController } from './period-close/period-close.controller';
import { PeriodCloseService } from './period-close/period-close.service';

@Module({
  controllers: [AccountingController, PeriodCloseController],
  providers: [AccountingService, FinancialStatementsService, PeriodCloseService],
  exports: [AccountingService, PeriodCloseService],
})
export class AccountingModule {}

