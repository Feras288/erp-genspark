// =====================================================
// Phase 7B-6: Reports Backend — e2e smoke tests.
//
// Scope:
//   * 6 read-only GET endpoints under /api/reports/*
//     gated by JwtAuthGuard + PermissionsGuard with
//     @RequirePermissions('reports.read').
//   * Asserts:
//       - 401 without Authorization header.
//       - 403 with valid JWT but without reports.read
//         (uses cashier fixture bootstrapped by the
//          Phase 1 e2e suite — see app.e2e-spec.ts:9).
//       - 200 + body shape (status === 'READY', report
//         matches the route name, companyId / filters /
//         generatedAt / data present).
//       - Query-filter smoke (subset — no brittle totals):
//           sales: fromDate/toDate
//           pos:   paymentMethod=CASH
//           purchases: status=RECEIVED
//           inventory: random productId (must not crash,
//             falls back to ZIR)
//           stock-movements: random warehouseId
//           accounting: status=POSTED
//
// NOT testing:
//   * Money totals are not asserted except for shape and
//     presence — the existing seed has no reports
//     fixtures, so totals are non-deterministic across
//     runs / DB migrations.
//   * No controller / service / DTO changes.
//   * No RBAC catalog edits, no seed edits.
//   * No Date arithmetic on Postgres.
// =====================================================
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';

const API_PREFIX = '/api';

interface ReadyBody {
  report: string;
  status: 'READY' | 'PLANNED';
  companyId?: string;
  filters: unknown;
  generatedAt: string;
  data: unknown;
}

