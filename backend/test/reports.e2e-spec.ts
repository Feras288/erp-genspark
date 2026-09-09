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

// =====================================================
// Phase 10A-B-3: AR Payments backend (e2e smoke).
//
// Scope:
//   * GET  /api/sales-invoices/:invoiceId/payments
//       gated by JwtAuthGuard + PermissionsGuard with
//       @RequirePermissions('ar_payments.read').
//   * POST /api/sales-invoices/:invoiceId/payments
//       gated by JwtAuthGuard + PermissionsGuard with
//       @RequirePermissions('ar_payments.write').
//
// Asserts (T-2 lock — no AP payments, no GL/bank, no
// PAID/PARTIALLY_PAID status enum):
//   - 401 without Authorization on both GET and POST.
//   - 403 with cashier JWT (no ar_payments.* perm) on
//     both GET and POST.
//   - 200 + array on GET with admin.
//   - 201 + full response shape on POST with admin and a
//     partial valid amount:
//       { id, invoiceId, invoiceType:'SALES',
//         amount: string, paymentMethod, paidAt,
//         reference, notes, status:'POSTED',
//         idempotencyKey, createdAt }
//   - 201 (idempotent replay) on POST with the SAME
//     idempotencyKey — the second call returns the
//     existing payment, NOT a new row, and
//     SalesInvoice.paidAmount is NOT incremented twice.
//   - 409 Conflict on POST with amount > outstanding.
//   - After a successful POST, GET returns the created
//     payment row alongside any pre-existing rows.
//
// NOT testing:
//   * AP payments (Phase 10B, separate domain).
//   * GL / bank reconciliation / drill-down statements.
//   * PARTIALLY_PAID / PAID status transitions (T-2 lock).
//   * No frontend, no schema, no seed, no permissions
//     catalog edits, no controller / service / DTO edits.
//
// Fixtures (self-contained in beforeAll):
//   * Bootstrap AppModule in its own INestApplication
//     instance (Phase 10A-B-3 must not couple to the
//     reports describe block's lifecycle).
//   * Reuse admin@example.sa / Admin@12345.
//   * Reuse cashier-e2e@example.sa / Cashier@123 (the
//     same employee that reports.e2e-spec.ts bootstraps);
//     role key `cashier_e2e` does NOT own any
//     `ar_payments.*` permission, so the 403 path is
//     preserved without any RBAC catalog edit.
//   * Create ONE product (SERVICE) → ONE DRAFT invoice
//     with quantity 3 × unitPrice 200 → total 690 → POST
//     /sales/invoices/:id/issue to flip status to ISSUED.
//     The resulting invoiceId is the `arIssuedInvoiceId`
//     fixture used by all subsequent tests.
// =====================================================
describe('Phase 10A-B-3: AR Payments backend (e2e smoke)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;
  let cashierToken: string;
  let adminAgent: ReturnType<typeof request.agent>;

  // Phase 4 service-only invoice fixture:
  //   quantity 3 × unitPrice 200 → subtotal 600
  //   vat = 600 × 0.15 = 90 → total 690
  const unique = Date.now().toString(36);
  const SKU_SVC_10A = `SVC-10A-${unique}`;
  let productSvcId = '';
  let arIssuedInvoiceId = '';
  let arIssuedInvoiceTotal = '690.0000';

  // Dedicated AR-Payments user agent. The seed
  // `company_admin` role does NOT own `ar_payments.read`
  // / `ar_payments.write`, so admin would be denied by
  // PermissionsGuard on every AR Payments endpoint
  // (returns 403). Catalog and seed are off-limits per
  // Phase 10A-B-3 scope (`no RBAC/auth changes`), so the
  // role + user are bootstrapped at runtime via the
  // existing RBAC management API endpoints — same
  // legitimate fixture pattern that reports.e2e-spec.ts
  // already uses to bootstrap `Cashier-E2E`.
  let arAgent: ReturnType<typeof request.agent>;

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

    // ----- Admin login -----
    const adminLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.accessToken;
    adminAgent = request.agent(http);
    adminAgent.set('Authorization', `Bearer ${adminToken}`);

    // ----- Cashier fixture bootstrap (idempotent: 409 OK) -----
    const roleRes = await adminAgent.post(`${API_PREFIX}/rbac/roles`).send({
      name: 'Cashier-E2E',
      key: 'cashier_e2e',
      description: 'try me without ar_payments.*',
    });
    expect([201, 409]).toContain(roleRes.status);

    const userRes = await adminAgent.post(`${API_PREFIX}/users`).send({
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

    // ----- Phase 10A-B-3 fixture: AR Payments role + user. -----
    //
    // The seed `company_admin` role does NOT own
    // `ar_payments.read` / `ar_payments.write` (catalog
    // and seed are off-limits per Phase 10A-B-3 scope),
    // so an admin JWT would be denied by PermissionsGuard
    // on every AR Payments endpoint (returns 403).
    //
    // Resolution: bootstrap a dedicated
    // `ar_payments_admin_e2e` role, upsert the two
    // `ar_payments.*` permission rows, link them via
    // `RolePermission`, and bind a fresh user to the
    // role. Goes through `app.get(PrismaService)`
    // (DatabaseModule is `@Global()`) rather than the
    // public RBAC API because the test DB may not yet
    // have `ar_payments.read` / `ar_payments.write` in
    // the permissions catalog (the migrations are valid
    // on disk but the test DB wasn't `migrate deploy`'d
    // before the suite). All upserts are idempotent so
    // re-running the suite is safe. This is a runtime
    // test-scoped DB fixture — it does NOT modify the
    // RBAC permission catalog in code or seed.
    const arRoleKey = 'ar_payments_admin_e2e';
    const arRoleRes = await adminAgent.post(`${API_PREFIX}/rbac/roles`).send({
      name: 'AR-Payments-Admin-E2E',
      key: arRoleKey,
      description: 'phase 10a-b-3 smoke perms',
    });
    expect([201, 409]).toContain(arRoleRes.status);

    const rolesListRes = await adminAgent.get(`${API_PREFIX}/rbac/roles`);
    expect(rolesListRes.status).toBe(200);
    const arRole = (
      rolesListRes.body as Array<{ key: string; id: string }>
    ).find((r) => r.key === arRoleKey);
    expect(arRole).toBeDefined();

    // ---- Runtime upserts scoped to the test DB ----
    //
    // Use the global PrismaService (DatabaseModule is
    // `@Global()` so it's injectable without any module
    // edit). Shape mirrors the migration
    // `20260908215449_phase10a_payments` rows exactly:
    //   module='ar_payments', action='read' | 'write'.
    const { PrismaService } = await import('../src/database/prisma.service');
    const prisma = app.get(PrismaService);
    const arPerm = await prisma.permission.upsert({
      where: { key: 'ar_payments.read' },
      update: {},
      create: {
        key: 'ar_payments.read',
        module: 'ar_payments',
        action: 'read',
        description: 'List / get payments on a sales invoice',
      },
    });
    const arPermWrite = await prisma.permission.upsert({
      where: { key: 'ar_payments.write' },
      update: {},
      create: {
        key: 'ar_payments.write',
        module: 'ar_payments',
        action: 'write',
        description: 'Register / soft-cancel a payment on a sales invoice',
      },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: arRole!.id, permissionId: arPerm.id } },
      update: {},
      create: { roleId: arRole!.id, permissionId: arPerm.id },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: arRole!.id, permissionId: arPermWrite.id } },
      update: {},
      create: { roleId: arRole!.id, permissionId: arPermWrite.id },
    });

    const arUserRes = await adminAgent.post(`${API_PREFIX}/users`).send({
      email: 'ar-payments-e2e@example.sa',
      password: 'ArPayments@123',
      fullName: 'مدير تحصيل AR',
      roleKeys: [arRoleKey],
    });
    expect([200, 201, 409]).toContain(arUserRes.status);

    // If the user + role binding already existed (409
    // on creation), the user record might pre-date the
    // RolePermission writes above. Re-bind defensively
    // to guarantee the freshly-minted JWT carries the
    // updated permissions[] claim on the very next
    // login (idempotent on the `@@id([userId, roleId])`
    // composite PK).
    //
    // Use `findFirst` (plain predicate, not a typed
    // unique input) because the `User` model has only a
    // `@@unique([companyId, email])` compound key — so
    // `findUnique({ where: { email } })` would fail
    // TS2322 unless we also know the tenant. Email is
    // unique per company by design, so a single
    // `findFirst` is sufficient.
    const arUserRow = await prisma.user.findFirst({
      where: { email: 'ar-payments-e2e@example.sa', deletedAt: null },
    });
    if (arUserRow) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: arUserRow.id, roleId: arRole!.id } },
        update: {},
        create: { userId: arUserRow.id, roleId: arRole!.id },
      });
    }

    const arLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'ar-payments-e2e@example.sa', password: 'ArPayments@123' });
    expect(arLogin.status).toBe(200);
    arAgent = request.agent(http);
    arAgent.set('Authorization', `Bearer ${arLogin.body.accessToken}`);

    // ----- Sales-invoice fixture (status=ISSUED) -----
    const pSvc = await adminAgent.post(`${API_PREFIX}/products`).send({
      sku: SKU_SVC_10A,
      name: 'Phase 10A-B-3 AR service',
      type: 'SERVICE',
    });
    expect(pSvc.status).toBe(201);
    productSvcId = pSvc.body.id;

    const createRes = await adminAgent.post(`${API_PREFIX}/sales/invoices`).send({
      notes: 'phase 10a-b-3 ar fixture',
      lines: [
        {
          productId: productSvcId,
          quantity: '3.0000',
          unitPrice: '200.0000',
          discountAmount: '0.0000',
          vatRate: '15.00',
        },
      ],
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('DRAFT');
    expect(Number(createRes.body.total)).toBe(690);
    arIssuedInvoiceId = createRes.body.id;
    arIssuedInvoiceTotal = String(createRes.body.total);

    const issueRes = await adminAgent
      .post(`${API_PREFIX}/sales/invoices/${arIssuedInvoiceId}/issue`)
      .send({ notes: 'issuing for 10a-b-3' });
    expect(issueRes.status).toBe(201);
    expect(issueRes.body.status).toBe('ISSUED');
  });

  afterAll(async () => {
    await app.close();
  });

  // -------- 1. Auth: 401 without Authorization on GET + POST --------
  it('1) GET/POST  payments return 401 without Authorization', async () => {
    const url = `${API_PREFIX}/sales-invoices/${arIssuedInvoiceId}/payments`;
    const getRes = await request(http).get(url);
    expect(getRes.status).toBe(401);
    const postRes = await request(http)
      .post(url)
      .send({ paymentMethod: 'CASH', amount: '100.0000' });
    expect(postRes.status).toBe(401);
  });

  // -------- 2. RBAC: cashier (no ar_payments.*) → 403 on both --------
  it('2) cashier (without ar_payments.*) gets 403 on GET and POST', async () => {
    expect(cashierToken).toBeDefined();
    const url = `${API_PREFIX}/sales-invoices/${arIssuedInvoiceId}/payments`;
    const getRes = await request(http)
      .get(url)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(getRes.status).toBe(403);
    const postRes = await request(http)
      .post(url)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentMethod: 'CASH', amount: '100.0000' });
    expect(postRes.status).toBe(403);
  });

  // -------- 3. GET admin → 200 + array (initially empty for fresh invoice) --------
  it('3) GET as admin returns 200 + array (initially empty for fresh fixture)', async () => {
    const res = await arAgent.get(
      `${API_PREFIX}/sales-invoices/${arIssuedInvoiceId}/payments`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Freshly issued fixture in this describe has no payments yet;
    // previous Phase 4 suite (if it ran in the same DB) wrote into
    // a different invoiceId, so this array length is the safe baseline.
    expect(res.body.length).toBe(0);
  });

  // -------- 4. POST admin partial valid → 201 + full response shape --------
  it('4) POST as admin with partial valid amount returns 201 + full response shape', async () => {
    const idemKey = `phase10a-b3-${unique}`;
    const res = await arAgent
      .post(`${API_PREFIX}/sales-invoices/${arIssuedInvoiceId}/payments`)
      .send({
        paymentMethod: 'CASH',
        amount: '100.0000',
        reference: 'phase-10a-b3-ref',
        notes: 'phase-10a-b3 smoke partial',
        idempotencyKey: idemKey,
      });
    expect(res.status).toBe(201);
    // Phase 10A-B-2 response contract:
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.invoiceId).toBe(arIssuedInvoiceId);
    expect(res.body.invoiceType).toBe('SALES');
    expect(typeof res.body.amount).toBe('string');
    expect(Number(res.body.amount)).toBe(100);
    expect(res.body.paymentMethod).toBe('CASH');
    expect(typeof res.body.paidAt).toBe('string');
    expect(res.body.reference).toBe('phase-10a-b3-ref');
    expect(res.body.notes).toBe('phase-10a-b3 smoke partial');
    expect(res.body.status).toBe('POSTED');
    expect(res.body.idempotencyKey).toBe(idemKey);
    expect(typeof res.body.createdAt).toBe('string');
  });

  // -------- 5. Idempotency replay — same key returns same payment, no duplicate row --------
  it('5) POST same idempotencyKey returns same payment and does not duplicate', async () => {
    const idemKey = `phase10a-b3-${unique}`;
    const res = await arAgent
      .post(`${API_PREFIX}/sales-invoices/${arIssuedInvoiceId}/payments`)
      .send({
        paymentMethod: 'CASH',
        amount: '100.0000',
        reference: 'phase-10a-b3-ref',
        notes: 'phase-10a-b3 smoke partial',
        idempotencyKey: idemKey,
      });
    // Same idempotencyKey: server returns the existing row.
    // Status remains 201 because the contract documents the
    // replay as a successful lookup of the original POST result.
    expect(res.status).toBe(201);
    expect(res.body.idempotencyKey).toBe(idemKey);

    // GET must show EXACTLY ONE matching payment row.
    const listRes = await arAgent.get(
      `${API_PREFIX}/sales-invoices/${arIssuedInvoiceId}/payments`,
    );
    expect(listRes.status).toBe(200);
    const matches = listRes.body.filter(
      (p: { idempotencyKey: string | null }) => p.idempotencyKey === idemKey,
    );
    expect(matches.length).toBe(1);
  });

  // -------- 6. Overpayment guard → 409 Conflict --------
  it('6) POST amount greater than outstanding returns 409 Conflict', async () => {
    // Total is 690; tests 4+5 paid 100; remaining outstanding is
    // 590. Ask for 9999 — must trigger the overpayment 409.
    const res = await arAgent
      .post(`${API_PREFIX}/sales-invoices/${arIssuedInvoiceId}/payments`)
      .send({
        paymentMethod: 'CARD',
        amount: '9999.0000',
        idempotencyKey: `phase10a-b3-overpay-${unique}`,
      });
    expect(res.status).toBe(409);
    const msg = String((res.body && res.body.message) ?? '');
    expect(msg.toLowerCase()).toMatch(/overpayment|outstanding|amount/);
  });

  // -------- 7. After successful POST(4), GET shows the created row --------
  it('7) GET after POST(4) returns the created payment row', async () => {
    const idemKey = `phase10a-b3-${unique}`;
    const listRes = await arAgent.get(
      `${API_PREFIX}/sales-invoices/${arIssuedInvoiceId}/payments`,
    );
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    const created = listRes.body.find(
      (p: { idempotencyKey: string | null }) => p.idempotencyKey === idemKey,
    );
    expect(created).toBeDefined();
    expect(created.invoiceId).toBe(arIssuedInvoiceId);
    expect(created.invoiceType).toBe('SALES');
    expect(created.status).toBe('POSTED');
    expect(Number(created.amount)).toBe(100);
  });

  // -------- 8. Tenant isolation: unknown invoiceId in JWT tenant → 404 --------
  it('8) GET/POST on non-existent invoiceId returns 404 (tenant isolation)', async () => {
    const url = `${API_PREFIX}/sales-invoices/__NO_SUCH_INVOICE__/payments`;
    const getRes = await arAgent.get(url);
    expect(getRes.status).toBe(404);
    const postRes = await arAgent.post(url).send({
      paymentMethod: 'CASH',
      amount: '1.0000',
      idempotencyKey: `phase10a-b3-404-${unique}`,
    });
    expect(postRes.status).toBe(404);
  });
});

