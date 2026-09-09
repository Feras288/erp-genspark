// =====================================================
// Phase 15A-B-2: AuditLogsController
// Read-only endpoints mounted under /api/audit-logs
// Guarded with JwtAuthGuard, PermissionsGuard, and @RequirePermissions
// Strict tenant isolation via JWT companyId.
// =====================================================
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/auth.types';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogQueryDto, EntityTimelineQueryDto } from './dto/audit-log-query.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  @RequirePermissions('audit_log.read')
  list(
    @CurrentUser() me: AuthenticatedUser,
    @Query() query: AuditLogQueryDto,
  ) {
    return this.service.list(me.companyId, query);
  }

  @Get('export-preview')
  @RequirePermissions('audit_log.export')
  exportPreview(
    @CurrentUser() me: AuthenticatedUser,
    @Query() query: AuditLogQueryDto,
  ) {
    return this.service.getExportPreview(me.companyId, query);
  }

  @Get('entity/:entityType/:entityId')
  @RequirePermissions('audit_log.read')
  getEntityTimeline(
    @CurrentUser() me: AuthenticatedUser,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query() query: EntityTimelineQueryDto,
  ) {
    return this.service.getEntityTimeline(me.companyId, entityType, entityId, query);
  }

  @Get(':id')
  @RequirePermissions('audit_log.read')
  findOne(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.findOne(me.companyId, id);
  }
}
