// =====================================================
// Phase 7B-1: Reports Core — backend skeleton.
//
//   * Registers ReportsController + ReportsService.
//   * No Prisma providers — Phase 7B-1 is a structural
//     skeleton only; no queries, no aggregations.
//   * No new permissions — reuses the already-seeded
//     `reports.read`, which was a Phase-1 placeholder
//     retained for this exact future module.
// =====================================================
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