describe('Phase 7B-6: Reports backend (e2e smoke)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  // The cashier fixture is bootstrapped by the Phase 1
  // e2e suite (test '9' cashier-e2e@example.sa +
  // Cashier@123, role key 'cashier_e2e'). It must NOT
  // own `reports.read`. We assume the Phase 1 suite ran
  // first; in a clean run it bootstraps the role+user on
  // its own, so order is preserved by Jest's default
  // serial per-file invocation.
  let cashierToken: string;

  // Phase 8B-3: a single admin agent created in beforeAll
  // is reused across all tests below. Phase 7B-6 minted
  // a fresh admin token via `request(http).post(auth/login)`
  // for every `it()`, which left the TCP connection pool
  // fragmented and caused the second AR/AP shape test
  // (4h) to receive 401 because of socket half-open.
  // Reusing the same agent keeps a stable session and
  // a stable Authorization header.
  let adminAgent: ReturnType<typeof request.agent>;

  const ROUTES: Array<{
    path: string;
    report: string;
    paymentMethod?: string;
    status?: string;
    productId?: string;
    warehouseId?: string;
  }> = [
    { path: 'reports/sales-summary', report: 'sales-summary' },
    { path: 'reports/pos-summary', report: 'pos-summary' },
    { path: 'reports/purchases-summary', report: 'purchases-summary' },
    { path: 'reports/inventory-summary', report: 'inventory-summary' },
    {
      path: 'reports/stock-movements-summary',
      report: 'stock-movements-summary',
    },
    { path: 'reports/accounting-summary', report: 'accounting-summary' },
    // Phase 8B-3 additions: AR + AP modern skeletons →
    //                      READY (Phase 8B-2).
    { path: 'reports/ar-summary', report: 'ar-summary' },
    { path: 'reports/ap-summary', report: 'ap-summary' },
    // Phase 9B-3 addition: AR aging READY (Phase 9B-2).
    // Mirrors the prior AR/AP entries: included in the
    // 401/403/200 loops and the query-filter smoke.
    { path: 'reports/ar-aging', report: 'ar-aging' },
    // Phase 9E-B-3 addition: AP aging READY (Phase 9E-B-2).
    // Same wiring as AR aging — picked up by the 401 /
    // 403 / 200 loops below and by the fromDate/toDate
    // query filter smoke in `it('5)`.
    { path: 'reports/ap-aging', report: 'ap-aging' },
  ];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(helmet());
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    http = app.getHttpServer();

    // Bootstrap cashier role+user via admin. This mirrors
    // Phase 1 suite side-effects in a self-contained way
    // so reports.e2e-spec.ts can run in isolation.
    const adminLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(adminLogin.status).toBe(200);
    const adminToken: string = adminLogin.body.accessToken;
    adminAgent = request.agent(http);
    // Pre-authenticate the shared adminAgent so that
    // every subsequent test can simply call
    // `adminAgent.get(...)` without minting a fresh JWT
    // per test (else socket pool fragmentation made
    // Test 4h flaky — fails with 401 in full suite
    // but passes in isolation).
    adminAgent.set('Authorization', `Bearer ${adminToken}`);

    const roleRes = await adminAgent
      .post(`${API_PREFIX}/rbac/roles`)
      .send({
        name: 'Cashier-E2E',
        key: 'cashier_e2e',
        description: 'try me without reports.read',
      });
    expect([201, 409]).toContain(roleRes.status);

    const userRes = await adminAgent
      .post(`${API_PREFIX}/users`)
      .send({
        email: 'cashier-e2e@example.sa',
        password: 'Cashier@123',
        fullName: 'كاشير اختبار',
        roleKeys: ['cashier_e2e'],
      });
    expect([200, 201, 409]).toContain(userRes.status);

    const cashierLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'cashier-e2e@example.sa', password: 'Cashier@123' });
    expect(cashierLogin.status).toBe(200);
    cashierToken = cashierLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- 1. Auth: 401 without Authorization header ----
  it('1) every report returns 401 without Authorization', async () => {
    for (const r of ROUTES) {
      const res = await request(http).get(`${API_PREFIX}/${r.path}`);
      expect(res.status).toBe(401);
    }
  });

  // ---- 2. RBAC: cashier (no reports.read) → 403 ----
  it('2) cashier (without reports.read) gets 403 on every report', async () => {
    expect(cashierToken).toBeDefined();
    for (const r of ROUTES) {
      const res = await request(http)
        .get(`${API_PREFIX}/${r.path}`)
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    }
  });

  // ---- 3. Success: admin (with reports.read) → 200 + READY ----
  it('3) admin (with reports.read) gets 200 + READY on every report', async () => {
    for (const r of ROUTES) {
      const res = await adminAgent.get(`${API_PREFIX}/${r.path}`);
      expect(res.status).toBe(200);
      const body = res.body as ReadyBody;
      expect(body.report).toBe(r.report);
      expect(body.status).toBe('READY');
      expect(body.companyId).toBeDefined();
      expect(typeof body.companyId).toBe('string');
      expect(body.filters).toBeDefined();
      expect(typeof body.generatedAt).toBe('string');
      expect(body.data).toBeDefined();
      // ISO-8601 sanity
      expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  // ---- 4. Shape-only assertions per endpoint ----
  it('4a) sales-summary data has the expected fields', async () => {
    const res = await adminAgent.get(`${API_PREFIX}/reports/sales-summary`);
    expect(res.status).toBe(200);
    const data = (res.body as ReadyBody).data as Record<string, unknown>;
    for (const k of [
      'invoiceCount',
      'subtotal',
      'vatTotal',
      'discountTotal',
      'total',
      'currency',
      'dateField',
      'statusFilter',
    ]) {
      expect(data).toHaveProperty(k);
    }
    expect(data['currency']).toBe('SAR');
  });

  it('4b) pos-summary data has paymentMethods breakdown', async () => {
    const res = await adminAgent.get(`${API_PREFIX}/reports/pos-summary`);
    expect(res.status).toBe(200);
    const data = (res.body as ReadyBody).data as Record<string, unknown>;
    for (const k of [
      'invoiceCount',
      'subtotal',
      'vatTotal',
      'discountTotal',
      'total',
      'currency',
      'dateField',
      'statusFilter',
      'paymentMethods',
    ]) {
      expect(data).toHaveProperty(k);
    }
    expect(Array.isArray(data['paymentMethods'])).toBe(true);
  });

  it('4c) purchases-summary data has totals', async () => {
    const res = await adminAgent.get(
      `${API_PREFIX}/reports/purchases-summary`,
    );
    expect(res.status).toBe(200);
    const data = (res.body as ReadyBody).data as Record<string, unknown>;
    for (const k of [
      'invoiceCount',
      'subtotal',
      'vatTotal',
      'discountTotal',
      'total',
      'currency',
      'dateField',
      'statusFilter',
    ]) {
      expect(data).toHaveProperty(k);
    }
  });

  it('4d) inventory-summary data has level counts + levels', async () => {
    const res = await adminAgent.get(
      `${API_PREFIX}/reports/inventory-summary`,
    );
    expect(res.status).toBe(200);
    const data = (res.body as ReadyBody).data as Record<string, unknown>;
    for (const k of [
      'levelCount',
      'totalQuantity',
      'totalReservedQuantity',
      'currency',
      'dateField',
      'levels',
    ]) {
      expect(data).toHaveProperty(k);
    }
  });

  it('4e) stock-movements-summary data has counts and breakdowns', async () => {
    const res = await adminAgent.get(
      `${API_PREFIX}/reports/stock-movements-summary`,
    );
    expect(res.status).toBe(200);
    const data = (res.body as ReadyBody).data as Record<string, unknown>;
    for (const k of [
      'movementCount',
      'totalQuantityIn',
      'totalQuantityOut',
      'currency',
      'dateField',
      'byType',
      'byDirection',
      'movements',
    ]) {
      expect(data).toHaveProperty(k);
    }
  });

  it('4f) accounting-summary data has totals + byStatus + recentEntries', async () => {
    const res = await adminAgent.get(
      `${API_PREFIX}/reports/accounting-summary`,
    );
    expect(res.status).toBe(200);
    const data = (res.body as ReadyBody).data as Record<string, unknown>;
    for (const k of [
      'entryCount',
      'lineCount',
      'totalDebit',
      'totalCredit',
      'balanceDifference',
      'currency',
      'dateField',
      'statusFilter',
      'byStatus',
      'recentEntries',
    ]) {
      expect(data).toHaveProperty(k);
    }
  });

  // Phase 8B-3 additions: AR + AP shape assertions.

  it('4g) ar-summary data (Phase 8B-2) has SalesInvoice-derived shape', async () => {
    const res = await adminAgent.get(`${API_PREFIX}/reports/ar-summary`);
    expect(res.status).toBe(200);
    const body = res.body as ReadyBody;
    expect(body.report).toBe('ar-summary');
    expect(body.status).toBe('READY');
    expect(typeof body.generatedAt).toBe('string');
    expect(body.filters).toBeDefined();
    const data = body.data as Record<string, unknown>;
    for (const k of [
      'invoiceCount',
      'subtotal',
      'vatTotal',
      'discountTotal',
      'total',
      'currency',
      'dateField',
      'statusFilter',
      'byStatus',
      'recentInvoices',
    ]) {
      expect(data).toHaveProperty(k);
    }
    expect(typeof data['invoiceCount']).toBe('number');
    expect(typeof data['subtotal']).toBe('string');
    expect(typeof data['vatTotal']).toBe('string');
    expect(typeof data['discountTotal']).toBe('string');
    expect(typeof data['total']).toBe('string');
    expect(data['currency']).toBe('SAR');
    expect(data['dateField']).toBe('issueDate');
    expect(Array.isArray(data['byStatus'])).toBe(true);
    expect(Array.isArray(data['recentInvoices'])).toBe(true);
  });

  it('4h) ap-summary data (Phase 8B-2) has PurchaseInvoice-derived shape', async () => {
    const res = await adminAgent.get(`${API_PREFIX}/reports/ap-summary`);
    expect(res.status).toBe(200);
    const body = res.body as ReadyBody;
    expect(body.report).toBe('ap-summary');
    expect(body.status).toBe('READY');
    expect(typeof body.generatedAt).toBe('string');
    expect(body.filters).toBeDefined();
    const data = body.data as Record<string, unknown>;
    for (const k of [
      'invoiceCount',
      'subtotal',
      'vatTotal',
      'discountTotal',
      'total',
      'currency',
      'dateField',
      'statusFilter',
      'byStatus',
      'recentInvoices',
    ]) {
      expect(data).toHaveProperty(k);
    }
    expect(typeof data['invoiceCount']).toBe('number');
    expect(typeof data['subtotal']).toBe('string');
    expect(typeof data['vatTotal']).toBe('string');
    expect(typeof data['discountTotal']).toBe('string');
    expect(typeof data['total']).toBe('string');
    expect(data['currency']).toBe('SAR');
    expect(data['dateField']).toBe('receivedAt');
    expect(Array.isArray(data['byStatus'])).toBe(true);
    expect(Array.isArray(data['recentInvoices'])).toBe(true);
  });

  // ---- Phase 9B-3 — AR aging shape assertions ----
  //
  //   Mirrors the prior 4a-4h shape-only assertions. The
  //   actual `ArAgingData` contract (Phase 9B-2 commit
  //   c85a59d in reports.service.ts) has:
  //
  //     - top-level keys present in `data`:
  //         currency:SAR
  //         dateField:'dueDate'
  //         statusFilter:'ISSUED'   (D4-hard-locked)
  //         buckets: Record<5 keys, { invoiceCount, outstanding }>
  //         totals:  { invoiceCount, outstanding }
  //         byCustomer: { rows: ArAgingCustomerRow[] }
  //
  //     - the 5 bucket keys: 'current' | '1-30' |
  //       '31-60' | '61-90' | '+90'.
  //
  //     - per-bucket payload is intentionally narrow at
  //       the controller boundary: only `invoiceCount`
  //       (number) + `outstanding` (Decimal-as-string
  //       serialised via `.toFixed(4)`). No `key` /
  //       `label` / `lowerDays` / `upperDays` decoration
  //       in the response — that level of labelling is
  //       left to the frontend in 9C-frontend.
  //
  //     - buckets-by-customer property is `byCustomer.rows`
  //       (a tightly-typed ArAgingCustomerRow[]). No
  //       `top` / `otherCount` / `otherOutstanding`
  //       pagination split at this boundary — the seed
  //       is too thin to justify that yet (Phase 9C-code
  //       will rebuild the breakdown at the frontend
  //       layer).
  //
  //     - `asOfDate` is echoed inside `filters.asOfDate`
  //       (server-computed) — not inside `data.asOfDate`.
  //
  //   This block asserts only the keys that the actual
  //   contract exposes. Decimal strings are NOT parsed
  //   to numbers here — that brittle assertion is left
  //   to a unit test if it becomes useful later.
  it('4i) ar-aging data (Phase 9B-2) has the AR aging contract shape', async () => {
    const res = await adminAgent.get(`${API_PREFIX}/reports/ar-aging`);
    expect(res.status).toBe(200);
    const body = res.body as ReadyBody;
    expect(body.report).toBe('ar-aging');
    expect(body.status).toBe('READY');
    expect(body.companyId).toBeDefined();
    expect(typeof body.companyId).toBe('string');
    expect(typeof body.generatedAt).toBe('string');
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // filters: shape + D4 echo
    const filters = body.filters as Record<string, unknown>;
    expect(filters).toBeDefined();
    expect(filters['status']).toBe('ISSUED');
    expect(typeof filters['asOfDate']).toBe('string');
    expect(filters['asOfDate'] as string).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );

    const data = body.data as Record<string, unknown>;

    // 1. data top-level keys match the 9B-2 contract
    for (const k of [
      'currency',
      'dateField',
      'statusFilter',
      'buckets',
      'totals',
      'byCustomer',
    ]) {
      expect(data).toHaveProperty(k);
    }
    expect(data['currency']).toBe('SAR');
    expect(data['dateField']).toBe('dueDate');
    expect(data['statusFilter']).toBe('ISSUED');

    // 2. buckets: exactly 5 keys, all in the canonical
    //    bucket ring (no-key/label/lowerDays/upperDays
    //    decoration here — that lives on the frontend).
    const buckets = data['buckets'] as Record<string, unknown>;
    expect(buckets).toBeDefined();
    expect(typeof buckets).toBe('object');
    expect(Array.isArray(buckets)).toBe(false);
    const bucketKeys = Object.keys(buckets).sort();
    expect(bucketKeys).toEqual(['+90', '1-30', '31-60', '61-90', 'current']);
    for (const k of bucketKeys) {
      expect(buckets[k]).toBeDefined();
      const b = buckets[k] as Record<string, unknown>;
      expect(typeof b['invoiceCount']).toBe('number');
      expect(typeof b['outstanding']).toBe('string');
    }

    // 3. totals: shape only (no numeric asserts — seed
    //    has no AR aging fixtures).
    const totals = data['totals'] as Record<string, unknown>;
    expect(totals).toBeDefined();
    expect(typeof totals['invoiceCount']).toBe('number');
    expect(typeof totals['outstanding']).toBe('string');

    // 4. byCustomer: rows array only (no top/otherCount).
    const byCustomer = data['byCustomer'] as Record<string, unknown>;
    expect(byCustomer).toBeDefined();
    expect(Array.isArray(byCustomer['rows'])).toBe(true);
    const rows = byCustomer['rows'] as Array<Record<string, unknown>>;
    // No deterministic count assertion — empty seed is
    // acceptable as long as the array exists.
    for (const row of rows) {
      for (const col of [
        'customerId',
        'customerCode',
        'customerName',
        'total',
        'paid',
        'outstanding',
        'buckets',
      ]) {
        expect(row).toHaveProperty(col);
      }
    }
  });

  // Phase 9E-B-3: AP aging contract shape. Mirrors the
  // AR aging block above (4i). Differences:
  //   * `filters.status` echoes 'RECEIVED' (the D4
  //     hard-lock — service.ts) regardless of any
  //     query.status override.
  //   * `data.dateField` is 'receivedAt' (not 'dueDate'
  //     — AP uses the canonical PurchaseInvoice column
  //     for aging).
  //   * `data.statusFilter` is 'RECEIVED'.
  //   * The per-row breakdown is `bySupplier.rows` (not
  //     `byCustomer.rows`) — PurchaseInvoice has no
  //     `customerId`.
  //   * Per-supplier rows have no `paid` column —
  //     `PurchaseInvoice.paidAmount` does not exist on
  //     the schema (schema.prisma lines 507-545), so
  //     `outstanding = total` always and the `paid`
  //     field would carry no information.
  it('4j) ap-aging data (Phase 9E-B-3) has the AP aging contract shape', async () => {
    const res = await adminAgent.get(`${API_PREFIX}/reports/ap-aging`);
    expect(res.status).toBe(200);
    const body = res.body as ReadyBody;
    expect(body.report).toBe('ap-aging');
    expect(body.status).toBe('READY');
    expect(body.companyId).toBeDefined();
    expect(typeof body.companyId).toBe('string');
    expect(typeof body.generatedAt).toBe('string');
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // filters: shape + D4 echo (RECEIVED)
    const filters = body.filters as Record<string, unknown>;
    expect(filters).toBeDefined();
    expect(filters['status']).toBe('RECEIVED');
    expect(typeof filters['asOfDate']).toBe('string');
    expect(filters['asOfDate'] as string).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );

    const data = body.data as Record<string, unknown>;

    // 1. data top-level keys match the 9E-B-2 contract
    for (const k of [
      'currency',
      'dateField',
      'statusFilter',
      'buckets',
      'totals',
      'bySupplier',
    ]) {
      expect(data).toHaveProperty(k);
    }
    expect(data['currency']).toBe('SAR');
    expect(data['dateField']).toBe('receivedAt');
    expect(data['statusFilter']).toBe('RECEIVED');

    // 2. buckets: exactly 5 keys, all in the canonical
    //    bucket ring (matches the AR-side bucket keys
    //    1:1; service.ts `computeApAgingBucket` uses
    //    the same 5-key classification).
    const buckets = data['buckets'] as Record<string, unknown>;
    expect(buckets).toBeDefined();
    expect(typeof buckets).toBe('object');
    expect(Array.isArray(buckets)).toBe(false);
    const bucketKeys = Object.keys(buckets).sort();
    expect(bucketKeys).toEqual(['+90', '1-30', '31-60', '61-90', 'current']);
    for (const k of bucketKeys) {
      expect(buckets[k]).toBeDefined();
      const b = buckets[k] as Record<string, unknown>;
      expect(typeof b['invoiceCount']).toBe('number');
      expect(typeof b['outstanding']).toBe('string');
    }

    // 3. totals: shape only (no numeric asserts — seed
    //    has no AP aging fixtures).
    const totals = data['totals'] as Record<string, unknown>;
    expect(totals).toBeDefined();
    expect(typeof totals['invoiceCount']).toBe('number');
    expect(typeof totals['outstanding']).toBe('string');

    // 4. bySupplier: rows array only (no top/otherCount,
    //    no per-row numeric asserts). Each row carries
    //    supplierId/supplierCode/supplierName labels,
    //    total + outstanding aggregations, and the
    //    per-bucket matrix. NO `paid` column (AP has
    //    no schema-level paidAmount; see comment above).
    const bySupplier = data['bySupplier'] as Record<string, unknown>;
    expect(bySupplier).toBeDefined();
    expect(Array.isArray(bySupplier['rows'])).toBe(true);
    const rows = bySupplier['rows'] as Array<Record<string, unknown>>;
    // No deterministic count assertion — empty seed is
    // acceptable as long as the array exists.
    for (const row of rows) {
      for (const col of [
        'supplierId',
        'supplierCode',
        'supplierName',
        'total',
        'outstanding',
        'buckets',
      ]) {
        expect(row).toHaveProperty(col);
      }
    }
  });

  // ---- 5. Query filter smoke: shape preserved on filters ----
  it('5) query filters are accepted and preserve 200 + READY + shape', async () => {
    const calls: Array<Promise<request.Response>> = [
      adminAgent
        .get(`${API_PREFIX}/reports/sales-summary`)
        .query({ fromDate: '2026-01-01', toDate: '2026-12-31' }),
      adminAgent
        .get(`${API_PREFIX}/reports/pos-summary`)
        .query({ paymentMethod: 'CASH' }),
      adminAgent
        .get(`${API_PREFIX}/reports/purchases-summary`)
        .query({ status: 'RECEIVED' }),
      adminAgent
        .get(`${API_PREFIX}/reports/inventory-summary`)
        .query({
          productId:
            '00000000-0000-0000-0000-000000000000'.replace(/0/g, '0'),
        }),
      adminAgent
        .get(`${API_PREFIX}/reports/stock-movements-summary`)
        .query({
          warehouseId:
            '00000000-0000-0000-0000-000000000000'.replace(/0/g, '0'),
        }),
      adminAgent
        .get(`${API_PREFIX}/reports/accounting-summary`)
        .query({ status: 'POSTED' }),
      // Phase 8B-3 additions: AR + AP query filter smoke.
      // No `customerId` / `supplierId` filter here because
      // the report seed does not deterministically expose
      // any partner id (the existing seed has no reports
      // fixtures — Phase 7B-6 documented).
      adminAgent
        .get(`${API_PREFIX}/reports/ar-summary`)
        .query({
          fromDate: '2026-01-01',
          toDate: '2026-12-31',
          status: 'ISSUED',
        }),
      adminAgent
        .get(`${API_PREFIX}/reports/ap-summary`)
        .query({
          fromDate: '2026-01-01',
          toDate: '2026-12-31',
          status: 'RECEIVED',
        }),
      // Phase 9B-3 addition: AR aging query smoke.
      // The fromDate/toDate pair hits the OR-grouped
      // `(dueDate ∈ range) OR (dueDate IS NULL AND
      // issueDate ∈ range)` filter in service.ts. Not
      // passing `status` here is intentional: the
      // service hard-locks status to ISSUED regardless
      // of any query override (D4 from 9B-1/9B-2).
      adminAgent
        .get(`${API_PREFIX}/reports/ar-aging`)
        .query({
          fromDate: '2026-01-01',
          toDate: '2026-12-31',
        }),
      // Phase 9E-B-3 addition: AP aging query smoke.
      // The fromDate/toDate pair hits the 3-leg OR-grouped
      // `(receivedAt ∈ range) OR (receivedAt IS NULL AND
      // dueDate ∈ range) OR (receivedAt IS NULL AND
      // dueDate IS NULL AND purchaseDate ∈ range)` filter
      // in service.ts. Not passing `status` here is
      // intentional: the service hard-locks status to
      // RECEIVED regardless of any query override (D4
      // from 9E-B-1/9E-B-2).
      adminAgent
        .get(`${API_PREFIX}/reports/ap-aging`)
        .query({
          fromDate: '2026-01-01',
          toDate: '2026-12-31',
        }),
    ];

    const results = await Promise.all(calls);
    for (const res of results) {
      expect(res.status).toBe(200);
      const body = res.body as ReadyBody;
      expect(body.status).toBe('READY');
      expect(typeof body.report).toBe('string');
      expect(body.data).toBeDefined();
    }
  });
});
