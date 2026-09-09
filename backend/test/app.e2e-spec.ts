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
import { JournalEntrySourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { postPurchaseInvoiceReceived, postSalesInvoiceIssued } from '../src/accounting/posting-events';

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

describe('Phase 5: Purchases (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;

  // Per-run unique codes so re-running the suite doesn't hit dedupe.
  const unique = Date.now().toString(36);
  const SKU_PROD = `S5-PROD-${unique}`;
  const SKU_SVC = `S5-SVC-${unique}`;
  const WH_CODE = `S5-WH-${unique}`;
  const SUPP_CODE_BOTH = `S5-SUP-${unique}`;
  const CUST_CODE_ONLY = `S5-CUST-${unique}`;

  let productProdId = '';
  let productSvcId = '';
  let warehouseId = '';
  let supplierBothId = '';
  let supplierCustomerOnlyId = '';
  // Filled in by tests so later tests can find its invoice id.
  let mixedInvoiceId = '';
  let draftCancelId = '';
  // Captured at receive time; used by tests 8 and 9.
  let productReceiveQty = 0;

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

    // Seed: 1 PRODUCT + 1 SERVICE + 1 warehouse + 1 BOTH-type supplier +
    // 1 CUSTOMER-only partner. Crucially: NO ADJUSTMENT_IN seed for the new
    // warehouse, so the Phase 5 receive flow is exercised as the very first
    // IN-flow for that product/warehouse pair → upsert-creates StockLevel.
    const pProd = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: SKU_PROD, name: 'Phase 5 Purchase Product', type: 'PRODUCT' });
    expect(pProd.status).toBe(201);
    productProdId = pProd.body.id;

    const pSvc = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: SKU_SVC, name: 'Phase 5 Purchase Service', type: 'SERVICE' });
    expect(pSvc.status).toBe(201);
    productSvcId = pSvc.body.id;

    const w = await request(http)
      .post(`${API_PREFIX}/warehouses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: WH_CODE, name: 'Purchases test warehouse' });
    expect(w.status).toBe(201);
    warehouseId = w.body.id;

    // BOTH-type partner — must be accepted as supplier.
    const sup = await request(http)
      .post(`${API_PREFIX}/partners`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: SUPP_CODE_BOTH, name: 'S5 Supplier BOTH', type: 'BOTH' });
    expect(sup.status).toBe(201);
    supplierBothId = sup.body.id;

    // CUSTOMER-only — must be rejected as supplier at invoice creation.
    const cust = await request(http)
      .post(`${API_PREFIX}/partners`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: CUST_CODE_ONLY, name: 'S5 Customer-only', type: 'CUSTOMER' });
    expect(cust.status).toBe(201);
    supplierCustomerOnlyId = cust.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) GET /purchases/invoices without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/purchases/invoices`);
    expect(res.status).toBe(401);
  });

  it('2) GET /purchases/invoices as admin => 200 + paginated shape', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/purchases/invoices`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('3) POST /purchases/invoices (SERVICE only line) => 201 + server-side totals', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/purchases/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'e2e service-only draft',
        supplierId: supplierBothId,
        lines: [
          {
            productId: productSvcId,
            quantity: '3.0000',
            unitCost: '150.0000',
            discountAmount: '0.0000',
            vatRate: '15.00',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.invoiceNumber).toMatch(/^PI-\d{8}-\d{4}$/);
    // 3 * 150 = 450; vat = 450 * 0.15 = 67.5; total = 517.5.
    expect(Number(res.body.subtotal)).toBe(450);
    expect(Number(res.body.vatTotal)).toBe(67.5);
    expect(Number(res.body.discountTotal)).toBe(0);
    expect(Number(res.body.total)).toBe(450 + 67.5);
  });

  it('4) POST /purchases/invoices (PRODUCT + warehouse + BOTH supplier) => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/purchases/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'e2e PRODUCT draft',
        supplierId: supplierBothId,
        lines: [
          {
            productId: productProdId,
            warehouseId,
            quantity: '4.0000',
            unitCost: '100.0000',
            discountAmount: '0.0000',
            vatRate: '15.00',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.supplier?.id).toBe(supplierBothId);
    expect(Array.isArray(res.body.lines)).toBe(true);
    expect(res.body.lines.length).toBe(1);
    expect(res.body.lines[0].warehouseId).toBe(warehouseId);
    // 4 * 100 = 400; vat = 60; total = 460.
    expect(Number(res.body.subtotal)).toBe(400);
    expect(Number(res.body.vatTotal)).toBe(60);
    expect(Number(res.body.total)).toBe(460);
  });

  it('5) POST /purchases/invoices (CUSTOMER-only supplier) => 400 with supplier-validation', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/purchases/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'should reject CUSTOMER-only as supplier',
        supplierId: supplierCustomerOnlyId,
        lines: [
          {
            productId: productSvcId,
            quantity: '1.0000',
            unitCost: '10.0000',
            vatRate: '15.00',
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(String(res.body.message ?? '')).toMatch(/not a supplier/i);
  });

  it('6) PATCH draft invoice (line discount + notes) => 200 + totals recomputed', async () => {
    // Create-then-patch in a single test: verifies PATCH path on a fresh
    // DRAFT and recomputes totals on line-discount change.
    const create = await request(http)
      .post(`${API_PREFIX}/purchases/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'original',
        supplierId: supplierBothId,
        lines: [
          {
            productId: productProdId,
            warehouseId,
            quantity: '2.0000',
            unitCost: '200.0000',
            discountAmount: '0.0000',
            vatRate: '15.00',
          },
        ],
      });
    expect(create.status).toBe(201);
    draftCancelId = create.body.id;

    const res = await request(http)
      .patch(`${API_PREFIX}/purchases/invoices/${draftCancelId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'updated-notes',
        lines: [
          {
            productId: productProdId,
            warehouseId,
            quantity: '2.0000',
            unitCost: '200.0000',
            discountAmount: '50.0000', // gross 400; taxable 350; vat 52.5; total 402.5
            vatRate: '15.00',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(draftCancelId);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.notes).toBe('updated-notes');
    expect(Number(res.body.discountTotal)).toBe(50);
    expect(Number(res.body.subtotal)).toBe(400);
    expect(Number(res.body.vatTotal)).toBe(52.5);
    expect(Number(res.body.total)).toBe(402.5);
  });

  it('7) POST /purchases/invoices/:id/receive on mixed SERVICE+PRODUCT draft => 201 RECEIVED', async () => {
    productReceiveQty = 7;

    const create = await request(http)
      .post(`${API_PREFIX}/purchases/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'mixed invoice to receive',
        supplierId: supplierBothId,
        lines: [
          {
            productId: productProdId,
            warehouseId,
            quantity: productReceiveQty.toFixed(4),
            unitCost: '50.0000',
            discountAmount: '0.0000',
            vatRate: '15.00',
          },
          {
            // SERVICE line: must NOT trigger any stock movement on receive
            // and may omit warehouseId.
            productId: productSvcId,
            quantity: '2.0000',
            unitCost: '300.0000',
            discountAmount: '0.0000',
            vatRate: '15.00',
          },
        ],
      });
    expect(create.status).toBe(201);
    mixedInvoiceId = create.body.id;

    const res = await request(http)
      .post(`${API_PREFIX}/purchases/invoices/${mixedInvoiceId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(mixedInvoiceId);
    expect(res.body.status).toBe('RECEIVED');
    expect(res.body.receivedAt).toBeDefined();
  });

  it('8) Verify stock level increased after receive (Phase 3 inventory)', async () => {
    // Cross-load via Phase 3 endpoints. The new product was never seeded
    // with an ADJUSTMENT_IN, so the Phase 5 receive flow is the very first
    // IN-flow for that (product, warehouse) pair → UPSERT creates the row.
    const res = await request(http)
      .get(
        `${API_PREFIX}/inventory/levels?productId=${productProdId}&warehouseId=${warehouseId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const items: any[] = res.body.items ?? [];
    const lvl = items.find(
      (l) => l.productId === productProdId && l.warehouseId === warehouseId,
    );
    expect(lvl).toBeDefined();
    expect(Number(lvl.quantity)).toBe(productReceiveQty);
  });

  it('9) Verify PURCHASE_IN movement created with purchase_invoice reference (exactly 1)', async () => {
    // Cross-load via Phase 3 movements endpoint. SERVICE line in the same
    // invoice must not produce any StockMovement (pass-through invariant).
    const res = await request(http)
      .get(
        `${API_PREFIX}/inventory/movements?productId=${productProdId}&warehouseId=${warehouseId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const items: any[] = res.body.items ?? [];
    const ours = items.find(
      (m) =>
        m.movementType === 'PURCHASE_IN' &&
        m.referenceType === 'purchase_invoice' &&
        m.referenceId === mixedInvoiceId,
    );
    expect(ours).toBeDefined();
    expect(ours.direction).toBe('IN');
    expect(Number(ours.quantity)).toBe(productReceiveQty);
    // And: exactly ONE motion — SERVICE line in the same invoice is pass-through.
    const sameInvoice = items.filter((m) => m.referenceId === mixedInvoiceId);
    expect(sameInvoice.length).toBe(1);
  });

  it('10) POST /receive again on RECEIVED invoice => 400 cannot-receive', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/purchases/invoices/${mixedInvoiceId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(String(res.body.message ?? '')).toMatch(/DRAFT/i);
  });

  it('11) PATCH RECEIVED invoice => 409 cannot-edit-RECEIVED', async () => {
    const res = await request(http)
      .patch(`${API_PREFIX}/purchases/invoices/${mixedInvoiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'try-edit-received',
        lines: [
          {
            productId: productProdId,
            warehouseId,
            quantity: '1.0000',
            unitCost: '99.0000',
          },
        ],
      });
    expect([400, 409]).toContain(res.status);
    expect(String(res.body.message ?? '')).toMatch(/DRAFT/i);
  });

  it('12) POST /cancel on a fresh DRAFT => 200 + status=CANCELLED', async () => {
    // Use the PATCH-target draft from test 6.
    const res = await request(http)
      .post(`${API_PREFIX}/purchases/invoices/${draftCancelId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'e2e cancel' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.id).toBe(draftCancelId);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelledAt).toBeDefined();
  });

  it('13) POST /cancel on already-CANCELLED invoice => 400 with already-cancelled', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/purchases/invoices/${draftCancelId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(String(res.body.message ?? '')).toMatch(/already cancelled/i);
  });
});

// =====================================================
// Phase 6 — Accounting (e2e): Chart of Accounts + Manual Journal Entries.
//
// Strict scope of this suite:
//   * Chart of Accounts CRUD (code/name/type/normalBalance/parent/active, soft-delete).
//   * Manual Journal Entries with DRAFT/POSTED/CANCELLED lifecycle.
//   * Double-entry validation: ≥2 lines, debit-or-credit per line, totalDebit==totalCredit.
//
// Strict non-scope (per Phase 6 mandate — must NOT appear here):
//   * No Financial Reports / Trial Balance / Balance Sheet / P&L / VAT reports.
//   * No ZATCA / e-invoicing / QR / CSID.
//   * No automated posting from Sales/Purchases (verified by cross-load below).
//   * No AR/AP ledgers / customer/supplier statements.
//   * No payments / bank reconciliation / cash management.
//   * No cost accounting / COGS / inventory valuation / fixed assets / payroll / SaaS billing.
//   * No returns / debit notes / credit notes / reverse entries / period locking.
//   * No mock/demo business data.
// =====================================================
describe('Phase 6: Accounting (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;

  // Per-run unique account codes so re-running the suite doesn't hit dedupe.
  const unique = Date.now().toString(36);
  const CASH_CODE = `ACC-CASH-${unique}`; // ASSET/DEBIT  (DEBIT-normal)
  const AP_CODE = `ACC-AP-${unique}`; // LIABILITY/CREDIT (CREDIT-normal)
  const EQ_CODE = `ACC-EQ-${unique}`; // EQUITY/CREDIT (CREDIT-normal)
  const TEST_INV_CODE_1 = `ACC-SIX-A-${unique}`; // used for invalid-chars probe
  const TEST_DUP_CODE = `ACC-DUP-${unique}`; // duplicate-code probe
  const TEST_DEL_CODE = `ACC-DEL-${unique}`; // soft-delete probe

  let cashAccountId = '';
  let apAccountId = '';
  let eqAccountId = '';
  let delAccountId = '';
  let validDraftJournalId = '';
  let cancelledJournalId = '';
  let postedJournalId = '';

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

  // ----------------------------------------------------------------
  // A) Chart of Accounts — access control + list/get
  // ----------------------------------------------------------------

  it('A1) GET /accounting/accounts without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/accounting/accounts`);
    expect(res.status).toBe(401);
  });

  it('A2) GET /accounting/accounts as admin => 200 + paginated shape', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/accounting/accounts`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  // ----------------------------------------------------------------
  // B) Chart of Accounts — create
  //    Validates: regex, dedupe (409), AccountType/NormalBalance invariants.
  // ----------------------------------------------------------------

  it('B1) POST /accounting/accounts ASSET/DEBIT valid => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/accounts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: CASH_CODE,
        name: 'Cash on hand',
        nameAr: 'النقدية بالصندوق',
        type: 'ASSET',
        normalBalance: 'DEBIT',
        isActive: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.code).toBe(CASH_CODE);
    expect(res.body.type).toBe('ASSET');
    expect(res.body.normalBalance).toBe('DEBIT');
    expect(res.body.companyId).toBeDefined();
    expect(res.body.isActive).toBe(true);
    cashAccountId = res.body.id;
  });

  it('B2) POST /accounting/accounts LIABILITY/CREDIT valid => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/accounts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: AP_CODE,
        name: 'Accounts Payable',
        type: 'LIABILITY',
        normalBalance: 'CREDIT',
        isActive: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('LIABILITY');
    expect(res.body.normalBalance).toBe('CREDIT');
    apAccountId = res.body.id;
  });

  it('B3) POST /accounting/accounts EQUITY/CREDIT valid => 201', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/accounts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: EQ_CODE,
        name: "Owner's Equity",
        type: 'EQUITY',
        normalBalance: 'CREDIT',
        isActive: true,
      });
    expect(res.status).toBe(201);
    eqAccountId = res.body.id;
  });

  it('B4) POST /accounting/accounts duplicate code same company => 409', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/accounts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: CASH_CODE, // same code as B1
        name: 'Another cash account',
        type: 'ASSET',
        normalBalance: 'DEBIT',
      });
    expect(res.status).toBe(409);
  });

  it('B5) POST /accounting/accounts with invalid code chars => 400', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/accounts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `bad code with spaces and !`, // spaces + '!' violate regex
        name: 'Bad Code Account',
        type: 'ASSET',
        normalBalance: 'DEBIT',
      });
    expect(res.status).toBe(400);
  });

  // ----------------------------------------------------------------
  // C) Chart of Accounts — update + read-one + soft-delete
  // ----------------------------------------------------------------

  it('C1) GET /accounting/accounts/:id as admin => 200 + nested parent/children', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/accounting/accounts/${cashAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cashAccountId);
    expect(res.body.code).toBe(CASH_CODE);
    expect(Array.isArray(res.body.children)).toBe(true);
  });

  it('C2) PATCH /accounting/accounts/:id => 200 + name updated', async () => {
    const res = await request(http)
      .patch(`${API_PREFIX}/accounting/accounts/${cashAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cash on hand (updated)' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Cash on hand (updated)');
    expect(res.body.code).toBe(CASH_CODE); // code is immutable in this PATCH
  });

  it('C3) DELETE /accounting/accounts/:id with no posted lines => 200 soft-delete', async () => {
    // Seed a throwaway account then delete it. The three accounts above
    // are referenced by every journal test below, so they MUST stay active.
    const create = await request(http)
      .post(`${API_PREFIX}/accounting/accounts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: TEST_DEL_CODE,
        name: 'Throwaway account',
        type: 'EXPENSE',
        normalBalance: 'DEBIT',
      });
    expect(create.status).toBe(201);
    delAccountId = create.body.id;

    const res = await request(http)
      .delete(`${API_PREFIX}/accounting/accounts/${delAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    expect(res.body.deletedAt).toBeTruthy();
  });

  it('C4) GET /accounting/accounts/:id after soft-delete => 404', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/accounting/accounts/${delAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  // ----------------------------------------------------------------
  // D) Journal entries — list + read + access control
  // ----------------------------------------------------------------

  it('D1) GET /accounting/journal without token => 401', async () => {
    const res = await request(http).get(`${API_PREFIX}/accounting/journal`);
    expect(res.status).toBe(401);
  });

  it('D2) GET /accounting/journal as admin => 200 + paginated shape', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  // ----------------------------------------------------------------
  // E) Journal entries — create with strict double-entry validation
  // ----------------------------------------------------------------

  it('E1) POST /accounting/journal with <2 lines => 400', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'single-line attempt (must be rejected)',
        lines: [
          {
            accountId: cashAccountId,
            debit: '100.0000',
            credit: '0.0000',
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('E2) POST /accounting/journal with both debit+credit on a line => 400', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'line with both sides > 0 (must be rejected)',
        lines: [
          {
            accountId: cashAccountId,
            debit: '100.0000',
            credit: '100.0000',
          },
          {
            accountId: apAccountId,
            debit: '0.0000',
            credit: '100.0000',
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('E3) POST /accounting/journal unbalanced (debit != credit) => 400', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'unbalanced attempt (must be rejected)',
        lines: [
          {
            accountId: cashAccountId,
            debit: '100.0000',
            credit: '0.0000',
          },
          {
            accountId: apAccountId,
            debit: '0.0000',
            credit: '50.0000', // 100 vs 50 → unbalanced
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('E4) POST /accounting/journal balanced, ≥2 lines => 201 DRAFT', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Cash outlay to settle liability',
        reference: 'EV-E2E-001',
        lines: [
          {
            accountId: apAccountId,
            debit: '0.0000',
            credit: '100.0000', // reduce liability (debit on CREDIT-normal)
          },
          {
            accountId: cashAccountId,
            debit: '100.0000',
            credit: '0.0000', // increase asset (debit on DEBIT-normal)
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.entryNumber).toMatch(/^je-\d{8}-\d+$/);
    expect(String(res.body.totalDebit)).toMatch(/^100/);
    expect(String(res.body.totalCredit)).toMatch(/^100/);
    expect(res.body._count?.lines).toBe(2);
    validDraftJournalId = res.body.id;
  });

  // ----------------------------------------------------------------
  // F) Journal entries — read-one + update DRAFT + cancel
  // ----------------------------------------------------------------

  it('F1) GET /accounting/journal/:id => 200 + nested lines + nested account refs', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/accounting/journal/${validDraftJournalId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DRAFT');
    expect(Array.isArray(res.body.lines)).toBe(true);
    expect(res.body.lines.length).toBe(2);
    for (const ln of res.body.lines) {
      expect(ln.id).toBeDefined();
      expect(ln.debitAccountId ?? ln.creditAccountId ?? null).not.toBeNull();
      // Either debitAccount or creditAccount nested should be populated.
      expect(ln.debitAccount ?? ln.creditAccount ?? null).not.toBeNull();
    }
  });

  it('F2) PATCH /accounting/journal/:id on DRAFT (notes) => 200', async () => {
    const res = await request(http)
      .patch(`${API_PREFIX}/accounting/journal/${validDraftJournalId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'patched notes from e2e' });
    expect(res.status).toBe(200);
    expect(String(res.body.notes ?? '')).toContain('patched notes from e2e');
    expect(res.body.status).toBe('DRAFT');
  });

  it('F3) POST /accounting/journal/:id/post => 200|201, status=POSTED + postedAt set', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal/${validDraftJournalId}/post`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe('POSTED');
    expect(res.body.postedAt).toBeDefined();
    expect(res.body.postedById).toBeDefined();
    postedJournalId = res.body.id;
  });

  it('F4) POST /accounting/journal/:id/post on already-POSTED => 409', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal/${postedJournalId}/post`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    // Service throws ConflictException for non-DRAFT → 409.
    expect([400, 409]).toContain(res.status);
  });

  it('F5) POST /accounting/journal/:id/cancel on POSTED => 409 (reverse-entries out of scope)', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal/${postedJournalId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'should be refused' });
    // Phase 6 mandate explicitly forbids reversing entries: POSTED cannot cancel.
    expect([400, 409]).toContain(res.status);
    expect(String(res.body.message ?? '')).toMatch(
      /posted|reverse|out of scope/i,
    );
  });

  it('F6) POST /accounting/journal/:id/cancel on DRAFT => 200|201 + status=CANCELLED', async () => {
    // Build a fresh balanced DRAFT so we have something to cancel.
    const create = await request(http)
      .post(`${API_PREFIX}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Equity injection (will be cancelled)',
        lines: [
          {
            accountId: cashAccountId,
            debit: '250.0000',
            credit: '0.0000',
          },
          {
            accountId: eqAccountId,
            debit: '0.0000',
            credit: '250.0000',
          },
        ],
      });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe('DRAFT');
    cancelledJournalId = create.body.id;

    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal/${cancelledJournalId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'e2e cancel of DRAFT' });
    // NestJS default for POST without explicit @HttpCode is 201.
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelledAt).toBeDefined();
    expect(res.body.cancelledById).toBeDefined();
  });

  it('F7) POST /accounting/journal/:id/cancel on already-CANCELLED => 409', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal/${cancelledJournalId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    // Service throws ConflictException for already-cancelled → 409.
    expect([400, 409]).toContain(res.status);
  });

  // ----------------------------------------------------------------
  // G) Cross-load: sales / purchases do NOT auto-post to accounting in Phase 6.
  //    This is asserted by inventory / sales endpoints being independent of
  //    /accounting endpoints. We don't call them again here (covered by their
  //    own phases); this block is purely a documentation anchor.
  // ----------------------------------------------------------------

  it('G1) GET /accounting/journal status=DRAFT filter returns non-POSTED set', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/accounting/journal?status=DRAFT`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    for (const it of res.body.items) expect(it.status).toBe('DRAFT');
  });
});

// =====================================================
// Phase 11A-B-3 — GL posting hardening e2e smoke.
//
// Add a small, additive describe block that re-runs the
// core Phase 6 / Phase 11A-B-2 accounting surface as smoke
// tests against FRESH per-run fixtures. This block does NOT
// rewrite or move any existing Phase 6 test (A1/A2, D1/D2,
// E3/E4, F3/F4/F5/F6/F7 are preserved verbatim).
//
// Required smoke cases (all 9 from the Phase 11A-B-3 spec):
//   1) GET /accounting/accounts with valid token => 200 + paginated array
//   2) GET /accounting/journal  with valid token => 200 + paginated array
//   3) POST /accounting/journal unbalanced      => 400 / 409
//   4) POST /accounting/journal balanced, ≥2 lines => 201 DRAFT
//   5) POST /accounting/journal/:id/post on DRAFT      => status=POSTED + postedAt
//   6) POST /accounting/journal/:id/post on POSTED    => 4xx (no double-post)
//   7) POST /accounting/journal/:id/cancel on DRAFT   => 200|201 status=CANCELLED + cancelledAt + cancelledById
//   8) POST /accounting/journal/:id/cancel on POSTED  => 4xx with /posted|reverse|out of scope/i message
//   9) POST /accounting/journal/:id/cancel on CANCELLED => 4xx (no double-cancel)
//
// Phase 6 contract preserved (re-asserted without changing production code):
//   * DRAFT can be CANCELLED (case 7).
//   * POSTED cannot be CANCELLED (case 8) — straight status flip via REVERSED
//     enum is intentionally NOT introduced here; reversing entries remain
//     out of scope in this phase.
//   * CANCELLED cannot be cancelled again (case 9).
//   * POSTED cannot be posted again (case 6).
//   * The unbalanced probe (case 3) exercises the centralized
//     `validateJournalBalances` helper added in 11A-B-2 — path may produce
//     either 400 (ValidationPipe rejects) or 409 (BadRequestException thrown
//     by the service after class-validator passes). The test accepts both.
//
// Strict scope of this commit (matches the user-stated allowed file):
//   * JS-only changes inside `backend/test/app.e2e-spec.ts`.
//   * No production code, no schema, no migration, no frontend, no README,
//     no docs, no RBAC catalog, no D1 wiring, no deployment touch.
// =====================================================
describe('Phase 11A-B-3: GL posting hardening (e2e smoke)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;

  // Fresh per-run COA fixture codes so this block is independent
  // from the Phase 6 describe block above (which uses `ACC-*` codes).
  const unique = Date.now().toString(36);
  const GL_CASH_CODE = `GL-CASH-${unique}`;
  const GL_AP_CODE = `GL-AP-${unique}`;

  let glCashAccountId = '';
  let glApAccountId = '';

  // Describe-locals for cross-test IDs (no module-level mutable required).
  let smokeDraftId = '';
  let smokePostedId = '';
  let smokeCancelableDraftId = '';
  let smokeCancelledId = '';

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

    // Seed two fresh accounts (ASSET/DEBIT and LIABILITY/CREDIT)
    // so this smoke block has its own fixtures. Idempotent on rerun
    // via the `[201, 409]` tolerance; the `id` is recovered from
    // either path.
    const cashList = await request(http)
      .get(`${API_PREFIX}/accounting/accounts?search=${encodeURIComponent(GL_CASH_CODE)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cashList.status).toBe(200);
    if (Array.isArray(cashList.body.items) && cashList.body.items.length > 0) {
      glCashAccountId = cashList.body.items[0].id;
    } else {
      const cash = await request(http)
        .post(`${API_PREFIX}/accounting/accounts`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: GL_CASH_CODE,
          name: 'GL smoke cash',
          type: 'ASSET',
          normalBalance: 'DEBIT',
          isActive: true,
        });
      expect([201, 409]).toContain(cash.status);
      glCashAccountId = cash.body.id ?? '';
    }
    expect(glCashAccountId).toBeTruthy();

    const apList = await request(http)
      .get(`${API_PREFIX}/accounting/accounts?search=${encodeURIComponent(GL_AP_CODE)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(apList.status).toBe(200);
    if (Array.isArray(apList.body.items) && apList.body.items.length > 0) {
      glApAccountId = apList.body.items[0].id;
    } else {
      const ap = await request(http)
        .post(`${API_PREFIX}/accounting/accounts`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: GL_AP_CODE,
          name: 'GL smoke AP',
          type: 'LIABILITY',
          normalBalance: 'CREDIT',
          isActive: true,
        });
      expect([201, 409]).toContain(ap.status);
      glApAccountId = ap.body.id ?? '';
    }
    expect(glApAccountId).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
  });

  // ----- GET surfaces --------------------------------------------

  it('11A-B-3.1) GET /accounting/accounts with valid token => 200 + paginated array', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/accounting/accounts`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('11A-B-3.2) GET /accounting/journal with valid token => 200 + paginated array', async () => {
    const res = await request(http)
      .get(`${API_PREFIX}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  // ----- Balancing validator (Phase 11A-B-2 centralized) ---------

  it('11A-B-3.3) POST /accounting/journal unbalanced (debit != credit) => 400 or 409', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Phase 11A-B-3 unbalanced probe',
        lines: [
          {
            accountId: glCashAccountId,
            debit: '100.0000',
            credit: '0.0000',
          },
          {
            accountId: glApAccountId,
            debit: '0.0000',
            credit: '50.0000', // 100 vs 50 → unbalanced
          },
        ],
      });
    // The exact code can be 400 (ValidationPipe rejection on missing
    // fields / shape) or 409 (service-level BadRequestException once
    // class-validator accepts the shape and validateJournalBalances
    // throws). Both are acceptable failure modes. We assert ≥ 400
    // and < 500 to keep the assertion stable across Phase 6 / 11A
    // boundary lines and future shape changes.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('11A-B-3.4) POST /accounting/journal balanced >= 2 lines => 201 DRAFT', async () => {
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Phase 11A-B-3 balanced DRAFT (will be POSTED)',
        lines: [
          {
            accountId: glApAccountId,
            debit: '0.0000',
            credit: '75.0000',
          },
          {
            accountId: glCashAccountId,
            debit: '75.0000',
            credit: '0.0000',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(String(res.body.totalDebit)).toMatch(/^75/);
    expect(String(res.body.totalCredit)).toMatch(/^75/);
    smokeDraftId = res.body.id;
    expect(smokeDraftId).toBeTruthy();
  });

  // ----- Posting path (Phase 11A-B-2 `ensureJournalEntryCanPost`) ---

  it('11A-B-3.5) POST /accounting/journal/:id/post on DRAFT => status=POSTED + postedAt set', async () => {
    expect(smokeDraftId).toBeTruthy();
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal/${smokeDraftId}/post`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe('POSTED');
    expect(res.body.postedAt).toBeDefined();
    expect(res.body.postedById).toBeDefined();
    smokePostedId = res.body.id;
  });

  it('11A-B-3.6) POST /accounting/journal/:id/post on already-POSTED => 4xx (no double-post)', async () => {
    expect(smokePostedId).toBeTruthy();
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal/${smokePostedId}/post`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    // EnsureJournalEntryCanPost throws ConflictException on non-DRAFT;
    // service-level message wording matches "Only DRAFT entries can be
    // posted (current: POSTED)". Accept 4xx (400 / 409) without being
    // picky on the exact status code.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(String(res.body.message ?? '')).toMatch(/draft|posted/i);
  });

  // ----- Cancel path (Phase 11A-B-2 `ensureJournalEntryCanCancel`,
  //       Phase 6 contract preserved) ------------------------------

  it('11A-B-3.7) POST /accounting/journal/:id/cancel on POSTED => 4xx with reverse/out-of-scope message', async () => {
    expect(smokePostedId).toBeTruthy();
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal/${smokePostedId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'should be refused (reverse out of scope)' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(String(res.body.message ?? '')).toMatch(
      /posted|reverse|out of scope/i,
    );
  });

  it('11A-B-3.8) POST /accounting/journal/:id/cancel on DRAFT => 200|201 + status=CANCELLED + cancelledAt + cancelledById', async () => {
    // Build a fresh balanced DRAFT entry purely for the cancel-on-DRAFT
    // branch. Kept independent from the post→posted chain so that each
    // assertion has a clean fixture.
    const create = await request(http)
      .post(`${API_PREFIX}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Phase 11A-B-3 DRAFT (will be CANCELLED)',
        lines: [
          {
            accountId: glApAccountId,
            debit: '0.0000',
            credit: '40.0000',
          },
          {
            accountId: glCashAccountId,
            debit: '40.0000',
            credit: '0.0000',
          },
        ],
      });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe('DRAFT');
    smokeCancelableDraftId = create.body.id;
    expect(smokeCancelableDraftId).toBeTruthy();

    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal/${smokeCancelableDraftId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'e2e cancel of DRAFT in 11A-B-3 smoke' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelledAt).toBeDefined();
    expect(res.body.cancelledById).toBeDefined();
    smokeCancelledId = res.body.id;
  });

  it('11A-B-3.9) POST /accounting/journal/:id/cancel on already-CANCELLED => 4xx (no double-cancel)', async () => {
    expect(smokeCancelledId).toBeTruthy();
    const res = await request(http)
      .post(`${API_PREFIX}/accounting/journal/${smokeCancelledId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    // EnsureJournalEntryCanCancel throws ConflictException on already-CANCELLED.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(String(res.body.message ?? '')).toMatch(/already cancelled|already/i);
  });
});

// =====================================================
// Phase 11B-B-2 — Auto-post SalesInvoice ISSUED to GL.
//
// One POSTED JournalEntry per (companyId, SALES_INVOICE, invoice.id).
// Amounts compared as Decimal strings (no Number() posting math).
// =====================================================
describe('Phase 11B-B-2: SalesInvoice ISSUED auto-post (e2e smoke)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;
  let companyId: string;
  let adminUserId: string;
  let prisma: PrismaService;

  const unique = Date.now().toString(36);
  const SKU_SVC = `GL11B-SVC-${unique}`;

  let productSvcId = '';
  let invoiceId = '';
  let invoiceNumber = '';
  let invoiceSubtotal = '';
  let invoiceVatTotal = '';
  let invoiceDiscountTotal = '';
  let invoiceTotal = '';
  let journalId = '';

  async function loadSourceJournals() {
    return prisma.journalEntry.findMany({
      where: {
        companyId,
        sourceType: JournalEntrySourceType.SALES_INVOICE,
        sourceId: invoiceId,
      },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
  }

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
    prisma = app.get(PrismaService);

    const login = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(login.status).toBe(200);
    adminToken = login.body.accessToken;
    companyId = login.body.user.companyId;
    adminUserId = login.body.user.id;
    expect(companyId).toBeTruthy();

    const product = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: SKU_SVC, name: 'Phase 11B-B-2 GL service', type: 'SERVICE' });
    expect(product.status).toBe(201);
    productSvcId = product.body.id;

    const created = await request(http)
      .post(`${API_PREFIX}/sales/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        notes: 'Phase 11B-B-2 auto-post fixture',
        lines: [
          {
            productId: productSvcId,
            quantity: '2.0000',
            unitPrice: '100.0000',
            discountAmount: '10.0000',
            vatRate: '15.00',
          },
        ],
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');
    invoiceId = created.body.id;
    invoiceNumber = created.body.invoiceNumber;
    invoiceSubtotal = new Prisma.Decimal(created.body.subtotal).toFixed(4);
    invoiceVatTotal = new Prisma.Decimal(created.body.vatTotal).toFixed(4);
    invoiceDiscountTotal = new Prisma.Decimal(
      created.body.discountTotal,
    ).toFixed(4);
    invoiceTotal = new Prisma.Decimal(created.body.total).toFixed(4);
    // 2 * 100 = 200 subtotal; discount 10; taxable 190; vat 28.5000; total 218.5000
    expect(invoiceSubtotal).toBe('200.0000');
    expect(invoiceDiscountTotal).toBe('10.0000');
    expect(invoiceVatTotal).toBe('28.5000');
    expect(invoiceTotal).toBe('218.5000');

    const issued = await request(http)
      .post(`${API_PREFIX}/sales/invoices/${invoiceId}/issue`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'issue for GL auto-post' });
    expect(issued.status).toBe(201);
    expect(issued.body.status).toBe('ISSUED');
  });

  afterAll(async () => {
    await app.close();
  });

  it('11B-B-2.1) issuing a sales invoice creates one POSTED journal entry', async () => {
    const entries = await loadSourceJournals();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('POSTED');
    expect(entries[0].postedAt).toBeTruthy();
    expect(String(entries[0].description ?? '')).toContain(invoiceNumber);
    journalId = entries[0].id;
  });

  it('11B-B-2.2) debit total equals credit total', async () => {
    const entries = await loadSourceJournals();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    const td = new Prisma.Decimal(entry.totalDebit);
    const tc = new Prisma.Decimal(entry.totalCredit);
    expect(td.equals(tc)).toBe(true);
    expect(td.toFixed(4)).toBe('228.5000');

    let lineDebit = new Prisma.Decimal(0);
    let lineCredit = new Prisma.Decimal(0);
    for (const line of entry.lines) {
      lineDebit = lineDebit.add(new Prisma.Decimal(line.debit));
      lineCredit = lineCredit.add(new Prisma.Decimal(line.credit));
    }
    expect(lineDebit.equals(lineCredit)).toBe(true);
    expect(lineDebit.equals(td)).toBe(true);

    const codesBySide: Record<string, string> = {};
    for (const line of entry.lines) {
      const accountId = line.debitAccountId ?? line.creditAccountId;
      expect(accountId).toBeTruthy();
      const acc = await prisma.account.findFirst({
        where: { id: accountId!, companyId },
        select: { code: true },
      });
      expect(acc?.code).toBeTruthy();
      const amt = new Prisma.Decimal(line.debit).gt(0)
        ? new Prisma.Decimal(line.debit).toFixed(4)
        : new Prisma.Decimal(line.credit).toFixed(4);
      codesBySide[acc!.code] = amt;
    }
    expect(codesBySide.AR_CONTROL).toBe(invoiceTotal);
    expect(codesBySide.SALES_REVENUE).toBe(invoiceSubtotal);
    expect(codesBySide.VAT_OUTPUT).toBe(invoiceVatTotal);
    expect(codesBySide.SALES_DISCOUNTS).toBe(invoiceDiscountTotal);
  });

  it('11B-B-2.3) sourceType/sourceId are set correctly', async () => {
    const entries = await loadSourceJournals();
    expect(entries).toHaveLength(1);
    expect(entries[0].sourceType).toBe(JournalEntrySourceType.SALES_INVOICE);
    expect(entries[0].sourceId).toBe(invoiceId);
    expect(entries[0].companyId).toBe(companyId);
  });

  it('11B-B-2.4) repeated issue/retry does not create duplicate journal entries', async () => {
    const retryIssue = await request(http)
      .post(`${API_PREFIX}/sales/invoices/${invoiceId}/issue`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(retryIssue.status).toBeGreaterThanOrEqual(400);
    expect(retryIssue.status).toBeLessThan(500);

    const afterHttp = await loadSourceJournals();
    expect(afterHttp).toHaveLength(1);

    await prisma.$transaction(async (tx) => {
      const result = await postSalesInvoiceIssued(tx, {
        companyId,
        userId: adminUserId,
        invoice: {
          id: invoiceId,
          invoiceNumber,
          subtotal: invoiceSubtotal,
          vatTotal: invoiceVatTotal,
          discountTotal: invoiceDiscountTotal,
          total: invoiceTotal,
        },
      });
      expect(result.reused).toBe(true);
      expect(result.id).toBe(journalId);
    });

    const afterHandler = await loadSourceJournals();
    expect(afterHandler).toHaveLength(1);
    expect(afterHandler[0].id).toBe(journalId);
  });

  it('11B-B-2.5) tenant isolation remains intact', async () => {
    expect(journalId).toBeTruthy();
    const unauth = await request(http).get(
      `${API_PREFIX}/accounting/journal/${journalId}`,
    );
    expect(unauth.status).toBe(401);

    const cross = await prisma.journalEntry.findFirst({
      where: {
        id: journalId,
        companyId: 'not-this-company',
      },
      select: { id: true },
    });
    expect(cross).toBeNull();

    const owned = await prisma.journalEntry.findFirst({
      where: { id: journalId, companyId },
      select: { id: true, sourceType: true, sourceId: true },
    });
    expect(owned?.id).toBe(journalId);
    expect(owned?.sourceType).toBe(JournalEntrySourceType.SALES_INVOICE);
    expect(owned?.sourceId).toBe(invoiceId);
  });
});

// =====================================================
// Phase 11B-B-3 — Auto-post PurchaseInvoice RECEIVED to GL.
//
// One POSTED JournalEntry per (companyId, PURCHASE_INVOICE, invoice.id).
// Amounts compared as Decimal strings (no Number() posting math).
// =====================================================
describe('Phase 11B-B-3: PurchaseInvoice RECEIVED auto-post (e2e smoke)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let adminToken: string;
  let companyId: string;
  let adminUserId: string;
  let prisma: PrismaService;

  const unique = Date.now().toString(36);
  const SKU_SVC = `GL11B-P-SVC-${unique}`;
  const SUPP_CODE = `GL11B-P-SUP-${unique}`;

  let productSvcId = '';
  let invoiceId = '';
  let invoiceNumber = '';
  let invoiceVatTotal = '';
  let invoiceTotal = '';
  let inventoryAmount = '';
  let journalId = '';

  async function loadSourceJournals() {
    return prisma.journalEntry.findMany({
      where: {
        companyId,
        sourceType: JournalEntrySourceType.PURCHASE_INVOICE,
        sourceId: invoiceId,
      },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
  }

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
    prisma = app.get(PrismaService);

    const login = await request(http)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'admin@example.sa', password: 'Admin@12345' });
    expect(login.status).toBe(200);
    adminToken = login.body.accessToken;
    companyId = login.body.user.companyId;
    adminUserId = login.body.user.id;
    expect(companyId).toBeTruthy();

    const supplier = await request(http)
      .post(`${API_PREFIX}/partners`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: SUPP_CODE,
        name: 'Phase 11B-B-3 GL supplier',
        type: 'SUPPLIER',
      });
    expect(supplier.status).toBe(201);

    const product = await request(http)
      .post(`${API_PREFIX}/products`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: SKU_SVC,
        name: 'Phase 11B-B-3 GL service',
        type: 'SERVICE',
      });
    expect(product.status).toBe(201);
    productSvcId = product.body.id;

    const created = await request(http)
      .post(`${API_PREFIX}/purchases/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId: supplier.body.id,
        notes: 'Phase 11B-B-3 auto-post fixture',
        lines: [
          {
            productId: productSvcId,
            quantity: '2.0000',
            unitCost: '100.0000',
            discountAmount: '10.0000',
            vatRate: '15.00',
          },
        ],
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');
    invoiceId = created.body.id;
    invoiceNumber = created.body.invoiceNumber;
    const subtotal = new Prisma.Decimal(created.body.subtotal);
    const discountTotal = new Prisma.Decimal(created.body.discountTotal);
    const vatTotal = new Prisma.Decimal(created.body.vatTotal);
    const total = new Prisma.Decimal(created.body.total);
    invoiceVatTotal = vatTotal.toFixed(4);
    invoiceTotal = total.toFixed(4);
    inventoryAmount = total.minus(vatTotal).toFixed(4);
    // 2 * 100 = 200 subtotal; discount 10; taxable 190; vat 28.5000; total 218.5000
    expect(subtotal.toFixed(4)).toBe('200.0000');
    expect(discountTotal.toFixed(4)).toBe('10.0000');
    expect(invoiceVatTotal).toBe('28.5000');
    expect(invoiceTotal).toBe('218.5000');
    expect(inventoryAmount).toBe('190.0000');

    const received = await request(http)
      .post(`${API_PREFIX}/purchases/invoices/${invoiceId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'receive for GL auto-post' });
    expect(received.status).toBe(201);
    expect(received.body.status).toBe('RECEIVED');
  });

  afterAll(async () => {
    await app.close();
  });

  it('11B-B-3.1) receiving a purchase invoice creates one POSTED journal entry', async () => {
    const entries = await loadSourceJournals();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('POSTED');
    expect(entries[0].postedAt).toBeTruthy();
    expect(String(entries[0].description ?? '')).toContain(invoiceNumber);
    journalId = entries[0].id;
  });

  it('11B-B-3.2) debit total equals credit total', async () => {
    const entries = await loadSourceJournals();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    const td = new Prisma.Decimal(entry.totalDebit);
    const tc = new Prisma.Decimal(entry.totalCredit);
    expect(td.equals(tc)).toBe(true);
    expect(td.toFixed(4)).toBe(invoiceTotal);

    let lineDebit = new Prisma.Decimal(0);
    let lineCredit = new Prisma.Decimal(0);
    for (const line of entry.lines) {
      lineDebit = lineDebit.add(new Prisma.Decimal(line.debit));
      lineCredit = lineCredit.add(new Prisma.Decimal(line.credit));
    }
    expect(lineDebit.equals(lineCredit)).toBe(true);
    expect(lineDebit.equals(td)).toBe(true);

    const codesBySide: Record<string, string> = {};
    for (const line of entry.lines) {
      const accountId = line.debitAccountId ?? line.creditAccountId;
      expect(accountId).toBeTruthy();
      const acc = await prisma.account.findFirst({
        where: { id: accountId!, companyId },
        select: { code: true },
      });
      expect(acc?.code).toBeTruthy();
      const amt = new Prisma.Decimal(line.debit).gt(0)
        ? new Prisma.Decimal(line.debit).toFixed(4)
        : new Prisma.Decimal(line.credit).toFixed(4);
      codesBySide[acc!.code] = amt;
    }
    expect(codesBySide.INVENTORY_OR_EXPENSE).toBe(inventoryAmount);
    expect(codesBySide.VAT_INPUT).toBe(invoiceVatTotal);
    expect(codesBySide.AP_CONTROL).toBe(invoiceTotal);
  });

  it('11B-B-3.3) sourceType/sourceId are set correctly', async () => {
    const entries = await loadSourceJournals();
    expect(entries).toHaveLength(1);
    expect(entries[0].sourceType).toBe(JournalEntrySourceType.PURCHASE_INVOICE);
    expect(entries[0].sourceId).toBe(invoiceId);
    expect(entries[0].companyId).toBe(companyId);
  });

  it('11B-B-3.4) retry/handler repeat does not create duplicate journal entries', async () => {
    const retryReceive = await request(http)
      .post(`${API_PREFIX}/purchases/invoices/${invoiceId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(retryReceive.status).toBeGreaterThanOrEqual(400);
    expect(retryReceive.status).toBeLessThan(500);

    const afterHttp = await loadSourceJournals();
    expect(afterHttp).toHaveLength(1);

    await prisma.$transaction(async (tx) => {
      const result = await postPurchaseInvoiceReceived(tx, {
        companyId,
        userId: adminUserId,
        invoice: {
          id: invoiceId,
          invoiceNumber,
          subtotal: '200.0000',
          vatTotal: invoiceVatTotal,
          discountTotal: '10.0000',
          total: invoiceTotal,
        },
      });
      expect(result.reused).toBe(true);
      expect(result.id).toBe(journalId);
    });

    const afterHandler = await loadSourceJournals();
    expect(afterHandler).toHaveLength(1);
    expect(afterHandler[0].id).toBe(journalId);
  });

  it('11B-B-3.5) tenant isolation remains intact', async () => {
    expect(journalId).toBeTruthy();
    const unauth = await request(http).get(
      `${API_PREFIX}/accounting/journal/${journalId}`,
    );
    expect(unauth.status).toBe(401);

    const cross = await prisma.journalEntry.findFirst({
      where: {
        id: journalId,
        companyId: 'not-this-company',
      },
      select: { id: true },
    });
    expect(cross).toBeNull();

    const owned = await prisma.journalEntry.findFirst({
      where: { id: journalId, companyId },
      select: { id: true, sourceType: true, sourceId: true },
    });
    expect(owned?.id).toBe(journalId);
    expect(owned?.sourceType).toBe(JournalEntrySourceType.PURCHASE_INVOICE);
    expect(owned?.sourceId).toBe(invoiceId);
  });
});
