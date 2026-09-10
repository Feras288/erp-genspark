'use client';

// =====================================================
// Phase 15A-C: Audit Log Frontend Viewer Workspace
// Route: /admin/audit-logs
//
// Features:
// 1. Permission Gating:
//    - Requires auth and `audit_log.read` to view
//    - `audit_log.export` gates the Export Preview action
//    - `audit_log.admin` displayed as administrative privilege indicator
// 2. Filter Bar:
//    - fromDate, toDate, category (11 enums), event, severity (4 enums),
//      status (3 enums), actorUserId, entityType, entityId, requestId, limit
//    - Apply and Reset actions
// 3. Audit Log Table:
//    - Color badges:
//        INFO/SUCCESS: emerald/green
//        WARNING/BLOCKED: amber/yellow
//        ERROR/SECURITY: rose/red
//    - Display createdAt, actor, category, event, entity, status, severity, message
// 4. Details Drawer/Modal:
//    - Fetches by ID via GET /api/audit-logs/:id
//    - Read-only pretty-printed JSON for before, after, metadata
//    - Context: actor, request, route, IP, userAgent
// 5. Entity Timeline Drawer/Modal:
//    - Fetches by entity via GET /api/audit-logs/entity/:entityType/:entityId
//    - Chronological event timeline for the entity
// 6. Export Preview Modal:
//    - Gated by `audit_log.export`
//    - Fetches count & status via GET /api/audit-logs/export-preview
//    - Shows clear note that direct file download is out of scope / append-only
// 7. Security:
//    - Zero client-side unredaction; zero localStorage; zero file downloads.
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  api,
  ApiError,
  AuditActorTypeKey,
  AuditCategoryKey,
  AuditLogItem,
  AuditLogQueryParams,
  AuditSeverityKey,
  AuditStatusKey,
} from '@/lib/api';

// ---------- Constants --------------------------------------------

const AUDIT_CATEGORIES: { key: AuditCategoryKey; labelAr: string }[] = [
  { key: 'AUTH', labelAr: 'المصادقة والأمان (AUTH)' },
  { key: 'USER', labelAr: 'إدارة المستخدمين (USER)' },
  { key: 'RBAC', labelAr: 'الصلاحيات والأدوار (RBAC)' },
  { key: 'ACCOUNTING', labelAr: 'المحاسبة والقيود (ACCOUNTING)' },
  { key: 'FINANCIAL_REPORTING', labelAr: 'التقارير المالية (FINANCIAL_REPORTING)' },
  { key: 'SALES', labelAr: 'المبيعات والفواتير (SALES)' },
  { key: 'PURCHASES', labelAr: 'المشتريات والموردين (PURCHASES)' },
  { key: 'PAYMENTS', labelAr: 'المدفوعات والتحصيلات (PAYMENTS)' },
  { key: 'RECONCILIATION', labelAr: 'المطابقة البنكية (RECONCILIATION)' },
  { key: 'PERIOD_CLOSE', labelAr: 'إقفال الفترات (PERIOD_CLOSE)' },
  { key: 'SYSTEM', labelAr: 'النظام والتهيئة (SYSTEM)' },
];

const AUDIT_SEVERITIES: { key: AuditSeverityKey; labelAr: string }[] = [
  { key: 'INFO', labelAr: 'معلومات (INFO)' },
  { key: 'WARNING', labelAr: 'تحذير (WARNING)' },
  { key: 'ERROR', labelAr: 'خطأ (ERROR)' },
  { key: 'SECURITY', labelAr: 'أمني (SECURITY)' },
];

const AUDIT_STATUSES: { key: AuditStatusKey; labelAr: string }[] = [
  { key: 'SUCCESS', labelAr: 'ناجح (SUCCESS)' },
  { key: 'FAILURE', labelAr: 'فشل (FAILURE)' },
  { key: 'BLOCKED', labelAr: 'محظور (BLOCKED)' },
];

// ---------- Formatters -------------------------------------------

function formatDateTime(val: string | null | undefined): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return val;
  }
}

// ---------- Badges -----------------------------------------------

function StatusBadge({ status }: { status: AuditStatusKey }) {
  switch (status) {
    case 'SUCCESS':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          SUCCESS
        </span>
      );
    case 'BLOCKED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          BLOCKED
        </span>
      );
    case 'FAILURE':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          FAILURE
        </span>
      );
  }
}

