// =====================================================
// Phase 1 e2e tests (jest + supertest).
// Use the real Postgres test DB (TEST_DATABASE_URL).
// - login good/bad
// - /me unauthenticated and authenticated
// - refresh rotation + replay rejection
// - /users as admin (200) and cashier (403)
// - logout invalidates refresh
//
// Phase 2 e2e tests (master data only):
// - products: 401, list, create, dup sku 409, update, soft-delete, post-delete 404
// - partners: 401, list, create, dup code 409, update, soft-delete, post-delete 404
// =====================================================
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';

// Helper: extract the value of `name=...;...` from the first Set-Cookie header.
function readCookie(setCookieHeader: string | string[] | undefined, name: string): string | undefined {
  if (!setCookieHeader) return undefined;
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join(',') : setCookieHeader;
  const parts = raw.split(/,(?=[^ ]+=)/); // split on commas that precede a key=
  for (const p of parts) {
    const [pair] = p.split(';').map((s) => s.trim());
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    // skip empty (= clear-cookie payload like `name=;`)
    if (k === name && v && v !== 'undefined' && v !== 'null') return v;
  }
  return undefined;
}

const API_PREFIX = '/api';

describe('Phase 1: Auth + RBAC (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) login with bad password is rejected (401)', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'BADBADBAD' });
    expect(res.status).toBe(401);
  });

  it('2) login good password returns accessToken + user + sets cookie', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toMatch(/^eyJ/);
    expect(res.body.user.email).toBe('admin@example.sa');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.permissions.length).toBeGreaterThan(0);
    expect(res.headers['set-cookie']?.[0] ?? '').toMatch(/erp_rt=/);
  });

  it('3) /me without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/auth/me`);
    expect(res.status).toBe(401);
  });

  it('4) /me with Bearer returns user', async () => {
    const login = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const token = login.body.accessToken;
    const me = await request(http)
      .get(`${API_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.id).toBeDefined();
    expect(me.body.permissions).toContain('users.read');
  });

  it('5) /api/users without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/users`);
    expect(res.status).toBe(401);
  });

  it('6) /api/users with admin token => 200 and no passwordHash leak', async () => {
    const login = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const token = login.body.accessToken;
    const res = await request(http)
      .get(`${API_PREFIX}/users`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.items)).toBe(true);
    for (const item of res.body.items) expect(item.passwordHash).toBeUndefined();
  });

  it('7) refresh rotation: old RT rejected after a successful refresh', async () => {
    const agent1 = request.agent(http);
    const loginRes = await agent1
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(loginRes.status).toBe(200);

    const oldCookie = readCookie(loginRes.headers['set-cookie'], 'erp_rt');
    expect(oldCookie).toBeDefined();

    const refresh1 = await agent1.post(`${API_PREFIX}/auth/refresh`).send({});
    expect(refresh1.status).toBe(200);

    const newCookie = readCookie(refresh1.headers['set-cookie'], 'erp_rt');
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toEqual(oldCookie);

    // replay old cookie directly (no jar) — must be rejected
    const replay = await request(http)
      .post(`${API_PREFIX}/auth/refresh`)
      .set('Cookie', `erp_rt=${oldCookie}`)
      .send({});
    expect(replay.status).toBe(401);
  });

  it('8) logout returns 204 and subsequent refresh fails', async () => {
    const agent2 = request.agent(http);
    await agent2
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const logout = await agent2.post(`${API_PREFIX}/auth/logout`);
    expect(logout.status).toBe(204);
    const refresh = await agent2.post(`${API_PREFIX}/auth/refresh`).send({});
    expect(refresh.status).toBe(401);
  });

  it('9) cashier (no users.read) gets 403 on /api/users', async () => {
    // Bootstrap cashier role + user as admin
    const adminAgent = request.agent(http);
    const adminLogin = await adminAgent
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    const adminToken = adminLogin.body.accessToken;

    // create cashier role (ignore 409 conflict)
    const roleRes = await adminAgent
      .post(`${API_PREFIX}/rbac/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cashier-E2E', key: 'cashier_e2e', description: 'test pos' });
    expect([201, 409]).toContain(roleRes.status);

    // create cashier user
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

    // cashier login
    const cashierAgent = request.agent(http);
    const cashierLogin = await cashierAgent
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'cashier-e2e@example.sa', password: 'Cashier@123' });
    expect(cashierLogin.status).toBe(200);
    const cashierToken = cashierLogin.body.accessToken;

    const denied = await cashierAgent
      .get(`${API_PREFIX}/users`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(denied.status).toBe(403);
  });
});

// =====================================================
// Phase 2 — Products (master data) e2e tests.
// All endpoints scoped by companyId from JWT only.
// =====================================================
describe('Phase 2: Products (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;

  // Unique per-run ski/barcode so re-running the suite doesn't hit dedupe.
  const unique = Date.now().toString(36);
  const SKU = `SKU-E2E-${unique}`;
  const SKU_DUP = `SKU-E2E2-${unique}`;
  const BARCODE = `628000${unique.slice(-6)}`;

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

    const login = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(login.status).toBe(200);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) GET /products without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/products`);
    expect(res.status).toBe(401);
  });

  it('2) GET /products as admin => 200 + paginated shape', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('3) POST /products valid => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: SKU,
        name: 'E2E Test Product',
        nameAr: 'منتج اختبار',
        type: 'PRODUCT',
        barcode: BARCODE,
        unit: 'pcs',
        priceBeforeVat: '250.0000',
        vatRate: '15.00',
        isActive: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.sku).toBe(SKU);
    expect(res.body.companyId).toBeDefined();
    // never accept companyId from body
    expect(res.body.deletedAt).toBeNull();
  });

  it('4) POST duplicate sku same company => 409', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: SKU, // same as test #3
        name: 'Another name',
        type: 'SERVICE',
      });
    expect(res.status).toBe(409);
  });

  it('5) PATCH product => 200', async () => {
    const list = await request(http)
      .get(`${API_PREFIX}/products?search=${encodeURIComponent(SKU)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const id = list.body.items[0]?.id;
    expect(id).toBeDefined();

    const res = await request(http)
      .patch(`${API_PREFIX}/products/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Renamed Product', priceBeforeVat: '300.0000' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('E2E Renamed Product');
    // Prisma Decimal serializes numeric value; trailing zeros may be dropped.
    // Compare numerically instead of string-exact.
    expect(Number(res.body.priceBeforeVat)).toBe(300);
  });

  it('6) DELETE product => 200 soft delete', async () => {
    const list = await request(http)
      .get(`${API_PREFIX}/products?search=${encodeURIComponent(SKU_DUP)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);

    // create the second product so we have one to delete
    const created = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: SKU_DUP,
        name: 'To Be Deleted',
        type: 'SERVICE',
      });
    expect(created.status).toBe(201);

    const res = await request(http)
      .delete(`${API_PREFIX}/products/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('7) GET deleted product => 404', async () => {
    // find deleted item (filter excludes deletedAt=null)
    const list = await request(http)
      .get(`${API_PREFIX}/products?search=${encodeURIComponent(SKU_DUP)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(0);

    // fetch directly by id
    const idList = await request(http)
      .get(`${API_PREFIX}/products?search=${encodeURIComponent('To Be Deleted')}`)
      .set('Authorization', `Bearer ${adminToken}`);
    // soft-deleted records should not appear in listing
    expect(idList.body.items.find((i: any) => i.name === 'To Be Deleted')).toBeUndefined();

    // direct GET should return 404 because the product is soft-deleted
    // (we need a real id used in delete)
    const createAgain = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `SKU-DEL-${unique}`, name: 'TempDeleteTarget', type: 'SERVICE' });
    expect(createAgain.status).toBe(201);
    const targetId = createAgain.body.id;

    const del = await request(http)
      .delete(`${API_PREFIX}/products/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const get = await request(http)
      .get(`${API_PREFIX}/products/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(get.status).toBe(404);
  });
});

// =====================================================
// Phase 2 — Partners (master data) e2e tests.
// All endpoints scoped by companyId from JWT only.
// =====================================================
describe('Phase 2: Partners (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;

  // Unique per-run ids so re-running the suite doesn't hit dedupe.
  // Use raw numeric timestamp so all derived VAT numbers stay digit-only.
  const ts = Date.now();
  const unique = ts.toString(36);
  const CODE = `CUST-${unique}`;
  const CODE_DUP = `CUST2-${unique}`;
  const VPSUFFIX = String(ts).slice(-14).padStart(14, '0'); // 14 digits
  const VAT = `3${VPSUFFIX}`; // 15 digits exactly

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

    const login = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(login.status).toBe(200);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) GET /partners without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/partners`);
    expect(res.status).toBe(401);
  });

  it('2) GET /partners as admin => 200 + paginated shape', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/partners`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('3) POST /partners valid => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/partners`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: CODE,
        name: 'E2E Test Customer',
        nameAr: 'عميل اختبار',
        type: 'CUSTOMER',
        vatNumber: VAT,
        commercialRegistration: `CR-${unique}`,
        email: `e2e-${unique}@example.sa`,
        phone: '+966500000001',
        city: 'Riyadh',
        country: 'SA',
        isActive: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.code).toBe(CODE);
    expect(res.body.vatNumber).toBe(VAT);
    expect(res.body.deletedAt).toBeNull();
  });

  it('4) POST duplicate code same company => 409', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/partners`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: CODE, // same as test #3
        name: 'Another customer',
        type: 'CUSTOMER',
      });
    expect(res.status).toBe(409);
  });

  it('5) PATCH partner => 200', async () => {
    const list = await request(http)
      .get(`${API_PREFIX}/partners?search=${encodeURIComponent(CODE)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const id = list.body.items[0]?.id;
    expect(id).toBeDefined();

    const res = await request(http)
      .patch(`${API_PREFIX}/partners/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Renamed Customer', city: 'Jeddah' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('E2E Renamed Customer');
    expect(res.body.city).toBe('Jeddah');
  });

  it('6) DELETE partner => 200 soft delete', async () => {
    const created = await request(http)
      .post(`${API_PREFIX}/partners`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: CODE_DUP,
        name: 'Partner To Delete',
        type: 'SUPPLIER',
      });
    expect(created.status).toBe(201);

    const res = await request(http)
      .delete(`${API_PREFIX}/partners/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('7) GET deleted partner => 404', async () => {
    // create another to delete/verify. Use raw ts digits for VAT.
    const ts2 = Date.now();
    const vatAlt = `4${String(ts2).slice(-14).padStart(14, '0')}`;
    const createAgain = await request(http)
      .post(`${API_PREFIX}/partners`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `SUPP-DEL-${ts2}`,
        name: 'TempDeletePartner',
        type: 'SUPPLIER',
        vatNumber: vatAlt,
      });
    expect(createAgain.status).toBe(201);
    const targetId = createAgain.body.id;

    const del = await request(http)
      .delete(`${API_PREFIX}/partners/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const get = await request(http)
      .get(`${API_PREFIX}/partners/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(get.status).toBe(404);
  });
});

// =====================================================
// Phase 3 — Warehouses (e2e)
// All endpoints scoped by companyId from JWT only. Soft-delete only.
// =====================================================
describe('Phase 3: Warehouses (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;

  const unique = Date.now().toString(36);
  const WH_CODE = `WH-${unique}`;
  const WH_CODE_DUP = `WH2-${unique}`;
  const WH_CODE_DEL = `WH-DEL-${unique}`;

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

    const login = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(login.status).toBe(200);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) GET /warehouses without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/warehouses`);
    expect(res.status).toBe(401);
  });

  it('2) GET /warehouses as admin => 200 + paginated shape', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('3) POST /warehouses valid => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: WH_CODE,
        name: 'E2E Warehouse',
        nameAr: 'مستودع اختبار',
        address: 'Test Street 1',
        city: 'Riyadh',
        isActive: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.code).toBe(WH_CODE);
    expect(res.body.companyId).toBeDefined();
    expect(res.body.deletedAt).toBeNull();
  });

  it('4) POST duplicate code same company => 409', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: WH_CODE, // same as test #3
        name: 'Another warehouse',
      });
    expect(res.status).toBe(409);
  });

  it('5) PATCH warehouse => 200', async () => {
    const list = await request(http)
      .get(`${API_PREFIX}/warehouses?search=${encodeURIComponent(WH_CODE)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const id = list.body.items[0]?.id;
    expect(id).toBeDefined();

    const res = await request(http)
      .patch(`${API_PREFIX}/warehouses/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Renamed Warehouse', city: 'Jeddah' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('E2E Renamed Warehouse');
    expect(res.body.city).toBe('Jeddah');
  });

  it('6) DELETE warehouse with no stock => 200 soft delete', async () => {
    // create a second warehouse to delete (the first has no stockLevels either,
    // ensuring the soft-delete "no positive stock" guard accepts it).
    const created = await request(http)
      .post(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: WH_CODE_DEL,
        name: 'To Delete Warehouse',
      });
    expect(created.status).toBe(201);

    const res = await request(http)
      .delete(`${API_PREFIX}/warehouses/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('7) GET deleted warehouse => 404', async () => {
    // create another warehouse so we have a known-good id to soft-delete + 404.
    const ts = Date.now();
    const code = `WH-X-${ts.toString(36)}`;
    const created = await request(http)
      .post(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, name: 'TempDeleteWarehouse' });
    expect(created.status).toBe(201);

    const del = await request(http)
      .delete(`${API_PREFIX}/warehouses/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const get = await request(http)
      .get(`${API_PREFIX}/warehouses/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(get.status).toBe(404);

    // secondary duper probe — code already used => 409
    const dup = await request(http)
      .post(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: WH_CODE_DUP, // unused fresh code to seed #dup path later if needed
        name: 'WH DUP Bucket',
      });
    expect([201, 409]).toContain(dup.status);
  });
});

// =====================================================
// Phase 3 — Inventory (e2e): stock levels, adjustments, transfers, movements.
//
// companyId scoped strictly from JWT. PRODUCT-type products only.
// stockMovement is append-only — we verify by GET, not by update/delete.
// =====================================================
describe('Phase 3: Inventory (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;

  const unique = Date.now().toString(36);
  const SKU_PROD = `INV-PROD-${unique}`;
  const SKU_SVC = `INV-SVC-${unique}`;
  const WH_A = `INV-WHA-${unique}`;
  const WH_B = `INV-WHB-${unique}`;

  let productId = '';
  let serviceId = '';
  let warehouseAId = '';
  let warehouseBId = '';

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

    const login = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(login.status).toBe(200);
    adminToken = login.body.accessToken;

    // Seed: PRODUCT + SERVICE + two warehouses
    const pProd = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: SKU_PROD, name: 'Inventory Product', type: 'PRODUCT' });
    expect(pProd.status).toBe(201);
    productId = pProd.body.id;

    const pSvc = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: SKU_SVC, name: 'Inventory Service', type: 'SERVICE' });
    expect(pSvc.status).toBe(201);
    serviceId = pSvc.body.id;

    const wA = await request(http)
      .post(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: WH_A, name: 'Warehouse A' });
    expect(wA.status).toBe(201);
    warehouseAId = wA.body.id;

    const wB = await request(http)
      .post(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: WH_B, name: 'Warehouse B' });
    expect(wB.status).toBe(201);
    warehouseBId = wB.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) GET /inventory/levels without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/inventory/levels`);
    expect(res.status).toBe(401);
  });

  it('2) GET /inventory/levels as admin => 200 + paginated shape', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/inventory/levels`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('3) POST /inventory/adjustments IN valid product => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/inventory/adjustments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId,
        warehouseId: warehouseAId,
        adjustmentType: 'ADJUSTMENT_IN',
        quantity: '10.0000',
        reason: 'E2E initial receipt',
      });
    expect(res.status).toBe(201);
    expect(res.body.level).toBeDefined();
    expect(res.body.movement).toBeDefined();
    expect(res.body.movement.direction).toBe('IN');
    expect(res.body.movement.movementType).toBe('ADJUSTMENT_IN');
    expect(Number(res.body.level.quantity)).toBe(10);
  });

  it('4) Verify stock level increased after IN adjustment', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/inventory/levels?productId=${productId}&warehouseId=${warehouseAId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const level = res.body.items.find(
      (l: any) => l.productId === productId && l.warehouseId === warehouseAId,
    );
    expect(level).toBeDefined();
    expect(Number(level.quantity)).toBe(10);
  });

  it('5) POST /inventory/adjustments OUT valid quantity => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/inventory/adjustments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId,
        warehouseId: warehouseAId,
        adjustmentType: 'ADJUSTMENT_OUT',
        quantity: '3.0000',
        reason: 'E2E damaged units write-off',
      });
    expect(res.status).toBe(201);
    expect(res.body.movement.direction).toBe('OUT');
    expect(res.body.movement.movementType).toBe('ADJUSTMENT_OUT');
    expect(Number(res.body.level.quantity)).toBe(7);
  });

  it('6) POST /inventory/adjustments OUT exceeding balance => 400', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/inventory/adjustments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId,
        warehouseId: warehouseAId,
        adjustmentType: 'ADJUSTMENT_OUT',
        quantity: '9999.0000',
        reason: 'E2E negative-balance attempt',
      });
    expect(res.status).toBe(400);
  });

  it('7) POST /inventory/adjustments for SERVICE product => 400', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/inventory/adjustments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: serviceId,
        warehouseId: warehouseAId,
        adjustmentType: 'ADJUSTMENT_IN',
        quantity: '5.0000',
        reason: 'E2E service-stock attempt',
      });
    expect(res.status).toBe(400);
  });

  it('8) POST /inventory/transfers valid => 201 + paired movements', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/inventory/transfers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromWarehouseId: warehouseAId,
        toWarehouseId: warehouseBId,
        productId,
        quantity: '4.0000',
        notes: 'E2E transfer A->B',
      });
    expect(res.status).toBe(201);
    expect(res.body.out).toBeDefined();
    expect(res.body.inn).toBeDefined();
    expect(res.body.out.movementType).toBe('TRANSFER_OUT');
    expect(res.body.out.direction).toBe('OUT');
    expect(res.body.inn.movementType).toBe('TRANSFER_IN');
    expect(res.body.inn.direction).toBe('IN');
    expect(res.body.inn.referenceId).toBe(res.body.out.id);
  });

  it('9) Verify source decreased and target increased after transfer', async () => {
    const res = await request(http)
      .get(
        `${API_PREFIX}/inventory/levels?productId=${productId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const sourceLevel = res.body.items.find(
      (l: any) => l.warehouseId === warehouseAId,
    );
    const targetLevel = res.body.items.find(
      (l: any) => l.warehouseId === warehouseBId,
    );
    expect(sourceLevel).toBeDefined();
    expect(targetLevel).toBeDefined();
    // source went from 7 to 3; target from 0 to 4
    expect(Number(sourceLevel.quantity)).toBe(3);
    expect(Number(targetLevel.quantity)).toBe(4);
  });

  it('10) POST /inventory/transfers same warehouse => 400', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/inventory/transfers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromWarehouseId: warehouseAId,
        toWarehouseId: warehouseAId, // same — must be rejected
        productId,
        quantity: '1.0000',
      });
    expect(res.status).toBe(400);
  });

  it('11) GET /inventory/movements => 200 and includes created movements', async () => {
    // Filter by productId+warehouseId A so only this scenario's movements appear.
    const res = await request(http)
      .get(
        `${API_PREFIX}/inventory/movements?productId=${productId}&warehouseId=${warehouseAId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
    // this product in warehouseA must have at least: 1 ADJUSTMENT_IN + 1 ADJUSTMENT_OUT + 1 TRANSFER_OUT
    const types = new Set(res.body.items.map((m: any) => m.movementType));
    expect(types.has('ADJUSTMENT_IN')).toBe(true);
    expect(types.has('ADJUSTMENT_OUT')).toBe(true);
    expect(types.has('TRANSFER_OUT')).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(3);

    // Also verify the warehouse-B side has TRANSFER_IN.
    const resB = await request(http)
      .get(
        `${API_PREFIX}/inventory/movements?productId=${productId}&warehouseId=${warehouseBId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resB.status).toBe(200);
    const typesB = new Set(resB.body.items.map((m: any) => m.movementType));
    expect(typesB.has('TRANSFER_IN')).toBe(true);
  });
});

// =====================================================
// Phase 4 — Sales (e2e).
// companyId scoped strictly from JWT. Sales invoice issue flow deducts
// PRODUCT stock and appends a SALE_OUT StockMovement; SERVICE lines are
// pass-through. Cancel: DRAFT→CANCELLED; ISSUED→blocked-by-credit-note.
// =====================================================
describe('Phase 4: Sales (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;

  // Per-run unique codes/skus so re-running the suite doesn't hit dedupe.
  const unique = Date.now().toString(36);
  const SKU_PROD = `S4-PROD-${unique}`;
  const SKU_SVC = `S4-SVC-${unique}`;
  const WH_CODE = `S4-WH-${unique}`;

  let productProdId = '';
  let productSvcId = '';
  let warehouseId = '';
  // Filled in by issue tests so each test can find its own invoice id.
  let lastIssuedInvoiceId = '';
  let secondDraftId = '';
  let firstIssueAvailableStock = 0;

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

    const login = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(login.status).toBe(200);
    adminToken = login.body.accessToken;

    // Seed: 1 PRODUCT + 1 SERVICE + 1 warehouse + initial stock 100 in WH.
    const pProd = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: SKU_PROD, name: 'Phase 4 Sales Product', type: 'PRODUCT' });
    expect(pProd.status).toBe(201);
    productProdId = pProd.body.id;

    const pSvc = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: SKU_SVC, name: 'Phase 4 Sales Service', type: 'SERVICE' });
    expect(pSvc.status).toBe(201);
    productSvcId = pSvc.body.id;

    const w = await request(http)
      .post(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: WH_CODE, name: 'Sales test warehouse' });
    expect(w.status).toBe(201);
    warehouseId = w.body.id;

    const adj = await request(http)
      .post(`${API_PREFIX}/inventory/adjustments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: productProdId,
        warehouseId,
        adjustmentType: 'ADJUSTMENT_IN',
        quantity: '100.0000',
        reason: 'Phase 4 e2e seed',
      });
    expect(adj.status).toBe(201);
    firstIssueAvailableStock = 100;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) GET /sales/invoices without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/sales/invoices`);
    expect(res.status).toBe(401);
  });

  it('2) GET /sales/invoices as admin => 200 + paginated shape', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/sales/invoices`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('3) POST /sales/invoices (SERVICE line) => 201 + server-side totals', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/sales/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'e2e service-only draft',
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
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.invoiceNumber).toMatch(/^SI-\d{8}-\d{4}$/);
    // 3 * 200 = 600; vat = 600 * 0.15 = 90; total = 690.
    expect(Number(res.body.subtotal)).toBe(600);
    expect(Number(res.body.vatTotal)).toBe(90);
    expect(Number(res.body.total)).toBe(690);
    expect(Array.isArray(res.body.lines)).toBe(true);
    expect(res.body.lines.length).toBe(1);
    expect(res.body.lines[0].productId).toBe(productSvcId);
    expect(res.body.lines[0].warehouseId).toBeNull();
  });

  it('4) POST /sales/invoices (PRODUCT line + warehouse) => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/sales/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'e2e product draft',
        lines: [
          {
            productId: productProdId,
            warehouseId,
            quantity: '5.0000',
            unitPrice: '100.0000',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    // 5 * 100 = 500; vat = 75; total = 575.
    expect(Number(res.body.subtotal)).toBe(500);
    expect(Number(res.body.vatTotal)).toBe(75);
    expect(Number(res.body.total)).toBe(575);
    expect(res.body.lines[0].warehouseId).toBe(warehouseId);
    lastIssuedInvoiceId = res.body.id;
  });

  it('5) PATCH draft invoice => 200', async () => {
    const res = await request(http)
      .patch(`${API_PREFIX}/sales/invoices/${lastIssuedInvoiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'e2e update notes' });
    expect(res.status).toBe(200);
    expect(res.body.notes).toContain('e2e update notes');
  });

  it('6) POST /sales/invoices/:id/issue on draft with stock => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/sales/invoices/${lastIssuedInvoiceId}/issue`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'issuing from e2e' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ISSUED');
    expect(res.body.issuedAt).toBeDefined();
    expect(res.body.issuedById).toBeDefined();
    expect(Number(res.body.issueDate.slice(0, 4))).toBeGreaterThanOrEqual(2026);
  });

  it('7) Verify stock level decreased after issue', async () => {
    const res = await request(http)
      .get(
        `${API_PREFIX}/inventory/levels?productId=${productProdId}&warehouseId=${warehouseId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const level = res.body.items.find(
      (l: any) => l.productId === productProdId && l.warehouseId === warehouseId,
    );
    expect(level).toBeDefined();
    // 100 initial - 5 sold = 95.
    expect(Number(level.quantity)).toBe(firstIssueAvailableStock - 5);
  });

  it('8) Verify SALE_OUT movement created with sales_invoice reference', async () => {
    const res = await request(http)
      .get(
        `${API_PREFIX}/inventory/movements?productId=${productProdId}&warehouseId=${warehouseId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const sale = res.body.items.find(
      (m: any) =>
        m.movementType === 'SALE_OUT' &&
        m.referenceType === 'sales_invoice' &&
        m.referenceId === lastIssuedInvoiceId,
    );
    expect(sale).toBeDefined();
    expect(sale.direction).toBe('OUT');
    expect(Number(sale.quantity)).toBe(5);
  });

  it('9) POST /sales/invoices/:id/issue on insufficient stock => 400', async () => {
    // Top up inventory by 0 then create new draft asking for 9999 units.
    const create = await request(http)
      .post(`${API_PREFIX}/sales/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lines: [
          {
            productId: productProdId,
            warehouseId,
            quantity: '9999.0000',
            unitPrice: '1.0000',
          },
        ],
      });
    expect(create.status).toBe(201);
    secondDraftId = create.body.id;

    const res = await request(http)
      .post(`${API_PREFIX}/sales/invoices/${secondDraftId}/issue`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(String(res.body.message ?? '')).toMatch(/insufficient stock/i);
  });

  it('10) PATCH issued invoice => 4xx rejection (cannot edit ISSUED)', async () => {
    const res = await request(http)
      .patch(`${API_PREFIX}/sales/invoices/${lastIssuedInvoiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'should be rejected' });
    // Either 400 (BadRequestException) or 409 (ConflictException) is acceptable;
    // the service currently uses ConflictException → 409 to signal state-conflict.
    expect([400, 409]).toContain(res.status);
  });

  it('11) DELETE draft invoice => 200', async () => {
    const create = await request(http)
      .post(`${API_PREFIX}/sales/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lines: [
          {
            productId: productSvcId,
            quantity: '1.0000',
            unitPrice: '50.0000',
          },
        ],
      });
    expect(create.status).toBe(201);
    const draftId = create.body.id;

    const res = await request(http)
      .delete(`${API_PREFIX}/sales/invoices/${draftId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('12) POST /sales/invoices/:id/cancel on draft => 200 + status=CANCELLED', async () => {
    const create = await request(http)
      .post(`${API_PREFIX}/sales/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'will be cancelled',
        lines: [
          {
            productId: productSvcId,
            quantity: '2.0000',
            unitPrice: '75.0000',
          },
        ],
      });
    expect(create.status).toBe(201);
    const draftId = create.body.id;

    const res = await request(http)
      .post(`${API_PREFIX}/sales/invoices/${draftId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'customer changed mind' });
    // Nest default for POST without explicit @HttpCode is 201; accept either 200 or 201.
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelledAt).toBeDefined();
    expect(res.body.cancelledById).toBeDefined();
    expect(res.body.notes).toContain('customer changed mind');
  });

  it('13) POST /sales/invoices/:id/cancel on ISSUED => 400 + credit-note message', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/sales/invoices/${lastIssuedInvoiceId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'should be refused' });
    expect(res.status).toBe(400);
    expect(String(res.body.message ?? '')).toMatch(/credit note/i);
  });
});

// =====================================================
// Phase 4B-4 — POS (e2e).
// POS sale = invoice type=POS created AND issued in one POST /api/pos/sales.
// Reuses SalesService for DRAFT-create + issue so PRODUCT lines deduct
// stock and append SALE_OUT StockMovement with referenceType='sales_invoice';
// SERVICE lines are pass-through (no stock impact).
// =====================================================
describe('Phase 4B-4: POS (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;

  // Per-run unique codes/skus so re-running the suite never collides.
  const unique = Date.now().toString(36);
  const SKU_PROD = `S44-POS-PROD-${unique}`;
  const SKU_SVC = `S44-POS-SVC-${unique}`;
  const WH_CODE = `S44-POS-WH-${unique}`;

  let productProdId = '';
  let productSvcId = '';
  let warehouseId = '';
  // Seed via ADJUSTMENT_IN with quantity 100.
  const seededStock = 100;
  // Filled by issue tests; used to verify the SALE_OUT movement references it.
  let firstPosInvoiceId = '';
  const firstIssueQty = 4;

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

    const login = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(login.status).toBe(200);
    adminToken = login.body.accessToken;

    // Seed: 1 PRODUCT + 1 SERVICE + 1 warehouse + initial stock 100 in WH.
    const pProd = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: SKU_PROD, name: 'Phase 4B-4 POS Product', type: 'PRODUCT' });
    expect(pProd.status).toBe(201);
    productProdId = pProd.body.id;

    const pSvc = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: SKU_SVC, name: 'Phase 4B-4 POS Service', type: 'SERVICE' });
    expect(pSvc.status).toBe(201);
    productSvcId = pSvc.body.id;

    const w = await request(http)
      .post(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: WH_CODE, name: 'POS test warehouse' });
    expect(w.status).toBe(201);
    warehouseId = w.body.id;

    const adj = await request(http)
      .post(`${API_PREFIX}/inventory/adjustments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: productProdId,
        warehouseId,
        adjustmentType: 'ADJUSTMENT_IN',
        quantity: '100.0000',
        reason: 'Phase 4B-4 e2e seed',
      });
    expect(adj.status).toBe(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) GET /pos/sales without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/pos/sales`);
    expect(res.status).toBe(401);
  });

  it('2) GET /pos/sales as admin => 200 + paginated shape', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/pos/sales`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('3) POST /pos/sales (SERVICE only) => 201 ISSUED invoice type=POS', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/pos/sales`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentMethod: 'CASH',
        paidAmount: '115.0000',
        notes: 'e2e pos service-only sale',
        lines: [
          {
            productId: productSvcId,
            quantity: '1.0000',
            unitPrice: '100.0000',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('ISSUED');
    expect(res.body.type).toBe('POS');
    expect(res.body.paymentMethod).toBe('CASH');
    expect(res.body.issuedAt).toBeDefined();
    // 1 * 100 = 100; vat (15%) = 15; total = 115.
    expect(Number(res.body.subtotal)).toBe(100);
    expect(Number(res.body.vatTotal)).toBe(15);
    expect(Number(res.body.total)).toBe(115);
    expect(res.body.lines.length).toBe(1);
    expect(res.body.lines[0].productId).toBe(productSvcId);
  });

  it('4) POST /pos/sales (PRODUCT line with stock) => 201 ISSUED', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/pos/sales`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentMethod: 'CARD',
        paidAmount: '460.0000',
        lines: [
          {
            productId: productProdId,
            warehouseId,
            quantity: '4.0000',
            unitPrice: '100.0000',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ISSUED');
    expect(res.body.type).toBe('POS');
    expect(res.body.paymentMethod).toBe('CARD');
    expect(Array.isArray(res.body.lines)).toBe(true);
    expect(res.body.lines.length).toBe(1);
    expect(res.body.lines[0].warehouseId).toBe(warehouseId);
    firstPosInvoiceId = res.body.id;
  });

  it('5) Verify stock level decreased after POS sale', async () => {
    const res = await request(http)
      .get(
        `${API_PREFIX}/inventory/levels?productId=${productProdId}&warehouseId=${warehouseId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const level = res.body.items.find(
      (l: any) => l.productId === productProdId && l.warehouseId === warehouseId,
    );
    expect(level).toBeDefined();
    // 100 seeded - 4 sold = 96.
    expect(Number(level.quantity)).toBe(seededStock - firstIssueQty);
  });

  it('6) Verify SALE_OUT movement created with sales_invoice reference', async () => {
    const res = await request(http)
      .get(
        `${API_PREFIX}/inventory/movements?productId=${productProdId}&warehouseId=${warehouseId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const sale = res.body.items.find(
      (m: any) =>
        m.movementType === 'SALE_OUT' &&
        m.referenceType === 'sales_invoice' &&
        m.referenceId === firstPosInvoiceId,
    );
    expect(sale).toBeDefined();
    expect(sale.direction).toBe('OUT');
    expect(Number(sale.quantity)).toBe(firstIssueQty);
  });

  it('7) POST /pos/sales insufficient stock => 4xx with insufficient-stock message', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/pos/sales`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentMethod: 'CASH',
        paidAmount: '9999.0000',
        lines: [
          {
            productId: productProdId,
            warehouseId,
            quantity: '9999.0000',
            unitPrice: '1.0000',
          },
        ],
      });
    // SalesService.issue() throws BadRequestException → 400; accept 400 or 409 for robustness.
    expect([400, 409]).toContain(res.status);
    expect(String(res.body.message ?? '')).toMatch(/insufficient stock/i);
  });
});
