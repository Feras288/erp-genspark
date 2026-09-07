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