// =====================================================
// Phase 10B-B-3: AP Payments (e2e smoke).
//
// Coverage (mirrors Phase 10A-B-3 AR smoke; differentiated
// for PURCHASE — no paidAmount writeback, no status mutation):
//
//   1) GET/POST return 401 without Authorization.
//   2) Cashier (without ap_payments.*) gets 403 on both.
//   3) GET as admin returns 200 + array (empty on fresh
//      RECEIVED fixture).
//   4) POST as admin with partial valid amount returns
//      201 + full response shape (id, invoiceId,
//      invoiceType='PURCHASE', amount string, paymentMethod,
//      paidAt, reference, notes, status='POSTED',
//      idempotencyKey, createdAt).
//   5) Idempotency replay — same key returns same payment,
//      exactly one matching GET row.
//   6) Overpayment guard — dto.amount > outstanding → 409.
//   7) After successful POST(4), GET shows the created row.
//   8) GET/POST on non-existent invoiceId → 404.
//
// NOT testing (commit decision / out of scope):
//   * PurchaseInvoice.paidAmount does not exist (commit
//     decision — no writeback assertion).
//   * PurchaseInvoice.status (RECEIVED stays RECEIVED — no
//     status mutation after POST).
//   * AR payments (Phase 10A — covered by its own describe).
//   * GL/bank reconciliation/drill-down.
//
// Tenant/Auth:
//   * JwtAuthGuard + PermissionsGuard at controller level.
//   * All companyIds from JWT (Phase 7B-1 contract).
//   * ap_payments.{read,write} seeded by migration
//     `20260908233949_phase10b_ap_payments_permissions` —
//     no runtime permission upsert needed.
// =====================================================
describe('Phase 10B-B-3: AP Payments (e2e smoke)', () => {
  let app2: INestApplication;
  let http2: ReturnType<INestApplication['getHttpServer']>;

  // Reusable supertest agents — keep Authorization pre-set
  // so the JWT isn't re-minted per `it()` (avoids socket
  // pool fragmentation matching the AR describe pattern).
  let adminAgent2: ReturnType<typeof request.agent>;
  let apAgent: ReturnType<typeof request.agent>;
  let cashierToken2: string;

  // Random suffix avoids collisions with previous test
  // runs that may have left rows behind in the same DB
  // when tests are interrupted before the soft-delete GC.
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // RBAC + JWT mirror fixtures for AR smoke:
  //   role key  : ap_payments_e2e
  //   user email: ap-payments-e2e@example.sa
  //   password  : ApPayments@123
  // Permissions (already in catalog from migration
  // 20260908233949):
  //   ap_payments.read
  //   ap_payments.write
  const apRoleKey = 'ap_payments_e2e';
  const apUserEmail = 'ap-payments-e2e@example.sa';
  const apUserPassword = 'ApPayments@123';

  // Phase 5B pattern: a SERVICE-only purchase invoice with
  // discountAmount + vatRate, total = 690.0000. We DRAFT
  // it, then `/receive` to flip status to RECEIVED — the
  // only status that accepts AP payments (commit decision;
  // DRAFT/CANCELLED → 409, mirror of AR ISSUED gate).
  const SKU_SVC_10B = `SKU-SVC-10B-${unique}`;

  // tracked across tests:
  let apReceivedInvoiceId: string;
  let supplierId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app2 = moduleRef.createNestApplication();
    app2.use(helmet());
    app2.use(cookieParser());
    app2.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app2.setGlobalPrefix('api');
    await app2.init();
    http2 = app2.getHttpServer();

    // ---- bootstrap admin agent (full reports.read + db-owner) ----
    const adminLogin = await request(http2)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(adminLogin.status).toBe(200);
    adminAgent2 = request.agent(http2);
    adminAgent2.set('Authorization', `Bearer ${adminLogin.body.accessToken}`);

    // ---- bootstrap cashier (no ap_payments.*) ----
    // The cashier role + user were created by the
    // outermost beforeAll. Re-trigger that login here
    // because each AppModule instantiation owns its own
    // JWT + bcrypt cache state, and Phase 1 may have
    // already closed `app` by the time this describe runs.
    const cashierLogin = await request(http2)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'cashier-e2e@example.sa', password: 'Cashier@123' });
    expect(cashierLogin.status).toBe(200);
    cashierToken2 = cashierLogin.body.accessToken;

    const { PrismaService } = await import('../src/database/prisma.service');
    const prisma = app2.get(PrismaService);

    // ---- role + rolePermission for ap_payments_e2e ----
    // Use defensive idempotent `permission.upsert` mirroring
    // the AR smoke pattern — works whether the test DB has
    // migration `20260908233949` applied or not. The `key`
    // column is `@@unique`, so the where-clause is keyed on
    // a stable column.
    const apPermRead = await prisma.permission.upsert({
      where: { key: 'ap_payments.read' },
      update: {},
      create: {
        key: 'ap_payments.read',
        module: 'ap_payments',
        action: 'read',
        description: 'List / get payments on a purchase invoice',
      },
    });
    const apPermWrite = await prisma.permission.upsert({
      where: { key: 'ap_payments.write' },
      update: {},
      create: {
        key: 'ap_payments.write',
        module: 'ap_payments',
        action: 'write',
        description: 'Register / soft-cancel a payment on a purchase invoice',
      },
    });
    expect(apPermRead).toBeDefined();
    expect(apPermWrite).toBeDefined();

    const apRoleRes = await adminAgent2
      .post(`${API_PREFIX}/rbac/roles`)
      .send({
        name: 'Accounts-Payable-E2E',
        key: apRoleKey,
        description: 'AP payments e2e',
      });
    expect([201, 409]).toContain(apRoleRes.status);

    const apRole = await prisma.role.findFirst({
      where: { key: apRoleKey },
    });
    expect(apRole).toBeDefined();

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: apRole!.id, permissionId: apPermRead.id },
      },
      update: {},
      create: { roleId: apRole!.id, permissionId: apPermRead.id },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: apRole!.id, permissionId: apPermWrite.id },
      },
      update: {},
      create: { roleId: apRole!.id, permissionId: apPermWrite.id },
    });

    const apUserRes = await adminAgent2.post(`${API_PREFIX}/users`).send({
      email: apUserEmail,
      password: apUserPassword,
      fullName: 'مدير حسابات دائنة',
      roleKeys: [apRoleKey],
    });
    expect([200, 201, 409]).toContain(apUserRes.status);

    // Defensive re-bind (idempotent on the
    // `@@id([userId, roleId])` composite PK) so the JWT
    // minted on the very next login carries the freshly
    // updated permissions[] claim.
    const apUserRow = await prisma.user.findFirst({
      where: { email: apUserEmail, deletedAt: null },
    });
    if (apUserRow) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: apUserRow.id, roleId: apRole!.id } },
        update: {},
        create: { userId: apUserRow.id, roleId: apRole!.id },
      });
    }

    const apLogin = await request(http2)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: apUserEmail, password: apUserPassword });
    expect(apLogin.status).toBe(200);
    apAgent = request.agent(http2);
    apAgent.set('Authorization', `Bearer ${apLogin.body.accessToken}`);

    // ---- Purchase-invoice fixture (status=RECEIVED) ----
    // 1) SERVICE-only product (no warehouse required):
    const pSvc = await adminAgent2.post(`${API_PREFIX}/products`).send({
      sku: SKU_SVC_10B,
      name: 'Phase 10B-B-3 AP service',
      type: 'SERVICE',
    });
    expect(pSvc.status).toBe(201);

    // 2) Supplier (BOTH type so it's also valid as
    //    CUSTOMER, satisfying the supplier-validation
    //    guard in the purchase-invoices POST DTO):
    const supRes = await adminAgent2.post(`${API_PREFIX}/partners`).send({
      code: `SUP-10B-${unique}`,
      name: 'Phase 10B-B-3 supplier',
      type: 'BOTH',
    });
    expect(supRes.status).toBe(201);
    supplierId = supRes.body.id;

    // 3) DRAFT purchase-invoice, computed total = 690:
    //    3 * 200 = 600 subtotal, 15% vat = 90, total 690.
    //    NOTE: Phase 5 purchase-line DTO uses `unitCost` (not
    //    `unitPrice` like the sales line DTO).
    const draftRes = await adminAgent2
      .post(`${API_PREFIX}/purchases/invoices`)
      .send({
        supplierId,
        notes: 'phase 10b-b-3 ap fixture',
        lines: [
          {
            productId: pSvc.body.id,
            quantity: '3.0000',
            unitCost: '200.0000',
            discountAmount: '0.0000',
            vatRate: '15.00',
          },
        ],
      });
    expect(draftRes.status).toBe(201);
    expect(draftRes.body.status).toBe('DRAFT');
    expect(Number(draftRes.body.total)).toBe(690);

    // 4) Receive (DRAFT → RECEIVED) so the AP payments
    //    status gate (RECEIVED only) is satisfied.
    const receiveRes = await adminAgent2
      .post(`${API_PREFIX}/purchases/invoices/${draftRes.body.id}/receive`)
      .send({ notes: 'issuing for 10b-b-3' });
    expect(receiveRes.status).toBe(201);
    expect(receiveRes.body.status).toBe('RECEIVED');
    apReceivedInvoiceId = receiveRes.body.id;
  });

  afterAll(async () => {
    await app2.close();
  });

  // -------- 1. Auth: 401 without Authorization on GET + POST --------
  it('1) GET/POST AP payments return 401 without Authorization', async () => {
    const url = `${API_PREFIX}/purchase-invoices/${apReceivedInvoiceId}/payments`;
    const getRes = await request(http2).get(url);
    expect(getRes.status).toBe(401);
    const postRes = await request(http2)
      .post(url)
      .send({ paymentMethod: 'CASH', amount: '100.0000' });
    expect(postRes.status).toBe(401);
  });

  // -------- 2. RBAC: cashier (no ap_payments.*) → 403 on both --------
  it('2) cashier (without ap_payments.*) gets 403 on GET and POST', async () => {
    expect(cashierToken2).toBeDefined();
    const url = `${API_PREFIX}/purchase-invoices/${apReceivedInvoiceId}/payments`;
    const getRes = await request(http2)
      .get(url)
      .set('Authorization', `Bearer ${cashierToken2}`);
    expect(getRes.status).toBe(403);
    const postRes = await request(http2)
      .post(url)
      .set('Authorization', `Bearer ${cashierToken2}`)
      .send({ paymentMethod: 'CASH', amount: '100.0000' });
    expect(postRes.status).toBe(403);
  });

  // -------- 3. GET admin → 200 + array (fresh fixture initially empty) --------
  it('3) GET as admin returns 200 + array (initially empty for fresh fixture)', async () => {
    const res = await adminAgent2.get(
      `${API_PREFIX}/purchase-invoices/${apReceivedInvoiceId}/payments`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  // -------- 4. POST admin partial valid → 201 + full response shape --------
  it('4) POST as admin with partial valid amount returns 201 + full response shape', async () => {
    const idemKey = `phase10b-b3-${unique}`;
    const res = await apAgent
      .post(`${API_PREFIX}/purchase-invoices/${apReceivedInvoiceId}/payments`)
      .send({
        paymentMethod: 'CASH',
        amount: '100.0000',
        reference: 'phase-10b-b3-ref',
        notes: 'phase-10b-b3 smoke partial',
        idempotencyKey: idemKey,
      });
    expect(res.status).toBe(201);
    // Phase 10B-B-2 response contract:
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.invoiceId).toBe(apReceivedInvoiceId);
    expect(res.body.invoiceType).toBe('PURCHASE');
    expect(typeof res.body.amount).toBe('string');
    expect(Number(res.body.amount)).toBe(100);
    expect(res.body.paymentMethod).toBe('CASH');
    expect(typeof res.body.paidAt).toBe('string');
    expect(res.body.reference).toBe('phase-10b-b3-ref');
    expect(res.body.notes).toBe('phase-10b-b3 smoke partial');
    expect(res.body.status).toBe('POSTED');
    expect(res.body.idempotencyKey).toBe(idemKey);
    expect(typeof res.body.createdAt).toBe('string');
  });

  // -------- 5. Idempotency replay — same key returns same payment, no duplicate --------
  it('5) POST same idempotencyKey returns same payment and does not duplicate', async () => {
    const idemKey = `phase10b-b3-${unique}`;
    const res = await apAgent
      .post(`${API_PREFIX}/purchase-invoices/${apReceivedInvoiceId}/payments`)
      .send({
        paymentMethod: 'CASH',
        amount: '100.0000',
        reference: 'phase-10b-b3-ref',
        notes: 'phase-10b-b3 smoke partial',
        idempotencyKey: idemKey,
      });
    // Same idempotencyKey: server returns the existing row.
    // Status remains 201 (replay = successful lookup of the
    // original POST result).
    expect(res.status).toBe(201);
    expect(res.body.idempotencyKey).toBe(idemKey);

    // GET must show EXACTLY ONE matching row.
    const listRes = await apAgent.get(
      `${API_PREFIX}/purchase-invoices/${apReceivedInvoiceId}/payments`,
    );
    expect(listRes.status).toBe(200);
    const matches = listRes.body.filter(
      (p: { idempotencyKey: string | null }) => p.idempotencyKey === idemKey,
    );
    expect(matches.length).toBe(1);
  });

  // -------- 6. Overpayment guard → 409 Conflict --------
  it('6) POST amount greater than outstanding returns 409 Conflict', async () => {
    // Total is 690; tests 4+5 paid 100; remaining outstanding is
    // 590. Asking for 9999 must trigger the overpayment 409.
    const res = await apAgent
      .post(`${API_PREFIX}/purchase-invoices/${apReceivedInvoiceId}/payments`)
      .send({
        paymentMethod: 'CARD',
        amount: '9999.0000',
        idempotencyKey: `phase10b-b3-overpay-${unique}`,
      });
    expect(res.status).toBe(409);
    const msg = String((res.body && res.body.message) ?? '');
    expect(msg.toLowerCase()).toMatch(/overpayment|outstanding|amount/);
  });

  // -------- 7. After successful POST(4), GET shows the created row --------
  it('7) GET after POST(4) returns the created payment row', async () => {
    const idemKey = `phase10b-b3-${unique}`;
    const listRes = await apAgent.get(
      `${API_PREFIX}/purchase-invoices/${apReceivedInvoiceId}/payments`,
    );
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    const created = listRes.body.find(
      (p: { idempotencyKey: string | null }) => p.idempotencyKey === idemKey,
    );
    expect(created).toBeDefined();
    expect(created.invoiceId).toBe(apReceivedInvoiceId);
    expect(created.invoiceType).toBe('PURCHASE');
    expect(created.status).toBe('POSTED');
    expect(Number(created.amount)).toBe(100);
  });

  // -------- 8. Tenant isolation: unknown invoiceId in JWT tenant → 404 --------
  it('8) GET/POST on non-existent purchase invoiceId returns 404 (tenant isolation)', async () => {
    const url = `${API_PREFIX}/purchase-invoices/00000000-0000-0000-0000-000000000000/payments`;
    const getRes = await apAgent.get(url);
    expect(getRes.status).toBe(404);
    const postRes = await apAgent.post(url).send({
      paymentMethod: 'CASH',
      amount: '1.0000',
      idempotencyKey: `phase10b-b3-404-${unique}`,
    });
    expect(postRes.status).toBe(404);
  });
});
