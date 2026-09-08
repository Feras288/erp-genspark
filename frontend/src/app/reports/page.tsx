'use client';

// =====================================================
// Phase 7C — Reports page.
//
// Six sections, one per backend report endpoint:
//   1. sales-summary             (ملخص المبيعات)
//   2. pos-summary               (ملخص نقاط البيع)
//   3. purchases-summary         (ملخص المشتريات)
//   4. inventory-summary         (ملخص المخزون)
//   5. stock-movements-summary   (ملخص حركات المخزون)
//   6. accounting-summary        (ملخص القيود المحاسبية)
//
// RBAC: only users with `reports.read` may view the page;
// users without it see "ليست لديك صلاحية عرض التقارير".
//
// Constraints:
//   - Arabic/RTL UI, responsive, cards + tables only.
//   - No charts. No PDF/Excel export. No README.
//   - All money is string-typed (Decimal @db.Decimal(18,4));
//     formatting via Number()/toLocaleString() is done
//     only for display; never for arithmetic.
//   - Token retrieval uses the existing in-memory Bearer
//     token from lib/api (no localStorage / sessionStorage).
//   - Filter state is component-local React state only.
//   - No mock data.
// =====================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import type {
  AccountingSummaryReport,
  InventorySummaryReport,
  PosSummaryReport,
  PurchasesSummaryReport,
  ReportQueryParams,
  SalesSummaryReport,
  StockMovementsSummaryReport,
} from '@/lib/api';

// ---- Local view-model types -----------------------------------
//
// Each section stores its own typed body so downstream components
// can rely on narrowed `r.data` access. `body: unknown` while
// status is 'idle' / 'loading' / 'error' / 'empty'.

type SectionKey =
  | 'sales'
  | 'pos'
  | 'purchases'
  | 'inventory'
  | 'stock-movements'
  | 'accounting';

type SectionStatus = 'idle' | 'loading' | 'ok' | 'empty' | 'error';

interface SectionState<TBody = unknown> {
  status: SectionStatus;
  error: string | null;
  body: TBody | null;
}

function emptySectionState(): SectionState<unknown> {
  return { status: 'idle', error: null, body: null };
}

// ---- Filter form ------------------------------------------------

interface FilterFormState {
  fromDate: string;
  toDate: string;
  status: string;
  paymentMethod: string;
  productId: string;
  warehouseId: string;
}

function emptyFilters(): FilterFormState {
  return {
    fromDate: '',
    toDate: '',
    status: '',
    paymentMethod: '',
    productId: '',
    warehouseId: '',
  };
}

function filtersToQuery(f: FilterFormState): ReportQueryParams {
  const q: ReportQueryParams = {};
  if (f.fromDate) q.fromDate = f.fromDate;
  if (f.toDate) q.toDate = f.toDate;
  if (f.status) q.status = f.status;
  if (f.paymentMethod) q.paymentMethod = f.paymentMethod;
  if (f.productId) q.productId = f.productId;
  if (f.warehouseId) q.warehouseId = f.warehouseId;
  return q;
}

// ---- Formatters -------------------------------------------------

function fmtMoney(s: string | null | undefined): string {
  if (s === null || s === undefined || s === '') return '—';
  // Display only; we never do arithmetic on these. If parsing
  // fails (e.g. malformed backend string), we fall back to the
  // raw value so the user can spot the issue.
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function fmtQty(s: string | null | undefined): string {
  if (s === null || s === undefined || s === '') return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 19).replace('T', ' ');
}

// Arabic labels for enum-like values that the backend echoes back.
const AR_SALES_STATUS: Record<string, string> = {
  DRAFT: 'مسودة',
  ISSUED: 'صادرة',
  CANCELLED: 'ملغاة',
};
const AR_PURCHASE_STATUS: Record<string, string> = {
  DRAFT: 'مسودة',
  RECEIVED: 'مستلمة',
  CANCELLED: 'ملغاة',
};
const AR_JOURNAL_STATUS: Record<string, string> = {
  DRAFT: 'مسودة',
  POSTED: 'مرحّل',
  CANCELLED: 'ملغى',
};
const AR_PAYMENT: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة',
  TRANSFER: 'تحويل',
  OTHER: 'أخرى',
};
const AR_DIRECTION: Record<string, string> = {
  IN: 'داخل',
  OUT: 'خارج',
};

