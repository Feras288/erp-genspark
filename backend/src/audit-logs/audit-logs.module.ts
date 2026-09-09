// =====================================================
// Phase 15A-B-2: AuditLogsModule
// Registers read-only controller and service for /api/audit-logs
// =====================================================
import { Global, Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

@Global()
@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