function SeverityBadge({ severity }: { severity: AuditSeverityKey }) {
  switch (severity) {
    case 'INFO':
      return (
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
          INFO
        </span>
      );
    case 'WARNING':
      return (
        <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200">
          WARNING
        </span>
      );
    case 'ERROR':
      return (
        <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 border border-rose-200">
          ERROR
        </span>
      );
    case 'SECURITY':
      return (
        <span className="inline-flex items-center rounded-md bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-900 border border-purple-300">
          🔒 SECURITY
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {severity}
        </span>
      );
  }
}

function CategoryBadge({ category }: { category: AuditCategoryKey }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-mono font-medium text-slate-700 border border-slate-200">
      {category}
    </span>
  );
}

// ---------- Filter Form Interface --------------------------------

interface FilterState {
  fromDate: string;
  toDate: string;
  category: string;
  event: string;
  severity: string;
  status: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  requestId: string;
  limit: number;
}

const initialFilters: FilterState = {
  fromDate: '',
  toDate: '',
  category: '',
  event: '',
  severity: '',
  status: '',
  actorUserId: '',
  entityType: '',
  entityId: '',
  requestId: '',
  limit: 50,
};

// =================================================================
// Page Component
// =================================================================

export default function AdminAuditLogsPage() {
  const router = useRouter();
  const { user, loading: authLoading, hasPermission } = useAuth();

  // ---- Permissions ----------------------------------------------
  const canRead = !!user && hasPermission('audit_log.read');
  const canExport = !!user && hasPermission('audit_log.export');
  const isAdmin =
    !!user &&
    (hasPermission('audit_log.admin') || user.roles.some((r) => r.key === 'ADMIN'));

  // ---- Filter State ---------------------------------------------
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [activeFilters, setActiveFilters] = useState<FilterState>(initialFilters);

  // ---- Table & Pagination State ---------------------------------
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // ---- Details Drawer / Modal State -----------------------------
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [activeJsonTab, setActiveJsonTab] = useState<'before' | 'after' | 'metadata'>('metadata');

  // ---- Entity Timeline Modal State ------------------------------
  const [timelineEntity, setTimelineEntity] = useState<{
    entityType: string;
    entityId: string;
  } | null>(null);
  const [timelineLogs, setTimelineLogs] = useState<AuditLogItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // ---- Export Preview Modal State -------------------------------
  const [showExportModal, setShowExportModal] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportData, setExportData] = useState<{
    count: number;
    exportImplemented: false;
    message: string;
  } | null>(null);

  // ---- Auth Guard -----------------------------------------------
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  // ---- Fetch Logs -----------------------------------------------
  const fetchLogs = useCallback(
    async (params: FilterState, cursor?: string, isAppend = false) => {
      if (!user || !canRead) return;
      if (isAppend) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const query: AuditLogQueryParams = {
          limit: params.limit,
          cursor,
        };
        if (params.fromDate) query.fromDate = new Date(params.fromDate).toISOString();
        if (params.toDate) query.toDate = new Date(params.toDate).toISOString();
        if (params.category) query.category = params.category as AuditCategoryKey;
        if (params.event) query.event = params.event.trim();
        if (params.severity) query.severity = params.severity as AuditSeverityKey;
        if (params.status) query.status = params.status as AuditStatusKey;
        if (params.actorUserId) query.actorUserId = params.actorUserId.trim();
        if (params.entityType) query.entityType = params.entityType.trim();
        if (params.entityId) query.entityId = params.entityId.trim();
        if (params.requestId) query.requestId = params.requestId.trim();

        const res = await api.getAuditLogs(query);
        if (isAppend) {
          setLogs((prev) => [...prev, ...res.data.items]);
        } else {
          setLogs(res.data.items);
        }
        setNextCursor(res.data.nextCursor);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'فشل استرجاع سجلات التدقيق';
        setError(msg);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user, canRead],
  );

  // Initial load
  useEffect(() => {
    if (canRead) {
      void fetchLogs(activeFilters);
    }
  }, [fetchLogs, activeFilters, canRead]);

  // ---- Apply & Reset Filters ------------------------------------
  const handleApplyFilters = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActiveFilters({ ...filters });
  };

  const handleResetFilters = () => {
    setFilters(initialFilters);
    setActiveFilters(initialFilters);
  };

  // ---- Load Next Page (Pagination) ------------------------------
  const handleLoadNextPage = () => {
    if (!nextCursor || loadingMore) return;
    void fetchLogs(activeFilters, nextCursor, true);
  };

  // ---- Open Details Drawer / Modal ------------------------------
  const handleOpenDetails = async (logItem: AuditLogItem) => {
    setSelectedLogId(logItem.id);
    setSelectedLog(logItem);
    setDetailsError(null);
    setLoadingDetails(true);
    try {
      const res = await api.getAuditLogById(logItem.id);
      setSelectedLog(res.data.item);
    } catch (err) {
      // If fetching single item fails, retain the row data we already have
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل استرجاع التفاصيل الكاملة للسجل';
      setDetailsError(msg);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedLogId(null);
    setSelectedLog(null);
    setDetailsError(null);
  };

  // ---- Open Entity Timeline -------------------------------------
  const handleOpenEntityTimeline = async (entityType: string, entityId: string) => {
    setTimelineEntity({ entityType, entityId });
    setTimelineLogs([]);
    setTimelineError(null);
    setLoadingTimeline(true);
    try {
      const res = await api.getAuditLogsForEntity(entityType, entityId, { limit: 100 });
      setTimelineLogs(res.data.items);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل استرجاع المخطط الزمني للكيان';
      setTimelineError(msg);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleCloseEntityTimeline = () => {
    setTimelineEntity(null);
    setTimelineLogs([]);
    setTimelineError(null);
  };

  // ---- Open Export Preview --------------------------------------
  const handleOpenExportPreview = async () => {
    if (!canExport) return;
    setShowExportModal(true);
    setExportData(null);
    setExportError(null);
    setLoadingExport(true);
    try {
      const query: AuditLogQueryParams = {};
      if (activeFilters.fromDate)
        query.fromDate = new Date(activeFilters.fromDate).toISOString();
      if (activeFilters.toDate)
        query.toDate = new Date(activeFilters.toDate).toISOString();
      if (activeFilters.category)
        query.category = activeFilters.category as AuditCategoryKey;
      if (activeFilters.event) query.event = activeFilters.event.trim();
      if (activeFilters.severity)
        query.severity = activeFilters.severity as AuditSeverityKey;
      if (activeFilters.status) query.status = activeFilters.status as AuditStatusKey;
      if (activeFilters.actorUserId) query.actorUserId = activeFilters.actorUserId.trim();
      if (activeFilters.entityType) query.entityType = activeFilters.entityType.trim();
      if (activeFilters.entityId) query.entityId = activeFilters.entityId.trim();
      if (activeFilters.requestId) query.requestId = activeFilters.requestId.trim();

      const res = await api.getAuditLogExportPreview(query);
      setExportData(res.data);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'فشل استرجاع معاينة التصدير';
      setExportError(msg);
    } finally {
      setLoadingExport(false);
    }
  };

  const handleCloseExportPreview = () => {
    setShowExportModal(false);
    setExportData(null);
    setExportError(null);
  };

  // ---- Render Guards --------------------------------------------
  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-slate-700 border-r-transparent mb-3" />
          <p className="text-slate-500">جاري التحقق من الهوية...</p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  if (!canRead) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 text-xl font-bold">
            🚫
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">غير مصرح — Access Denied</h2>
          <p className="text-sm text-slate-600 mb-4">
            يتطلب استعراض سجل التدقيق توفر صلاحية <code>audit_log.read</code>. يرجى مراجعة مسؤول النظام لمنحك الصلاحية.
          </p>
          <Link
            href="/dashboard"
            className="inline-block rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            العودة إلى لوحة المعلومات
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-lg shadow-sm">
              🛡️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
                  سجل التدقيق والعمليات (Audit Logs)
                </h1>
                {isAdmin && (
                  <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800 border border-purple-200">
                    مدير النظام (Admin)
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                سجل رقابي مركزي غير قابل للتعديل أو الحذف (Append-only) لكافة العمليات المالية والأمنية والإدارية
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <button
              onClick={handleOpenExportPreview}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 transition-colors"
            >
              📥 معاينة التصدير (Export Preview)
            </button>
          )}
          <Link
            href="/accounting"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            📖 المحاسبة
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            لوحة المعلومات
          </Link>
        </div>
      </header>

      {/* Compliance / Security Info Banner */}
      <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs text-indigo-900 flex items-start gap-3">
        <span className="text-base">ℹ️</span>
        <div className="leading-relaxed">
          <p className="font-semibold mb-0.5">معايير أمان سجلات التدقيق (Audit Trail Security):</p>
          <p className="text-indigo-800/90">
            جميع السجلات مشفرة ومحفوظة بصيغة تسلسلية غير قابلة للإلغاء أو التعديل. يتم تسجيل المستخدم المنفذ، الكيان المستهدف،
            معرف الطلب (Request ID)، التغييرات قبل وبعد العملية، مع حجب البيانات الحساسة تلقائياً في الواجهة الخلفية.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleApplyFilters}>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>🔍</span> تصفية سجل التدقيق (Filters)
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                إعادة ضبط
              </button>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
              >
                تطبيق التصفية
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
            {/* fromDate */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">من تاريخ (fromDate)</label>
              <input
                type="datetime-local"
                value={filters.fromDate}
                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none"
              />
            </div>

            {/* toDate */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">إلى تاريخ (toDate)</label>
              <input
                type="datetime-local"
                value={filters.toDate}
                onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">التصنيف (Category)</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none bg-white"
              >
                <option value="">جميع التصنيفات (All)</option>
                {AUDIT_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.labelAr}
                  </option>
                ))}
              </select>
            </div>

            {/* Event */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">الحدث (Event)</label>
              <input
                type="text"
                placeholder="مثال: JOURNAL_POSTED, AUTH_LOGIN"
                value={filters.event}
                onChange={(e) => setFilters({ ...filters, event: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none"
              />
            </div>

            {/* Severity */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">مستوى الأهمية (Severity)</label>
              <select
                value={filters.severity}
                onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none bg-white"
              >
                <option value="">جميع المستويات (All)</option>
                {AUDIT_SEVERITIES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.labelAr}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">الحالة (Status)</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none bg-white"
              >
                <option value="">جميع الحالات (All)</option>
                {AUDIT_STATUSES.map((st) => (
                  <option key={st.key} value={st.key}>
                    {st.labelAr}
                  </option>
                ))}
              </select>
            </div>

            {/* Entity Type */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">نوع الكيان (Entity Type)</label>
              <input
                type="text"
                placeholder="مثال: JournalEntry, Payment, PeriodClose"
                value={filters.entityType}
                onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none"
              />
            </div>

            {/* Entity ID */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">معرّف الكيان (Entity ID)</label>
              <input
                type="text"
                placeholder="معرّف السجل المستهدف (UUID أو كود)"
                value={filters.entityId}
                onChange={(e) => setFilters({ ...filters, entityId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none font-mono"
              />
            </div>

            {/* Actor User ID */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">المستخدم المنفذ (Actor User ID)</label>
              <input
                type="text"
                placeholder="معرّف المستخدم المنفذ"
                value={filters.actorUserId}
                onChange={(e) => setFilters({ ...filters, actorUserId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none font-mono"
              />
            </div>

            {/* Request ID */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">معرّف الطلب (Request ID)</label>
              <input
                type="text"
                placeholder="معرّف الربط (Correlation Request ID)"
                value={filters.requestId}
                onChange={(e) => setFilters({ ...filters, requestId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none font-mono"
              />
            </div>

            {/* Limit */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">عدد النتائج (Limit)</label>
              <select
                value={filters.limit}
                onChange={(e) => setFilters({ ...filters, limit: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none bg-white"
              >
                <option value={10}>10 سجلات</option>
                <option value={25}>25 سجل</option>
                <option value={50}>50 سجل</option>
                <option value={100}>100 سجل</option>
                <option value={200}>200 سجل</option>
              </select>
            </div>
          </div>
        </form>
      </section>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchLogs(activeFilters)}
            className="text-xs font-semibold underline hover:text-rose-900"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{logs.length}</span>
            <span>سجل معروض</span>
            {nextCursor && <span className="text-amber-600 font-medium">(توجد صفحات تالية)</span>}
          </div>
          <div className="text-xs text-slate-500">
            الشركة: <span className="font-mono">{user.companyId}</span>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-slate-700 border-r-transparent mb-3" />
            <p className="text-xs text-slate-500">جاري تحميل سجلات التدقيق...</p>
          </div>
        ) : logs.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 text-xl">
              📂
            </div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              لا توجد سجلات تدقيق مطابقة للشروط
            </h3>
            <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
              لم يتم العثور على أي عمليات مسجلة بالمعايير الحالية. يمكنك تعديل أو إعادة ضبط فلاتر البحث.
            </p>
            <button
              onClick={handleResetFilters}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              إعادة ضبط الفلاتر
            </button>
          </div>
        ) : (
          /* Table */
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-semibold">
                  <th className="py-3 px-4">التاريخ والوقت</th>
                  <th className="py-3 px-4">المنفذ (Actor)</th>
                  <th className="py-3 px-4">التصنيف</th>
                  <th className="py-3 px-4">الحدث (Event)</th>
                  <th className="py-3 px-4">الكيان (Entity)</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">الأهمية</th>
                  <th className="py-3 px-4 min-w-[200px]">الرسالة</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((item) => {
                  const hasEntity = !!item.entityType && !!item.entityId;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => handleOpenDetails(item)}
                    >
                      {/* createdAt */}
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {formatDateTime(item.createdAt)}
                      </td>

                      {/* actor */}
                      <td className="py-3 px-4">
                        {item.actorUser ? (
                          <div>
                            <p className="font-semibold text-slate-900">{item.actorUser.fullName}</p>
                            <p className="text-[11px] text-slate-400 font-mono">{item.actorUser.email}</p>
                          </div>
                        ) : item.actorUserId ? (
                          <span className="font-mono text-slate-600 text-[11px]">{item.actorUserId}</span>
                        ) : (
                          <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                            {item.actorType}
                          </span>
                        )}
                      </td>

                      {/* category */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <CategoryBadge category={item.category} />
                      </td>

                      {/* event */}
                      <td className="py-3 px-4 font-mono font-medium text-slate-800 whitespace-nowrap">
                        {item.event}
                      </td>

                      {/* entity */}
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {hasEntity ? (
                          <div>
                            <span className="font-semibold text-slate-700">{item.entityType}</span>
                            <span className="text-slate-400 mr-1">/</span>
                            <span className="text-slate-600 truncate max-w-[120px] inline-block align-bottom" title={item.entityId ?? ''}>
                              {item.entityId}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={item.status} />
                      </td>

                      {/* severity */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <SeverityBadge severity={item.severity} />
                      </td>

                      {/* message */}
                      <td className="py-3 px-4 text-slate-700 max-w-xs truncate" title={item.message ?? ''}>
                        {item.message || '—'}
                      </td>

                      {/* actions */}
                      <td
                        className="py-3 px-4 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(item)}
                            className="rounded px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
                          >
                            التفاصيل
                          </button>
                          {hasEntity && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenEntityTimeline(item.entityType!, item.entityId!)
                              }
                              className="rounded px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 transition-colors"
                              title="استعراض المخطط الزمني لهذا الكيان"
                            >
                              المخطط
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Next page pagination footer */}
        {nextCursor && !loading && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-center">
            <button
              onClick={handleLoadNextPage}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-lg bg-white border border-slate-300 px-5 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {loadingMore ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-solid border-slate-700 border-r-transparent" />
                  <span>جاري تحميل المزيد...</span>
                </>
              ) : (
                <>
                  <span>تحميل المزيد من السجلات (الصفحة التالية)</span>
                  <span>↓</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ============================================================= */}
      {/* 1. Details Drawer / Modal */}
      {/* ============================================================= */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white font-bold text-sm">
                  📄
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>تفاصيل سجل التدقيق:</span>
                    <span className="font-mono text-indigo-700">{selectedLog.event}</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    ID: {selectedLog.id}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseDetails}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {detailsError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {detailsError} (يتم عرض البيانات المتاحة محلياً).
                </div>
              )}

              {/* Badges & Timestamp */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={selectedLog.category} />
                  <StatusBadge status={selectedLog.status} />
                  <SeverityBadge severity={selectedLog.severity} />
                  <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                    {selectedLog.actorType}
                  </span>
                </div>
                <div className="text-slate-500 font-mono">
                  {formatDateTime(selectedLog.createdAt)}
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-200 p-4">
                <div>
                  <p className="text-slate-400 mb-1">المنفذ (Actor):</p>
                  <p className="font-semibold text-slate-800">
                    {selectedLog.actorUser
                      ? `${selectedLog.actorUser.fullName} (${selectedLog.actorUser.email})`
                      : selectedLog.actorUserId || selectedLog.actorType}
                  </p>
                  {selectedLog.actorUserId && (
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      User ID: {selectedLog.actorUserId}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-slate-400 mb-1">الكيان المستهدف (Target Entity):</p>
                  {selectedLog.entityType ? (
                    <div>
                      <span className="font-semibold text-slate-800">{selectedLog.entityType}</span>
                      <span className="text-slate-400 mx-1">#</span>
                      <span className="font-mono text-slate-700">{selectedLog.entityId || '—'}</span>
                      {selectedLog.action && (
                        <span className="mr-2 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700 font-mono">
                          action: {selectedLog.action}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">لا يوجد كيان محدد</p>
                  )}
                </div>

                <div>
                  <p className="text-slate-400 mb-1">المسار والطلب (Route & Method):</p>
                  <p className="font-mono text-slate-800">
                    {selectedLog.method ? (
                      <span className="font-bold text-slate-900 ml-1">[{selectedLog.method}]</span>
                    ) : null}
                    {selectedLog.route || '—'}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400 mb-1">معرّف الطلب (Request Correlation ID):</p>
                  <p className="font-mono text-slate-700 select-all">
                    {selectedLog.requestId || '—'}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400 mb-1">عنوان IP ومحدد الجهاز:</p>
                  <p className="font-mono text-slate-700">
                    IP: {selectedLog.ipAddress || '—'}
                  </p>
                  {selectedLog.userAgent && (
                    <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5" title={selectedLog.userAgent}>
                      UA: {selectedLog.userAgent}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-slate-400 mb-1">معرّف الشركة (Company ID):</p>
                  <p className="font-mono text-slate-700">{selectedLog.companyId || '—'}</p>
                </div>
              </div>

              {/* Message */}
              {selectedLog.message && (
                <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                  <p className="text-slate-400 mb-1">الرسالة التوضيحية (Message):</p>
                  <p className="text-slate-800 leading-relaxed">{selectedLog.message}</p>
                </div>
              )}

              {/* JSON Payloads Viewer (Read-only) */}
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">بيانات التغييرات والحمولة:</span>
                    <span className="text-[11px] text-slate-400">(Read-Only JSON)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveJsonTab('metadata')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        activeJsonTab === 'metadata'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Metadata
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveJsonTab('before')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        activeJsonTab === 'before'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Before
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveJsonTab('after')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        activeJsonTab === 'after'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      After
                    </button>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-950 p-4 text-slate-100 overflow-x-auto max-h-64 font-mono text-[11px] leading-relaxed border border-slate-800">
                  {activeJsonTab === 'metadata' && (
                    selectedLog.metadata !== undefined && selectedLog.metadata !== null ? (
                      <pre>{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
                    ) : (
                      <span className="text-slate-500 italic">لا توجد بيانات وصفية (metadata is null)</span>
                    )
                  )}

                  {activeJsonTab === 'before' && (
                    selectedLog.before !== undefined && selectedLog.before !== null ? (
                      <pre>{JSON.stringify(selectedLog.before, null, 2)}</pre>
                    ) : (
                      <span className="text-slate-500 italic">لا توجد حالة سابقة (before is null)</span>
                    )
                  )}

                  {activeJsonTab === 'after' && (
                    selectedLog.after !== undefined && selectedLog.after !== null ? (
                      <pre>{JSON.stringify(selectedLog.after, null, 2)}</pre>
                    ) : (
                      <span className="text-slate-500 italic">لا توجد حالة لاحقة (after is null)</span>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
              <div>
                {selectedLog.entityType && selectedLog.entityId && (
                  <button
                    type="button"
                    onClick={() => {
                      const et = selectedLog.entityType!;
                      const eid = selectedLog.entityId!;
                      handleCloseDetails();
                      void handleOpenEntityTimeline(et, eid);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-teal-300 bg-teal-50 px-3.5 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition-colors"
                  >
                    <span>⏱️</span>
                    <span>استعراض المخطط الزمني لهذا الكيان ({selectedLog.entityType})</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleCloseDetails}
                className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 2. Entity Timeline Drawer / Modal */}
      {/* ============================================================= */}
      {timelineEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white font-bold text-sm">
                  ⏱️
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>المخطط الزمني للكيان:</span>
                    <span className="font-mono text-teal-800">{timelineEntity.entityType}</span>
                    <span className="text-slate-400 font-normal">/</span>
                    <span className="font-mono text-slate-700 text-sm font-normal">{timelineEntity.entityId}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    سجل تاريخي مرتب زمنياً لكافة العمليات التي طرأت على هذا الكيان
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseEntityTimeline}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingTimeline ? (
                <div className="p-12 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-teal-700 border-r-transparent mb-3" />
                  <p className="text-xs text-slate-500">جاري تحميل سجلات الكيان...</p>
                </div>
              ) : timelineError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                  {timelineError}
                </div>
              ) : timelineLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  لا توجد سجلات تدقيق إضافية لهذا الكيان.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-semibold">
                        <th className="py-2.5 px-3">التاريخ والوقت</th>
                        <th className="py-2.5 px-3">الحدث (Event)</th>
                        <th className="py-2.5 px-3">الإجراء (Action)</th>
                        <th className="py-2.5 px-3">التصنيف</th>
                        <th className="py-2.5 px-3">الحالة</th>
                        <th className="py-2.5 px-3">الأهمية</th>
                        <th className="py-2.5 px-3">الرسالة</th>
                        <th className="py-2.5 px-3 text-center">التفاصيل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {timelineLogs.map((tl) => (
                        <tr key={tl.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                            {formatDateTime(tl.createdAt)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                            {tl.event}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {tl.action || '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <CategoryBadge category={tl.category} />
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={tl.status} />
                          </td>
                          <td className="py-2.5 px-3">
                            <SeverityBadge severity={tl.severity} />
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate" title={tl.message ?? ''}>
                            {tl.message || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                handleCloseEntityTimeline();
                                void handleOpenDetails(tl);
                              }}
                              className="rounded px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                            >
                              عرض
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end border-t border-slate-200 px-6 py-4 bg-slate-50">
              <button
                type="button"
                onClick={handleCloseEntityTimeline}
                className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 3. Export Preview Modal */}
      {/* ============================================================= */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white text-sm">
                  📥
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  معاينة تصدير سجل التدقيق (Export Preview)
                </h3>
              </div>
              <button
                onClick={handleCloseExportPreview}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            {loadingExport ? (
              <div className="p-8 text-center">
                <div className="inline-block h-7 w-7 animate-spin rounded-full border-4 border-solid border-slate-700 border-r-transparent mb-2" />
                <p className="text-xs text-slate-500">جاري احتساب عدد السجلات المطابقة...</p>
              </div>
            ) : exportError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {exportError}
              </div>
            ) : exportData ? (
              <div className="space-y-4 text-xs">
                {/* Count KPI Card */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-slate-500 mb-1">إجمالي السجلات المطابقة لشروط التصفية:</p>
                  <p className="text-3xl font-extrabold text-slate-900 font-mono">
                    {exportData.count}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">سجل تدقيق داخل شركتك</p>
                </div>

                {/* Server Response Message */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <p className="font-semibold text-slate-700 mb-1">إشعار النظام (System Message):</p>
                  <p className="text-slate-600 font-mono text-[11px] leading-relaxed">
                    {exportData.message}
                  </p>
                </div>

                {/* Security Disclaimer */}
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900">
                  <p className="font-bold flex items-center gap-1 mb-1">
                    <span>⚠️</span>
                    <span>تنبيه أمني ورقابي:</span>
                  </p>
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    خاصية التحميل المباشر للملفات (CSV / Excel Export) غير مفعلة برمجياً في هذه المرحلة للحفاظ على سرية
                    السجلات المحاسبية والامتثال لمعايير عدم تسريب مسارات التدقيق الحساسة (Export Implemented: false).
                  </p>
                </div>
              </div>
            ) : null}

            {/* Footer */}
            <div className="flex items-center justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={handleCloseExportPreview}
                className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
