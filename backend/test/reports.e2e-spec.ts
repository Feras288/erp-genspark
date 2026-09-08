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
    const adminAgent = request.agent(http);

    const roleRes = await adminAgent
      .post(`${API_PREFIX}/rbac/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Cashier-E2E',
        key: 'cashier_e2e',
        description: 'try me without reports.read',
      });
    expect([201, 409]).toContain(roleRes.status);

    const userRes = await adminAgent
      .post(`${API_PREFIX}/users`)
      .set('Authorization', `Bearer ${adminToken}`)
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
    const adminLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(adminLogin.status).toBe(200);
    const adminToken: string = adminLogin.body.accessToken;

    for (const r of ROUTES) {
      const res = await request(http)
        .get(`${API_PREFIX}/${r.path}`)
        .set('Authorization', `Bearer ${adminToken}`);
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
    const adminLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const adminToken: string = adminLogin.body.accessToken;

    const res = await request(http)
      .get(`${API_PREFIX}/reports/sales-summary`)
      .set('Authorization', `Bearer ${adminToken}`);
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
    const adminLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const adminToken: string = adminLogin.body.accessToken;

    const res = await request(http)
      .get(`${API_PREFIX}/reports/pos-summary`)
      .set('Authorization', `Bearer ${adminToken}`);
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
    const adminLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const adminToken: string = adminLogin.body.accessToken;

    const res = await request(http)
      .get(`${API_PREFIX}/reports/purchases-summary`)
      .set('Authorization', `Bearer ${adminToken}`);
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
    const adminLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const adminToken: string = adminLogin.body.accessToken;

    const res = await request(http)
      .get(`${API_PREFIX}/reports/inventory-summary`)
      .set('Authorization', `Bearer ${adminToken}`);
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
    const adminLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const adminToken: string = adminLogin.body.accessToken;

    const res = await request(http)
      .get(`${API_PREFIX}/reports/stock-movements-summary`)
      .set('Authorization', `Bearer ${adminToken}`);
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
    const adminLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const adminToken: string = adminLogin.body.accessToken;

    const res = await request(http)
      .get(`${API_PREFIX}/reports/accounting-summary`)
      .set('Authorization', `Bearer ${adminToken}`);
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

  // ---- 5. Query filter smoke: shape preserved on filters ----
  it('5) query filters are accepted and preserve 200 + READY + shape', async () => {
    const adminLogin = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const adminToken: string = adminLogin.body.accessToken;
    const sender = request(http);

    const calls: Array<Promise<request.Response>> = [
      sender
        .get(`${API_PREFIX}/reports/sales-summary`)
        .query({ fromDate: '2026-01-01', toDate: '2026-12-31' })
        .set('Authorization', `Bearer ${adminToken}`),
      sender
        .get(`${API_PREFIX}/reports/pos-summary`)
        .query({ paymentMethod: 'CASH' })
        .set('Authorization', `Bearer ${adminToken}`),
      sender
        .get(`${API_PREFIX}/reports/purchases-summary`)
        .query({ status: 'RECEIVED' })
        .set('Authorization', `Bearer ${adminToken}`),
      sender
        .get(`${API_PREFIX}/reports/inventory-summary`)
        .query({
          productId:
            '00000000-0000-0000-0000-000000000000'.replace(/0/g, '0'),
        })
        .set('Authorization', `Bearer ${adminToken}`),
      sender
        .get(`${API_PREFIX}/reports/stock-movements-summary`)
        .query({
          warehouseId:
            '00000000-0000-0000-0000-000000000000'.replace(/0/g, '0'),
        })
        .set('Authorization', `Bearer ${adminToken}`),
      sender
        .get(`${API_PREFIX}/reports/accounting-summary`)
        .query({ status: 'POSTED' })
        .set('Authorization', `Bearer ${adminToken}`),
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
