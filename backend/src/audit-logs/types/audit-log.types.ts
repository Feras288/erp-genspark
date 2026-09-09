// =====================================================
// Phase 15A-B-2: Audit Log Types
// Read-only response envelopes for /api/audit-logs
// =====================================================
import { AuditActorType, AuditCategory, AuditSeverity, AuditStatus } from '@prisma/client';

export interface AuditLogItemResponse {
  id: string;
  companyId: string | null;
  actorUserId: string | null;
  actorUser?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  actorType: AuditActorType;
  category: AuditCategory;
  event: string;
  entityType: string | null;
  entityId: string | null;
  action: string | null;
  severity: AuditSeverity;
  status: AuditStatus;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  route: string | null;
  method: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  message: string | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  status: 'ok';
  companyId: string;
  filters: Record<string, unknown>;
  data: {
    items: AuditLogItemResponse[];
    nextCursor: string | null;
  };
}

export interface AuditLogSingleResponse {
  status: 'ok';
  companyId: string;
  data: {
    item: AuditLogItemResponse;
  };
}

export interface AuditLogExportPreviewResponse {
  status: 'ok';
  companyId: string;
  filters: Record<string, unknown>;
  data: {
    count: number;
    exportImplemented: false;
    message: string;
  };
}

export interface CreateAuditLogInput {
  companyId?: string | null;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  category: AuditCategory;
  event: string;
  entityType?: string | null;
  entityId?: string | null;
  action?: string | null;
  severity?: AuditSeverity;
  status?: AuditStatus;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  route?: string | null;
  method?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  message?: string | null;
}