// Human-friendly translation for the six Prisma stock-movement types.
const AR_MOVEMENT_TYPE: Record<string, string> = {
  OPENING_BALANCE: 'رصيد افتتاحي',
  ADJUSTMENT_IN: 'تسوية +',
  ADJUSTMENT_OUT: 'تسوية −',
  TRANSFER_IN: 'تحويل داخل',
  TRANSFER_OUT: 'تحويل خارج',
  PURCHASE_IN: 'استلام مشتريات',
};

function arStockMovementType(t: string): string {
  return AR_MOVEMENT_TYPE[t] ?? t;
}

// ---- Subcomponents ---------------------------------------------

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center text-slate-400 py-4">
        ...جاري التحميل
      </td>
    </tr>
  );
}

function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center text-slate-400 py-4">
        {message}
      </td>
    </tr>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="text-xs text-rose-700 mb-2" dir="rtl">
      {message}
    </p>
  );
}

function SectionHeader({
  title,
  status,
  generatedAt,
}: {
  title: string;
  status: SectionStatus;
  generatedAt: string | null;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      <span className="text-xs text-slate-500">
        {status === 'ok' && generatedAt
          ? `آخر توليد: ${fmtDate(generatedAt)}`
          : status === 'loading'
            ? '...جاري التحميل'
            : status === 'error'
              ? 'تعذّر التحميل'
              : status === 'empty'
                ? 'لا توجد بيانات في النطاق الحالي'
                : '— لم تطلب التحميل بعد —'}
      </span>
    </div>
  );
}

function StatTile({
  label,
  value,
  dir = 'ltr',
}: {
  label: string;
  value: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] text-slate-500" dir="rtl">{label}</div>
      <div className="text-base font-semibold text-slate-800" dir={dir}>{value}</div>
    </div>
  );
}

// ---- Section renderers ------------------------------------------
//
// Each section is a self-contained block: header + filter-aware
// headline + detail table. All sections share the parent page's
// `filters` and `onRefresh` callback so a single "Apply" button
// reloads every report in parallel.

function SalesSection({
  state,
  currency,
}: {
  state: SectionState;
  currency: string;
}) {
  if (state.status === 'idle') {
    return <SectionHeader title="ملخص المبيعات" status="idle" generatedAt={null} />;
  }
  if (state.status === 'loading') {
    return <SectionHeader title="ملخص المبيعات" status="loading" generatedAt={null} />;
  }
  if (state.status === 'error') {
    return (
      <div>
        <SectionHeader title="ملخص المبيعات" status="error" generatedAt={null} />
        <ErrorBanner message={`تعذّر تحميل التقرير: ${state.error}`} />
      </div>
    );
  }
  if (state.status === 'empty' || !state.body) {
    return <SectionHeader title="ملخص المبيعات" status="empty" generatedAt={null} />;
  }
  const r = state.body as SalesSummaryReport;
  return (
    <div>
      <SectionHeader
        title="ملخص المبيعات"
        status="ok"
        generatedAt={r.generatedAt}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <StatTile label="عدد الفواتير" value={fmtInt(r.data.invoiceCount)} />
        <StatTile label="الإجمالي قبل الضريبة" value={`${fmtMoney(r.data.subtotal)} ${currency}`} />
        <StatTile label="إجمالي الضريبة" value={`${fmtMoney(r.data.vatTotal)} ${currency}`} />
        <StatTile label="إجمالي الخصم" value={`${fmtMoney(r.data.discountTotal)} ${currency}`} />
        <StatTile label="الإجمالي شامل الضريبة" value={`${fmtMoney(r.data.total)} ${currency}`} />
        <StatTile label="المدفوع" value={`${fmtMoney(r.data.paidAmount ?? null)} ${currency}`} />
        <StatTile label="فلتر الحالة" value={AR_SALES_STATUS[r.data.statusFilter] ?? r.data.statusFilter} dir="rtl" />
        <StatTile label="نوع التقرير" value={r.data.typeFilter === 'STANDARD' ? 'عادي' : r.data.typeFilter} dir="rtl" />
        <StatTile label="حقل التاريخ" value="تاريخ الإصدار" dir="rtl" />
      </div>
      <p className="text-[11px] text-slate-400">
        السجلات تأتي من النوع STANDARD فقط — لا يشمل فواتير نقاط البيع.
      </p>
    </div>
  );
}

