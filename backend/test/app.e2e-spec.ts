// =====================================================
// Phase 1 e2e tests (jest + supertest).
// Use the real Postgres test DB (TEST_DATABASE_URL).
// - login good/bad
// - /me unauthenticated and authenticated
// - refresh rotation + replay rejection
// - /users as admin (200) and cashier (403)
// - logout invalidates refresh
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