function PosSection({
  state,
  currency,
}: {
  state: SectionState;
  currency: string;
}) {
  if (state.status === 'idle') {
    return <SectionHeader title="ملخص نقاط البيع" status="idle" generatedAt={null} />;
  }
  if (state.status === 'loading') {
    return <SectionHeader title="ملخص نقاط البيع" status="loading" generatedAt={null} />;
  }
  if (state.status === 'error') {
    return (
      <div>
        <SectionHeader title="ملخص نقاط البيع" status="error" generatedAt={null} />
        <ErrorBanner message={`تعذّر تحميل التقرير: ${state.error}`} />
      </div>
    );
  }
  if (state.status === 'empty' || !state.body) {
    return <SectionHeader title="ملخص نقاط البيع" status="empty" generatedAt={null} />;
  }
  const r = state.body as PosSummaryReport;
  return (
    <div>
      <SectionHeader
        title="ملخص نقاط البيع"
        status="ok"
        generatedAt={r.generatedAt}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <StatTile label="عدد الفواتير" value={fmtInt(r.data.invoiceCount)} />
        <StatTile label="الإجمالي قبل الضريبة" value={`${fmtMoney(r.data.subtotal)} ${currency}`} />
        <StatTile label="إجمالي الضريبة" value={`${fmtMoney(r.data.vatTotal)} ${currency}`} />
        <StatTile label="إجمالي الخصم" value={`${fmtMoney(r.data.discountTotal)} ${currency}`} />
        <StatTile label="الإجمالي شامل الضريبة" value={`${fmtMoney(r.data.total)} ${currency}`} />
        <StatTile label="المدفوع" value={`${fmtMoney(r.data.paidAmount ?? null)} ${currency}`} />
        <StatTile label="فلتر الحالة" value={AR_SALES_STATUS[r.data.statusFilter] ?? r.data.statusFilter} dir="rtl" />
        <StatTile label="نوع التقرير" value={r.data.typeFilter === 'POS' ? 'نقطة بيع' : r.data.typeFilter} dir="rtl" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">التوزيع حسب طريقة الدفع</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-start py-1 px-2">طريقة الدفع</th>
              <th className="text-start py-1 px-2">عدد الفواتير</th>
              <th className="text-start py-1 px-2">الإجمالي</th>
              <th className="text-start py-1 px-2">المدفوع</th>
            </tr>
          </thead>
          <tbody>
            {!r.data.paymentMethods || r.data.paymentMethods.length === 0 ? (
              <EmptyRow
                cols={4}
                message={
                  r.data.invoiceCount === 0
                    ? 'لا توجد فواتير بيع في هذا النطاق.'
                    : 'لا يوجد توزيع متاح (تم تطبيق فلتر طريقة دفع محدد).'
                }
              />
            ) : (
              r.data.paymentMethods.map((p, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1 px-2" dir="rtl">
                    {p.paymentMethod
                      ? (AR_PAYMENT[p.paymentMethod] ?? p.paymentMethod)
                      : 'غير محدد'}
                  </td>
                  <td className="py-1 px-2" dir="ltr">{fmtInt(p.invoiceCount)}</td>
                  <td className="py-1 px-2" dir="ltr">{fmtMoney(p.total)} {currency}</td>
                  <td className="py-1 px-2" dir="ltr">
                    {fmtMoney(p.paidAmount ?? null)} {p.paidAmount ? currency : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PurchasesSection({
  state,
  currency,
}: {
  state: SectionState;
  currency: string;
}) {
  if (state.status === 'idle') {
    return <SectionHeader title="ملخص المشتريات" status="idle" generatedAt={null} />;
  }
  if (state.status === 'loading') {
    return <SectionHeader title="ملخص المشتريات" status="loading" generatedAt={null} />;
  }
  if (state.status === 'error') {
    return (
      <div>
        <SectionHeader title="ملخص المشتريات" status="error" generatedAt={null} />
        <ErrorBanner message={`تعذّر تحميل التقرير: ${state.error}`} />
      </div>
    );
  }
  if (state.status === 'empty' || !state.body) {
    return <SectionHeader title="ملخص المشتريات" status="empty" generatedAt={null} />;
  }
  const r = state.body as PurchasesSummaryReport;
  return (
    <div>
      <SectionHeader
        title="ملخص المشتريات"
        status="ok"
        generatedAt={r.generatedAt}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <StatTile label="عدد الفواتير" value={fmtInt(r.data.invoiceCount)} />
        <StatTile label="الإجمالي قبل الضريبة" value={`${fmtMoney(r.data.subtotal)} ${currency}`} />
        <StatTile label="إجمالي الضريبة" value={`${fmtMoney(r.data.vatTotal)} ${currency}`} />
        <StatTile label="إجمالي الخصم" value={`${fmtMoney(r.data.discountTotal)} ${currency}`} />
        <StatTile label="الإجمالي شامل الضريبة" value={`${fmtMoney(r.data.total)} ${currency}`} />
        <StatTile label="فلتر الحالة" value={AR_PURCHASE_STATUS[r.data.statusFilter] ?? r.data.statusFilter} dir="rtl" />
      </div>
      <p className="text-[11px] text-slate-400">
        مرجع التاريخ: {r.data.dateField === 'receivedAt' ? 'تاريخ الاستلام' : 'تاريخ الإنشاء'}.
      </p>
    </div>
  );
}

function InventorySection({ state }: { state: SectionState }) {
  if (state.status === 'idle') {
    return <SectionHeader title="ملخص المخزون" status="idle" generatedAt={null} />;
  }
  if (state.status === 'loading') {
    return <SectionHeader title="ملخص المخزون" status="loading" generatedAt={null} />;
  }
  if (state.status === 'error') {
    return (
      <div>
        <SectionHeader title="ملخص المخزون" status="error" generatedAt={null} />
        <ErrorBanner message={`تعذّر تحميل التقرير: ${state.error}`} />
      </div>
    );
  }
  if (state.status === 'empty' || !state.body) {
    return <SectionHeader title="ملخص المخزون" status="empty" generatedAt={null} />;
  }
  const r = state.body as InventorySummaryReport;
  return (
    <div>
      <SectionHeader
        title="ملخص المخزون"
        status="ok"
        generatedAt={r.generatedAt}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <StatTile label="عدد مستويات المخزون" value={fmtInt(r.data.levelCount)} />
        <StatTile label="إجمالي الكمية" value={fmtQty(r.data.totalQuantity)} />
        <StatTile label="إجمالي الكمية المحجوزة" value={fmtQty(r.data.totalReservedQuantity)} />
      </div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">
        أعلى المستويات حسب الكمية
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-start py-1 px-2">المنتج</th>
              <th className="text-start py-1 px-2">المستودع</th>
              <th className="text-start py-1 px-2">الكمية</th>
              <th className="text-start py-1 px-2">المحجوز</th>
            </tr>
          </thead>
          <tbody>
            {!r.data.levels || r.data.levels.length === 0 ? (
              <EmptyRow
                cols={4}
                message={
                  r.data.levelCount === 0
                    ? 'لا توجد مستويات مخزون في شركتك.'
                    : 'لا توجد صفوف تفاصيل في النطاق المحدد.'
                }
              />
            ) : (
              r.data.levels.slice(0, 50).map((l, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1 px-2" dir="rtl">
                    <div>{l.productName ?? '—'}</div>
                    {l.productSku && (
                      <div className="text-[10px] text-slate-500" dir="ltr">{l.productSku}</div>
                    )}
                  </td>
                  <td className="py-1 px-2" dir="rtl">
                    <div>{l.warehouseName ?? '—'}</div>
                    {l.warehouseCode && (
                      <div className="text-[10px] text-slate-500" dir="ltr">{l.warehouseCode}</div>
                    )}
                  </td>
                  <td className="py-1 px-2" dir="ltr">{fmtQty(l.quantity)}</td>
                  <td className="py-1 px-2" dir="ltr">{fmtQty(l.reservedQuantity)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockMovementsSection({ state }: { state: SectionState }) {
  if (state.status === 'idle') {
    return <SectionHeader title="ملخص حركات المخزون" status="idle" generatedAt={null} />;
  }
  if (state.status === 'loading') {
    return <SectionHeader title="ملخص حركات المخزون" status="loading" generatedAt={null} />;
  }
  if (state.status === 'error') {
    return (
      <div>
        <SectionHeader title="ملخص حركات المخزون" status="error" generatedAt={null} />
        <ErrorBanner message={`تعذّر تحميل التقرير: ${state.error}`} />
      </div>
    );
  }
  if (state.status === 'empty' || !state.body) {
    return <SectionHeader title="ملخص حركات المخزون" status="empty" generatedAt={null} />;
  }
  const r = state.body as StockMovementsSummaryReport;
  return (
    <div>
      <SectionHeader
        title="ملخص حركات المخزون"
        status="ok"
        generatedAt={r.generatedAt}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <StatTile label="عدد الحركات" value={fmtInt(r.data.movementCount)} />
        <StatTile label="إجمالي الداخل" value={fmtQty(r.data.totalQuantityIn)} />
        <StatTile label="إجمالي الخارج" value={fmtQty(r.data.totalQuantityOut)} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">التوزيع حسب النوع</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-start py-1 px-2">النوع</th>
                  <th className="text-start py-1 px-2">عدد</th>
                  <th className="text-start py-1 px-2">الكمية</th>
                </tr>
              </thead>
              <tbody>
                {!r.data.byType || r.data.byType.length === 0 ? (
                  <EmptyRow cols={3} message="لا توجد حركات في النطاق." />
                ) : (
                  r.data.byType.map((b, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1 px-2" dir="rtl">
                        {arStockMovementType(b.movementType)}
                      </td>
                      <td className="py-1 px-2" dir="ltr">{fmtInt(b.movementCount)}</td>
                      <td className="py-1 px-2" dir="ltr">{fmtQty(b.totalQuantity)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">التوزيع حسب الاتجاه</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-start py-1 px-2">الاتجاه</th>
                  <th className="text-start py-1 px-2">عدد</th>
                  <th className="text-start py-1 px-2">الكمية</th>
                </tr>
              </thead>
              <tbody>
                {!r.data.byDirection || r.data.byDirection.length === 0 ? (
                  <EmptyRow cols={3} message="لا توجد حركات في النطاق." />
                ) : (
                  r.data.byDirection.map((b, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1 px-2" dir="rtl">
                        {AR_DIRECTION[b.direction] ?? b.direction}
                      </td>
                      <td className="py-1 px-2" dir="ltr">{fmtInt(b.movementCount)}</td>
                      <td className="py-1 px-2" dir="ltr">{fmtQty(b.totalQuantity)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-slate-700 mb-1 mt-4">
        آخر الحركات
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-start py-1 px-2">النوع</th>
              <th className="text-start py-1 px-2">الاتجاه</th>
              <th className="text-start py-1 px-2">المنتج</th>
              <th className="text-start py-1 px-2">المستودع</th>
              <th className="text-start py-1 px-2">الكمية</th>
              <th className="text-start py-1 px-2">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {!r.data.movements || r.data.movements.length === 0 ? (
              <EmptyRow cols={6} message="لا توجد حركات في النطاق." />
            ) : (
              r.data.movements.slice(0, 30).map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-1 px-2" dir="rtl">{arStockMovementType(m.movementType)}</td>
                  <td className="py-1 px-2" dir="rtl">{AR_DIRECTION[m.direction] ?? m.direction}</td>
                  <td className="py-1 px-2" dir="rtl">
                    <div>{m.productName ?? '—'}</div>
                    {m.productSku && (
                      <div className="text-[10px] text-slate-500" dir="ltr">{m.productSku}</div>
                    )}
                  </td>
                  <td className="py-1 px-2" dir="rtl">
                    <div>{m.warehouseName ?? '—'}</div>
                    {m.warehouseCode && (
                      <div className="text-[10px] text-slate-500" dir="ltr">{m.warehouseCode}</div>
                    )}
                  </td>
                  <td className="py-1 px-2" dir="ltr">{fmtQty(m.quantity)}</td>
                  <td className="py-1 px-2" dir="ltr">{fmtDate(m.movementDate)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountingSection({ state }: { state: SectionState }) {
  if (state.status === 'idle') {
    return <SectionHeader title="ملخص القيود المحاسبية" status="idle" generatedAt={null} />;
  }
  if (state.status === 'loading') {
    return <SectionHeader title="ملخص القيود المحاسبية" status="loading" generatedAt={null} />;
  }
  if (state.status === 'error') {
    return (
      <div>
        <SectionHeader title="ملخص القيود المحاسبية" status="error" generatedAt={null} />
        <ErrorBanner message={`تعذّر تحميل التقرير: ${state.error}`} />
      </div>
    );
  }
  if (state.status === 'empty' || !state.body) {
    return <SectionHeader title="ملخص القيود المحاسبية" status="empty" generatedAt={null} />;
  }
  const r = state.body as AccountingSummaryReport;
  const balanced = Number(r.data.balanceDifference) === 0;
  return (
    <div>
      <SectionHeader
        title="ملخص القيود المحاسبية"
        status="ok"
        generatedAt={r.generatedAt}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <StatTile label="عدد القيود" value={fmtInt(r.data.entryCount)} />
        <StatTile label="عدد الأسطر" value={fmtInt(r.data.lineCount)} />
        <StatTile label="إجمالي المدين" value={fmtMoney(r.data.totalDebit)} />
        <StatTile label="إجمالي الدائن" value={fmtMoney(r.data.totalCredit)} />
        <StatTile
          label="فرق الميزان"
          value={fmtMoney(r.data.balanceDifference)}
        />
        <StatTile
          label="حالة الميزان"
          value={balanced ? '✓ متوازن' : '⚠ غير متوازن'}
          dir="rtl"
        />
      </div>

      <h3 className="text-sm font-semibold text-slate-700 mb-1">التوزيع حسب الحالة</h3>
      <div className="overflow-x-auto mb-3">
        <table className="w-full text-xs">
          <thead className="text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-start py-1 px-2">الحالة</th>
              <th className="text-start py-1 px-2">عدد القيود</th>
              <th className="text-start py-1 px-2">إجمالي المدين</th>
              <th className="text-start py-1 px-2">إجمالي الدائن</th>
            </tr>
          </thead>
          <tbody>
            {!r.data.byStatus || r.data.byStatus.length === 0 ? (
              <EmptyRow cols={4} message="لا توجد قيود في هذا النطاق." />
            ) : (
              r.data.byStatus.map((b, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1 px-2" dir="rtl">
                    {AR_JOURNAL_STATUS[b.status] ?? b.status}
                  </td>
                  <td className="py-1 px-2" dir="ltr">{fmtInt(b.entryCount)}</td>
                  <td className="py-1 px-2" dir="ltr">{fmtMoney(b.totalDebit)}</td>
                  <td className="py-1 px-2" dir="ltr">{fmtMoney(b.totalCredit)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-semibold text-slate-700 mb-1 mt-4">آخر القيود</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 border-b border-slate-200">
            <tr>
              <th className="text-start py-1 px-2">الرقم</th>
              <th className="text-start py-1 px-2">الحالة</th>
              <th className="text-start py-1 px-2">التاريخ</th>
              <th className="text-start py-1 px-2">الوصف</th>
              <th className="text-start py-1 px-2">مدين</th>
              <th className="text-start py-1 px-2">دائن</th>
            </tr>
          </thead>
          <tbody>
            {!r.data.recentEntries || r.data.recentEntries.length === 0 ? (
              <EmptyRow cols={6} message="لا توجد قيود في هذا النطاق." />
            ) : (
              r.data.recentEntries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-1 px-2 font-mono" dir="ltr">{e.entryNumber}</td>
                  <td className="py-1 px-2" dir="rtl">
                    {AR_JOURNAL_STATUS[e.status] ?? e.status}
                  </td>
                  <td className="py-1 px-2" dir="ltr">{fmtDate(e.entryDate)}</td>
                  <td className="py-1 px-2" dir="rtl">{e.description ?? '—'}</td>
                  <td className="py-1 px-2" dir="ltr">{fmtMoney(e.totalDebit)}</td>
                  <td className="py-1 px-2" dir="ltr">{fmtMoney(e.totalCredit)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Main component ---------------------------------------------

export default function ReportsPage() {
  const router = useRouter();
  const { user, loading, hasPermission } = useAuth();

  const canRead = !!user && hasPermission('reports.read');

  // ---- Section state ---------------------------------------------
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>({
    sales: emptySectionState(),
    pos: emptySectionState(),
    purchases: emptySectionState(),
    inventory: emptySectionState(),
    'stock-movements': emptySectionState(),
    accounting: emptySectionState(),
  });

  // ---- Filters ---------------------------------------------------
  const [filters, setFilters] = useState<FilterFormState>(emptyFilters());
  const [filtersApplied, setFiltersApplied] = useState<FilterFormState>(
    emptyFilters(),
  );

  // ---- Routing guard ---------------------------------------------
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // ---- Single-section loader ------------------------------------
  //
  // We use this with Promise.all to fire six requests in parallel.
  // Per-section updates are isolated so one slow endpoint doesn't
  // block others from rendering.

  const loadOne = useCallback(
    async (key: SectionKey) => {
      const q = filtersToQuery(filtersApplied);
      const setSection = (s: SectionState) =>
        setSections((prev) => ({ ...prev, [key]: s }));
      setSection({ ...emptySectionState(), status: 'loading' });
      try {
        let body: unknown;
        switch (key) {
          case 'sales':
            body = (await api.salesSummary(q)).data;
            break;
          case 'pos':
            body = (await api.posSummary(q)).data;
            break;
          case 'purchases':
            body = (await api.purchasesSummary(q)).data;
            break;
          case 'inventory':
            body = (await api.inventorySummary(q)).data;
            break;
          case 'stock-movements':
            body = (await api.stockMovementsSummary(q)).data;
            break;
          case 'accounting':
            body = (await api.accountingSummary(q)).data;
            break;
        }
        setSection({ status: 'ok', error: null, body });
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'فشل غير معروف';
        setSection({ status: 'error', error: msg, body: null });
      }
    },
    [filtersApplied],
  );

  const reloadAll = useCallback(async () => {
    if (!canRead) return;
    await Promise.all(
      (['sales', 'pos', 'purchases', 'inventory', 'stock-movements', 'accounting'] as SectionKey[]).map(
        (k) => loadOne(k),
      ),
    );
  }, [canRead, loadOne]);

  // Auto-load on mount once user/permission confirmed.
  useEffect(() => {
    if (loading) return;
    if (!user || !canRead) return;
    if (sections.sales.status === 'idle') {
      void reloadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, canRead]);

  const onApply = (e: React.FormEvent) => {
    e.preventDefault();
    setFiltersApplied({ ...filters });
    // Force a reload via a microtask so React sees the new
    // filtersApplied value before loadOne runs.
    queueMicrotask(() => void reloadAll());
  };

  const onRefresh = () => {
    void reloadAll();
  };

  const onResetFilters = () => {
    setFilters(emptyFilters());
    setFiltersApplied(emptyFilters());
    queueMicrotask(() => void reloadAll());
  };

  const setFilterField = useCallback(
    <K extends keyof FilterFormState>(k: K, v: FilterFormState[K]) => {
      setFilters((prev) => ({ ...prev, [k]: v }));
    },
    [],
  );

  // ---- Permission gate -------------------------------------------
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-slate-500">...جاري التحميل</p>
      </main>
    );
  }
  if (!user) return null;

  if (!canRead) {
    return (
      <main className="min-h-screen p-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">التقارير</h1>
            <p className="text-sm text-slate-500">
              ملخصات المبيعات، نقاط البيع، المشتريات، المخزون، الحركات،
              والقيود المحاسبية.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm px-4 py-2"
          >
            لوحة المعلومات
          </Link>
        </header>
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-800 mb-2">
            ليست لديك صلاحية عرض التقارير
          </h2>
          <p className="text-sm text-amber-700">
            تتطلب هذه الصفحة صلاحية <span className="font-mono">reports.read</span>{' '}
            على دورك الحالي. يرجى مراجعة مدير النظام لمنحك هذه الصلاحية.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">التقارير</h1>
          <p className="text-sm text-slate-500">
            ملخصات المبيعات، نقاط البيع، المشتريات، المخزون، حركات المخزون،
            والقيود المحاسبية داخل شركتك ({user.companyId}) فقط.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/dashboard"
            className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm px-4 py-2"
          >
            لوحة المعلومات
          </Link>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2"
          >
            تحديث الكل
          </button>
        </div>
      </header>

      {/* ---- Filter panel ---------------------------------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm mb-6">
        <form onSubmit={onApply} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <label className="text-xs text-slate-600">
              من تاريخ
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilterField('fromDate', e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                dir="ltr"
              />
            </label>
            <label className="text-xs text-slate-600">
              إلى تاريخ
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilterField('toDate', e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                dir="ltr"
              />
            </label>
            <label className="text-xs text-slate-600">
              الحالة (مبيعات/مشتريات/قيود)
              <select
                value={filters.status}
                onChange={(e) => setFilterField('status', e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">— الكل —</option>
                <option value="DRAFT">مسودة</option>
                <option value="ISSUED">صادرة (مبيعات)</option>
                <option value="RECEIVED">مستلمة (مشتريات)</option>
                <option value="POSTED">مرحّل (قيود)</option>
                <option value="CANCELLED">ملغى</option>
              </select>
            </label>
            <label className="text-xs text-slate-600">
              طريقة الدفع
              <select
                value={filters.paymentMethod}
                onChange={(e) => setFilterField('paymentMethod', e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">— الكل —</option>
                <option value="CASH">نقدي</option>
                <option value="CARD">بطاقة</option>
                <option value="TRANSFER">تحويل</option>
                <option value="OTHER">أخرى</option>
              </select>
            </label>
            <label className="text-xs text-slate-600">
              معرّف المنتج (اختياري)
              <input
                value={filters.productId}
                onChange={(e) => setFilterField('productId', e.target.value)}
                placeholder="productId"
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                dir="ltr"
              />
            </label>
            <label className="text-xs text-slate-600">
              معرّف المستودع (اختياري)
              <input
                value={filters.warehouseId}
                onChange={(e) => setFilterField('warehouseId', e.target.value)}
                placeholder="warehouseId"
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                dir="ltr"
              />
            </label>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              type="submit"
              className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5"
            >
              تطبيق الفلاتر
            </button>
            <button
              type="button"
              onClick={onResetFilters}
              className="rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs px-3 py-1.5"
            >
              إعادة الضبط
            </button>
            <span className="text-[11px] text-slate-400">
              الفلاتر تُطبَّق على التقارير الستة بشكل متوازٍ.
            </span>
          </div>
        </form>
      </section>

      {/* ---- Report sections (cards) ----------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SalesSection state={sections.sales} currency="SAR" />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <PosSection state={sections.pos} currency="SAR" />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <PurchasesSection state={sections.purchases} currency="SAR" />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <InventorySection state={sections.inventory} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <StockMovementsSection state={sections['stock-movements']} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <AccountingSection state={sections.accounting} />
        </section>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        ملاحظة: كل الأرقام المالية نصوص صرف Decimal @db.Decimal(18,4)
        من الـ backend — لا Number في الحسابات. لا ميزان مراجعة ولا قوائم
        مالية (دخل / ميزانية / VAT / ZATCA) في هذه المرحلة — خارج النطاق.
      </p>
    </main>
  );
}
