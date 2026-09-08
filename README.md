# ERP System

نظام إدارة موارد المؤسسة (ERP) مخصص للسوق السعودي.
النسخة الحالية مهداة لمشروع **عميل واحد**، لكنها مبنية من اليوم الأول بحيث يمكن تحويلها لاحقاً إلى **SaaS متعدد المستأجرين** بدون إعادة بناء كاملة، وذلك عبر مبدإ **`companyId` scoping** على كل الكيانات التجارية.

---

## 1. وصف المشروع

النظام يهدف إلى تقديم نواة ERP عملية وحديثة لشركة داخل السوق السعودي، تغطي:

- إدارة المستخدمين والصلاحيات
- إعدادات الشركة
- العملاء والموردون
- المنتجات والخدمات
- المخزون والمستودعات
- المبيعات والفواتير ونقطة البيع POS
- المشتريات
- المحاسبة الأساسية (دورة قيود متوازنة)
- ضريبة القيمة المضافة السعودية 15%
- تقارير أساسية
- تصميم قابل لاحقاً لتكامل **ZATCA** للفوترة الإلكترونية
- **قابلية تحويل لاحقة** إلى SaaS متعدد المستأجرين

النسخة الحالية **ليست SaaS**: لا اشتراكات، لا بوابة دفع SaaS، لا multi-tenant admin. لكن كل البيانات التجارية الأساسية تحمل `companyId` فتصبح جاهزة لتقسيمها لاحقاً بين مستأجرين.

---

## 2. هدف المرحلة 0

المرحلة 0 **تهدف فقط** إلى:

1. تأسيس **Monorepo** واضح بـ `pnpm workspace`
2. تجهيز **Backend** NestJS بنية قابلة للتوسع
3. تجهيز **Frontend** Next.js بواجهة عربية RTL
4. تأسيس **Prisma** + **PostgreSQL** بمخطط بيانات مبدئي
5. تجهيز **Docker Compose** كمرجع للتشغيل المحلي/VPS
6. Health check endpoint يصل إلى قاعدة البيانات
7. Seed بسيط للتطوير

لم تُبنَ في المرحلة 0 أي وحدة أعمال فعلية (لا Auth، لا Products، لا Sales، إلخ).

---

## 3. التقنيات المستخدمة

| الحقل | التقنية |
|---|---|
| Backend framework | **NestJS 10** |
| Frontend framework | **Next.js 14** |
| Language | **TypeScript** (strict) |
| Database | **PostgreSQL** (16 في docker-compose، 17 محلياً في sandbox) |
| ORM | **Prisma 5** |
| Package manager | **pnpm 8** + **pnpm workspaces** |
| Validation | **class-validator** + DTO + **ValidationPipe** |
| API Docs | **Swagger/OpenAPI** عبر `@nestjs/swagger` |
| Security | **helmet** + CORS + bcrypt للـ passwords |
| Dev health | **@nestjs/terminus** |
| Frontend styling | **Tailwind CSS 3** |
| Frontend forms (مُخطط) | react-hook-form + zod |
| Containerization | **Docker Compose** (PostgreSQL للبدء) |

---

## 4. هيكل المجلدات

```
erp-system/
├── backend/                    # NestJS + Prisma
│   ├── prisma/
│   │   ├── schema.prisma       # Company, User, Role, Permission, RefreshToken, AuditLog
│   │   ├── seed.ts             # DEV seed (1 company, 1 admin, role, 30 permissions)
│   │   └── migrations/         # ملفات Prisma migration
│   ├── src/
│   │   ├── main.ts             # bootstrap: helmet, CORS, ValidationPipe, Swagger
│   │   ├── app.module.ts
│   │   ├── config/             # typed env config
│   │   ├── database/           # PrismaService + DatabaseModule
│   │   └── health/             # GET /api/health (DB ping)
│   ├── Dockerfile              # multi-stage، يدعم pnpm
│   ├── nest-cli.json
│   ├── tsconfig.json
│   └── package.json
├── frontend/                   # Next.js 14
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx      # lang=ar dir=rtl
│   │   │   ├── globals.css     # Tailwind + Cairo/Tajawal
│   │   │   ├── login/page.tsx  # placeholder معطّل، لا mock data
│   │   │   └── dashboard/page.tsx # يجلب /api/health حقيقياً
│   │   └── lib/cn.ts
│   ├── next.config.mjs         # '/' → '/dashboard'
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   └── package.json
├── docs/                       # للتوسعة
├── docker-compose.yml          # PostgreSQL service (مُعطّل backend/frontend افتراضياً)
├── .env.example
├── .gitignore
├── package.json                # scripts موحدة للـ monorepo
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── README.md
```

---

## 5. المتطلبات

- **Node.js 20+** (تم اختبار v22.23.2)
- **pnpm 8+**
- **Docker** و **Docker Compose** (للتشغيل المحلي على جهاز عادي / VPS)
- أو **PostgreSQL 14+ مُثبَّت محلياً** كبديل
- **Git**

---

## 6. تثبيت dependencies

من جذر الـ Monorepo:

```bash
cd /home/user/webapp/erp-system
pnpm install
```

سينتج `node_modules/` موحد و `.pnpm/` store، و `pnpm-lock.yaml`. كذلك ستُربط الـ binaries الخاصة بكل workspace (`nest`, `prisma`, `next`).

---

## 7. تشغيل PostgreSQL عبر Docker

على جهاز محلي أو VPS حيث Docker متاح:

```bash
docker compose up -d postgres
```

الإعدادات الافتراضية في `docker-compose.yml`:

| المتغير | القيمة الافتراضية |
|---|---|
| `POSTGRES_USER` | `erp_user` |
| `POSTGRES_PASSWORD` | `erp_dev_password_change_me` |
| `POSTGRES_DB` | `erp_dev` |
| المنفذ | `5432` |
| Volume | `erp_pgdata` (persistent) |

ملاحظة: في sandbox هذه البيئة Docker غير متاح، لذا تم استخدام PostgreSQL محلي. ملف `docker-compose.yml` يبقى كمرجع تشغيلي لأي جهاز تطوير أو VPS لاحقاً.

---

## 8. تشغيل PostgreSQL المحلي كبديل

Docker غير متاح في sandbox الحالي، لذلك تم تثبيت PostgreSQL محلياً:

- **العنوان**: `127.0.0.1:5432`
- **Database**: `erp_dev`
- **User**: `erp_user`
- **Password**: موجودة في `backend/.env` (ليس هنا لأسباب أمنية، ويجب تغييرها في الإنتاج)

لإعادة إنشاء القاعدة محلياً:
```bash
sudo -u postgres psql -c "CREATE ROLE erp_user WITH LOGIN PASSWORD '<pwd>' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE erp_dev OWNER erp_user;"
PGPASSWORD=<pwd> psql -h 127.0.0.1 -U erp_user -d erp_dev -c "GRANT ALL ON SCHEMA public TO erp_user;"
```

ثم ضبط `backend/.env`:
```env
DATABASE_URL=postgresql://erp_user:<pwd>@127.0.0.1:5432/erp_dev?schema=public
```

---

## 9. إعداد ملفات البيئة

ثلاثة ملفات env.example في المشروع:

| الملف | الوصف |
|---|---|
| `/env.example` | الجذر، يمثل كل المتغيرات المشتركة |
| `/backend/.env.example` | متغيرات الـ Backend |
| `/frontend/.env.example` | متغيرات الـ Frontend |

المتغيرات الجوهرية:

| المتغير | متاح في | الوصف |
|---|---|---|
| `DATABASE_URL` | backend | رابط Prisma إلى PostgreSQL |
| `JWT_ACCESS_SECRET` | backend | سر Access JWT (32+ حرف، استبدله في الإنتاج) |
| `JWT_REFRESH_SECRET` | backend | سر Refresh JWT (32+ حرف، استبدله في الإنتاج) |
| `JWT_ACCESS_TTL` | backend | مدة Access token (افتراضي 15m) |
| `JWT_REFRESH_TTL` | backend | مدة Refresh token (افتراضي 7d) |
| `NEXT_PUBLIC_API_URL` | frontend | عنوان الـ Backend (exposed للـ browser) |
| `CORS_ORIGIN` | backend | قائمة origins مسموح بها (comma-separated) |
| `PORT` | backend | منفذ HTTP (افتراضي 3001) |
| `API_PREFIX` | backend | بادئة كل الراوتات (افتراضي `/api`) |

**لا تضع أسراراً حقيقية في git** — `.env` في `.gitignore` على كل المستويات.

---

## 10. Prisma

من داخل `backend/`:

```bash
cd /home/user/webapp/erp-system/backend

# توليد Prisma Client
pnpm exec prisma generate

# تطبيق migrations + إنشاء migration جديد عند تعديل الـ schema
pnpm exec prisma migrate dev --name <change>

# تطبيق migrations بدون إنشاء (إنتاج)
pnpm exec prisma migrate deploy

# فحص التزامن
pnpm exec prisma migrate status

# seed (DEV ONLY)
pnpm exec prisma db seed

# Prisma Studio (DB GUI)
pnpm exec prisma studio
```

أو من جذر الـ Monorepo عبر root scripts:

| الأمر في الجذر | يكافئ |
|---|---|
| `pnpm db:generate` | `pnpm --filter @erp/backend prisma:generate` |
| `pnpm db:migrate:dev -- --name <x>` | `prisma migrate dev --name <x>` |
| `pnpm db:seed` | `ts-node prisma/seed.ts` |
| `pnpm db:studio` | يشغّل Prisma Studio |
| `pnpm db:reset` | يحذف db ويطبق migrations من جديد (⚠️ مدمر) |

ملاحظة: عند تعديل الـ schema، `migrate dev` قد يسأل أسئلة تفاعلية. استخدم `--skip-seed --skip-generate` صراحةً إذا أردت سلوكاً غير تفاعلي، ومرّر `--name` لتسمي الـ migration.

---

## 11. تشغيل Backend

```bash
cd /home/user/webapp/erp-system/backend
pnpm start:dev      # hot reload عبر nest start --watch
# أو
pnpm build && pnpm start:prod   # بناء ثم تشغيل node dist/src/main.js
```

- المنفذ: **3001** (من `PORT` في `.env`)
- الـ API prefix: **/api** (من `API_PREFIX` في `.env`)
- Swagger UI: http://localhost:3001/api/docs
- Health: http://localhost:3001/api/health

ملاحظة: `nest build` يَحفظ الناتج في `dist/src/main.js` (بسبب `sourceRoot: "src"`)، وذلك مقبول وموثّق في `backend/package.json` و `backend/Dockerfile`.

---

## 12. اختبار Health Check

```bash
curl http://127.0.0.1:3001/api/health
```

مثال response:

```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "info": {
    "database": { "status": "up" }
  }
}
```

هذا يتحقق فعلاً من اتصال قاعدة البيانات عبر `SELECT 1`. أي خطأ في الـ DB يظهر هنا مباشرةً.

---

## 13. تشغيل Frontend

```bash
cd /home/user/webapp/erp-system/frontend
pnpm dev       # http://localhost:3000
# أو للإنتاج
pnpm build && pnpm start
```

- المنفذ: **3000**
- الواجهة: **RTL عربية** (`<html lang="ar" dir="rtl">`)
- بعد التشغيل:
  - `/` تُحوّل إلى `/dashboard`
  - `/dashboard` يجلب `/api/health` فعلياً من الـ Backend
  - `/login` placeholder معطَّل (لا تخزين كلمات مرور، لا mock data)

---

## 14. Build

من جذر الـ Monorepo:

```bash
pnpm build:backend    # = nest build داخل backend
pnpm build:frontend   # = next build داخل frontend
pnpm build            # بناء كلاهما (pnpm -r build)
```

النواتج:
- Backend: `backend/dist/` (مع `dist/src/main.js`)
- Frontend: `frontend/.next/`

---

## 15. Seed Data

ملف `backend/prisma/seed.ts` يُنشئ **للتطوير فقط**:

| الكيان | المحتويات |
|---|---|
| **Permissions** | 30 permission مفهرسة (users, settings, partners, products, inventory, sales, pos, purchases, accounting, reports) |
| **Company** | شركة تجريبية (`seed-company-default`) — تجريبي |
| **Role** | `company_admin` يحمل كل الـ permissions (isSystem) |
| **User** | `admin@example.sa` بدور Company Admin |

**ملاحظات أمان:**
- كلمة المرور التجريبية موجودة داخل `seed.ts` بنص واضح (`Admin@12345`) وهي مُخصَّصة للتطوير واختبار دور الـ bcrypt. يجب **حذفها أو استبدالها** في أي نشر إنتاجي.
- لا تظهر كلمات مرور حقيقية هنا في الـ README.

---

## 16. ما تم إنجازه في المرحلة 0

✅ **Monorepo** + pnpm workspace
✅ **Backend NestJS** skeleton كامل (main.ts, app module, config, database, health)
✅ **Frontend Next.js 14** skeleton (RTL, Tailwind, login + dashboard placeholder)
✅ **Prisma schema**: Company, User, Role, Permission, UserRole, RolePermission, RefreshToken, AuditLog
✅ **PostgreSQL** محلي يعمل + migration مطبق + schema متزامن
✅ **Health endpoint** يستجيب مع فحص حي لـ DB
✅ **Swagger** على `/api/docs`
✅ **ValidationPipe** + **helmet** + **CORS**
✅ **Seed** ينشئ Company + Admin + 30 permission + role بأمان
✅ **Build verification** للـ Backend و Frontend
✅ **README** (هذا الملف)
✅ **docker-compose.yml** كمرجع للتشغيل المحلي/VPS

---

## 17. ما لم يتم بناؤه عمداً في المرحلة 0

المشروع لا يحتوي بعد على أيٍّ من:

- ❌ Auth فعلي (لا login endpoints، لا bcrypt rotation في الـ API بعد)
- ❌ RBAC فعلي (لا Guards مطبَّقة، الـ schema جاهز فقط)
- ❌ Products / Partners / Inventory / Warehouses
- ❌ Sales / POS / Purchases / Invoices
- ❌ Accounting (رغم أن جداوله موجودة لاحقاً عبر schema متوسع)
- ❌ Reports
- ❌ ZATCA integration (الـ schema يدعمها لاحقاً عبر ZatcaSubmission)
- ❌ HR / Payroll / WPS / Qiwa
- ❌ SaaS billing
- ❌ Multi-tenant admin portal
- ❌ Dashboard بمحتوى حقيقي (placeholder فقط)
- ❌ Mock data تجارية

كل هذه تُنفَّذ في **المراحل 1–8** بترتيب معتمد.

---

## 18. القيود الحالية في sandbox

- **Docker غير متاح** في هذه البيئة، لذا تم استخدام PostgreSQL محلي مُثبَّت مباشرة.
- **`docker-compose.yml` يبقى مرجعاً** للتشغيل على جهاز محلي أو VPS لاحقاً.
- عند استبدال كلمة مرور DB في الإنتاج: يجب تحديث `backend/.env` و `docker-compose.yml` معاً.
- مشاكل `prisma migrate dev` التفاعلية (advisory lock + prompts): تم حلها عبر `--skip-seed --skip-generate` صراحةً + تنظيف الجلسات القديمة قبل المحاولة.

---

## 19. عدم استخدام الخدمات المرفوضة

النظام **لا يستخدم** ولا يعتمد على أي من:

| ❌ مرفوض |
|---|
| Hono |
| Cloudflare Workers |
| Cloudflare Pages |
| Cloudflare D1 |
| Cloudflare KV |
| Cloudflare R2 |
| Supabase |
| Firebase |
| Clerk |
| Auth0 |
| SQLite |
| أي managed authentication |
| أي database خاصة بالوكيل أو الـ hosted platform |

المصادقة ستبُنى داخلياً في NestJS بـ **JWT + bcrypt + Refresh tokens + Guards + RBAC** في المرحلة 1.

---

## 20. قابلية التحويل لاحقاً إلى SaaS

النظام مصمم ليكون **Single-Client / Single-Company** حالياً، لكنه **SaaS-ready**:

- كل كيان تجاري (User, Role, Permission settings, إلخ) يحمل `companyId` في الـ schema.
- كل استعلام لاحقاً سيُفلتر بـ `companyId` عبر قاعدة middleware/guards جديدة في المرحلة 1+.
- لاحقاً يمكن بسهولة:
  - استبدال `companyId` بـ `tenantId`، أو
  - إضافة طبقة Tenant فوقها، أو
  - السماح لـ User بأن يكون عضواً في عدة Companies (بدون تعديل جوهري).

هذا يقلل بشكل كبير تكلفة التحويل إلى SaaS لاحقاً.

---

## 21. المرحلة 1 القادمة (مُخطط لها، لم تُنفَّذ)

المرحلة 1 ستركز على:

- Auth (login, logout, refresh, password hashing)
- Company settings (CRUD محدود)
- Users CRUD
- Roles & Permissions UI/API
- JWT + Refresh tokens (HttpOnly cookies أو Bearer، سنحدد في وقتها)
- Guards: `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`
- Rate limiting على login
- Audit log للعمليات الحساسة
- Frontend login page حقيقي
- Frontend dashboard layout (Sidebar + Topbar)
- ربط الواجهة بالـ Backend عبر TanStack Query (سيُقرَّر لاحقاً)

لن تُنفَّذ إلا بموافقة صريحة بعد موافقة على تقرير المرحلة 0.

---

## 22. ملاحظات على البيانات التجريبية

الـ seed الذي يجده المطوّر بعد `prisma db seed`:

| الكيان | المعرّف | ملاحظة |
|---|---|---|
| Company | `seed-company-default` | تجريبي، يجب حذفه في الإنتاج |
| User | `admin@example.sa` | تجريبي بكلمة مرور التطوير |
| Role | `company_admin` | مفتاح |
| Permission catalog | 30 keys | مطابق لخطة المرحلة 1+ |

**أي نشر إنتاجي يجب أن يُعيد تشغيل seed بنسخة نظيفة** أو، الأفضل، أن يستبدل خطوات seed بـ provisioning script مخصَّص.

---

## Phase 1: Authentication and RBAC

> تم تنفيذ هذه المرحلة بالكامل مع `9/9 e2e tests passing`، build نظيف للـ backend و frontend، و smoke flow ناجح على `localhost:3001`. تفاصيلها أدناه مع قيود صريحة.

### Auth Flow

التدفق من النهاية إلى النهاية:

1. **`POST /api/auth/login`** — يستقبل `email` + `password` (طول ≥ 6).
   - يبحث عن المستخدم بـ `prisma.user.findFirst({where:{email}})`.
   - **دائماً** يشغّل `bcrypt.compare` ضد real أو fake hash لتجنّب timing-based user enumeration.
   - عند النجاح: يوقّع `JwtPayload = {sub, companyId, email}` → access token قصير (15m).
   - يولّد refresh token عشوائي 48 byte (`crypto.randomBytes`), يَخزّن **hash SHA-256 فقط** في `RefreshToken` (`tokenHash@unique`)، ويعيد الـ raw token في `Set-Cookie`.
   - يكتب صفّين في `AuditLog`: `auth.login.success` و/أو `auth.login.failed` (مع metadata يحوي الـ email فقط، لا الباسورد).
2. **`POST /api/auth/refresh`** — يقرأ الـ cookie `erp_rt=`، يَحسب `sha256(raw)` ويبحث في `RefreshToken`:
   - إذا غائب أو `revokedAt != null` أو `expiresAt < now` → 401 + audit `auth.refresh.failed`.
   - خلاف ذلك: rotation — يَسجّل `revokedAt = now` على الـ row، ويصدر access token + RT جديد.
   - الـ cookie `Set-Cookie` يعاد مع نفس الـ attributes (HttpOnly, sameSite=lax, secure إذا prod, path=/api/auth).
3. **`POST /api/auth/logout`** — يقرأ الـ cookie، يَسجّل `revokedAt = now` على الـ matching row، ثم يَمسح الـ cookie (`Clear-Cookie` بنفس الـ attributes). يرجع 204.
4. **`GET /api/auth/me`** — تحت `JwtAuthGuard`. الـ strategy يعيد hydrate الـ user من DB كل مرة (تعطيل فوري لأي user عند `isActive=false`). يعيد `SafeUser` كاملاً مع `roles[]` و `permissions[]`.

### Token Storage

هذا الملف مهم أمنياً، لذا نكرّره بوضوح:

- ❌ **لا `localStorage`** إطلاقاً لأي token.
- ❌ **لا `sessionStorage`** إطلاقاً لأي token.
- ✅ **access token (JWT)** → يُحفظ في **memory فقط** داخل الـ frontend (`lib/api.ts` يحتفظ به في module-level variable + listener set). يضيع عند reload الصفحة → يُستبدل تلقائياً عبر `/api/auth/refresh` عند أول request.
- ✅ **refresh token (opaque)** → يُحفظ في **HttpOnly cookie** اسمه `erp_rt`، `path=/api/auth` فقط (لا يُرسل لأي endpoint آخر)، `sameSite=lax`، `secure=true` إذا `NODE_ENV=production` وإلا `false`.
- ✅ **في الـ DB** → يُحفظ **SHA-256 hash فقط** (`RefreshToken.tokenHash@unique`). الـ raw token لا يُسجّل ولا يُعاد للـ DB ولا يُكتب في الـ logs.

### Security

- **Password hashing**: `bcrypt(cost=12)` لكلمة المرور. في `users.service.ts.create` و `users.service.ts.update`.
- **Refresh token at rest**: SHA-256 hash عبر `crypto.createHash('sha256').update(raw).digest('hex')`. الـ raw لا يلامس الـ DB.
- **PasswordHash leakage**: `SafeUser` interface و `findUnique` بـ projections صريحة في `users.service.ts.list` تمنع `passwordHash` من الظهور في response. e2e #6 يُؤكد ذلك فعلياً.
- **No tokens in logs**: `AuditService.sanitize` يحذف أي مفتاح يحوي `password` أو `token` أو `passwordHash` أو `accessToken` أو `refreshToken` (case-insensitive substring match) قبل الكتابة. الـ auth service لا يطبع raw tokens.
- **CORS**: `cors({credentials:true})` + origin مسموح من `CORS_ORIGIN` env (comma-separated). الـ frontend في dev على `http://localhost:3000`.
- **Cookies**: `sameSite=lax` في كل الأوضاع. **`secure=true` فقط في production** (`NODE_ENV=production`)، `secure=false` في dev.
- **Helmet**: مفعّل على كل route عبر `app.use(helmet())` في `backend/src/main.ts`.
- **ValidationPipe**: `whitelist: true, forbidNonWhitelisted: true, transform: true` — كل DTO يحذف أي حقل غير مصرَّح به.
- **Rate limiting**: `@nestjs/throttler` global bucket 60 req/min/I​P + per-endpoint overrides:
  - `POST /api/auth/login` → 10 req/min.
  - `POST /api/auth/refresh` → 30 req/min.
- **Sanitization of metadata on audit**: `FORBIDDEN_KEYS` filter على `Record<string,unknown>` قبل `prisma.auditLog.create`.

### RBAC

النظام **RBAC fine-grained** بدون wildcard في runtime:

- **`Role`** — يملك `key` فريد لكل `companyId` (compound unique). كل role له `isSystem` flag للدور المضمّن (`company_admin`).
- **`Permission`** — global catalog بمفتاح فريد (`users.read`, `sales.invoice.create`, إلخ)، مع `module` و `action`. الـ seed يزرع **39 permissions** في Phase 1.
- **`RolePermission`** — many-to-many.
- **`UserRole`** — many-to-many (user ↔ role, scoped by `companyId`).
- **`@RequirePermissions(...)` decorator** — يَحُط metadata على handlers.
- **`PermissionsGuard`** — `Reflector`-based، يقارن metadata بـ `req.user.permissions` ويعمل throw `ForbiddenException` لأي نقص.
- **`@CurrentUser()` decorator** — يَستخرج `req.user` (محمي بـ `JwtAuthGuard`).
- **`@UseGuards(JwtAuthGuard, PermissionsGuard)`** — على كل controller يحتاج حماية. **`login`, `refresh`, `logout`, `health`, `docs` غير محمية** عمداً.
- **`companyId` scoping** — كل service method يأخذ `companyId` من JWT (لا من request body). كل query يستخدم `findFirst({where:{id,companyId}})`. لا `findUnique({where:{id}})` لوحده.

### Endpoints

| Method | Path | Permission | الوصف |
|---|---|---|---|
| GET | `/api/health` | — | Terminus health + DB ping |
| POST | `/api/auth/login` | — (throttled 10/min) | bcrypt+timing-safe + RT issued |
| POST | `/api/auth/refresh` | — (throttled 30/min) | RT rotation, new RT في cookie |
| POST | `/api/auth/logout` | — | revoke RT + clear cookie, 204 |
| GET | `/api/auth/me` | `JwtAuthGuard` فقط (لا perms) | re-hydrate user من DB |
| GET | `/api/users` | `users.read` | list+search+pagination, scoped by companyId |
| GET | `/api/users/:id` | `users.read` | same scope + roles + permissions |
| POST | `/api/users` | `users.create` | bcrypt12, roleKeys validated against companyId |
| PATCH | `/api/users/:id` | `users.update` | self-protection (no self-deactivate); password optional |
| DELETE | `/api/users/:id` | `users.delete` | soft-delete عبر `isActive=false` |
| GET | `/api/rbac/roles` | `roles.read` | scoped by companyId |
| POST | `/api/rbac/roles` | `roles.create` | normalized key, duplicate guard |
| PATCH | `/api/rbac/roles/:id` | `roles.update` | system role rename blocked |
| DELETE | `/api/rbac/roles/:id` | `roles.delete` | refuses system role + role-in-use |
| GET | `/api/rbac/permissions` | `permissions.read` | global catalog |
| POST | `/api/rbac/roles/:id/permissions` | `roles.permissions.update` | replaces all perms |
| POST | `/api/rbac/users/:id/roles` | `users.roles.update` | replaces all user roles |
| GET | `/api/docs` | — | Swagger UI (basic, no try-it-out auth) |

### Development Admin

بعد تشغيل `pnpm prisma db seed` يكون موجوداً — **للتطوير فقط**:

| الحقل | القيمة |
|---|---|
| Email | `admin@example.sa` |
| Password | `Admin@12345` |
| Company | `seed-company-default` |
| Role | `company_admin` (system) |
| Permissions | جميع الـ 39 permissions في الـ catalog |

⚠️ **تنبيهات صريحة:**
- هذه بيانات تطوير فقط. **يجب حذفها قبل أي نشر إنتاجي.**
- لا تستخدم هذه الـ email/password في staging أو production.
- للنشر الإنتاجي: استبدل `prisma/seed.ts` بـ provisioning script يولد كلمة مرور قوية عشوائية ويفرض تغيير كلمة المرور عند أول login.

### Testing

```bash
# 1) من مستوى الـ monorepo
cd /home/user/webapp/erp-system
pnpm --filter @erp/backend test:e2e

# 2) build الـ backend (NestJS)
pnpm --filter @erp/backend build

# 3) build الـ frontend (Next.js)
pnpm --filter @erp/frontend build
```

ملفات الاختبار في `backend/test/`:
- `app.e2e-spec.ts` — 9 سيناريوهات end-to-end:
  1. login بكلمة مرور خاطئة → 401.
  2. login بكلمة مرور صحيحة → 200 + accessToken + cookie `erp_rt=` + user بدون `passwordHash`.
  3. `/auth/me` بدون token → 401.
  4. `/auth/me` بـ Bearer → 200 مع permissions.
  5. `/api/users` بدون token → 401.
  6. `/api/users` بـ admin token → 200 ولا يوجد passwordHash في items.
  7. refresh rotation: الـ RT القديم يُرفض بعد refresh ناجح.
  8. logout: 204 + refresh لاحق → 401.
  9. cashier (لا `users.read`) على `/api/users` → 403.
- `jest-e2e.json` — config مخصص لـ e2e (pattern `.e2e-spec.ts$`, timeout 30s).

### Remaining TODOs

ما هو مؤجَّل للمرحلة 1-b (موثَّق في الكود):

1. **`last-admin protection`** — حالياً `UsersService.remove` يمنع Soft-delete النفس فقط، لكن يمكن حذف آخر admin في الشركة (ما دام actorUserId != id). طُبّع TODO في `users.service.ts`:
   ```ts
   // TODO(last-admin-protection): add a check that at least one user with `company_admin`
   //   remains active. This is intentionally simple in Phase 1 to avoid prematurely
   //   designing role-protection rules that may change in Phase 1-b.
   ```
2. **`per-email rate limit`** — حاليا `@Throttle` على `POST /api/auth/login` بـ 10 req/min/I​P. نفس الـ IP لو استخدم credential stuffing على 100 email مختلف = 100*10=1000 محاولة/دقيقة ممكنة. الـ TODO واضح في `auth.controller.ts`:
   ```ts
   // Strict per-IP rate limit on login. TODO(phase1-b): per-email.
   ```
3. **Swagger try-it-out** — `@ApiBearerAuth()` على `/me` فقط، باقي الـ endpoints لا تحوي `ApiSecurity` (كتب swagger من غير تجربة inline). المرحلة 2+ ستحتاج تعريف `ApiBearerAuth` على routes المحمية + `ApiOperation` لـ descriptions.
4. **`noImplicitAny`** — `tsconfig.json` فيه `noImplicitAny: false` مع TODO. سيُعاد تفعيله في المرحلة 1-b بعد كتابة أنواع صريحة على callbacks Prisma.
5. **`audit read endpoint`** — permission `audit.read` مسجَّل في الـ catalog لكن لا يوجد endpoint `/api/audit/logs` بعد. سيُنفَّذ في المرحلة 8 (hardening).
6. **JWT_REFRESH_SECRET** — مُعرَّف في config لكن غير مُحقَّق في use (`AuthService` يعتمد على `JWT_ACCESS_SECRET` فقط لتوقيع access؛ refresh tokens هي opaque random، لا JWT). مؤجَّل لتنظيف المرحلة 1-b.

> **خلاصة:** المرحلة 1 أُغلقت مع 6 limitations موثَّقة بوضوح. لا يُسمح بفتح Phase 2 قبل معالجة هذه الـ TODOs أو الموافقة الصريحة على تأجيلها.

---

## Phase 2: Products and Partners (Master Data)

> تم تنفيذ المرحلة 2 بالكامل مع **23/23 e2e tests passing** (Phase 1: 9 + Phase 2 Products: 7 + Phase 2 Partners: 7)، builds نظيفة للـ backend و frontend. هذه المرحلة **master data فقط** — لا inventory، لا مبيعات، لا محاسبة.

### Scope

ما تم تنفيذه في Phase 2:

| المنطقة | المحتوى |
|---|---|
| Backend Prisma | موديل `Product` + `Partner` + enums `ProductType` و `PartnerType` + migration اسمها `phase2_products_partners` |
| Backend permissions | 8 صلاحيات جديدة مُضافة لـ catalog (وللـ admin role عبر loop في seed) |
| Backend services | `ProductsService` + `PartnersService` بـ full CRUD |
| Backend controllers | `ProductsController` + `PartnersController` بـ 5 endpoints لكل واحد |
| Backend audit | `products.created/updated/deleted` و `partners.created/updated/deleted` |
| Frontend pages | `/products` و `/partners` بـ CRUD forms حقيقي + search/filter/pagination |
| Frontend api client | إضافة 12 method (`api.listProducts/getProduct/createProduct/updateProduct/deleteProduct` و counterparts للـ partners) في `frontend/src/lib/api.ts` |
| Tests | 14 اختبار e2e (7 per module) مدمجة في نفس `app.e2e-spec.ts` |
| README | هذا القسم ✓ |
| Git commit | موثَّق في تقرير الـ repo |

ما لم يتم تنفيذه عمداً في Phase 2 (مؤجَّل — لا تبدأه بدون موافقة):

- ❌ Inventory و warehouses و stock movements و balances.
- ❌ Sales invoices و POS و purchase invoices.
- ❌ Accounting و journal entries و VAT reports و financial reports.
- ❌ ZATCA integration.
- ❌ HR / Payroll / WPS / Qiwa.
- ❌ SaaS billing و tenant portal.
- ❌ Demo business data (لا seed منتجات ولا عملاء ولا موردين — الـ admin user فقط).

### Database / Prisma Changes

**Models جديدة:**

```prisma
enum ProductType { PRODUCT SERVICE }

model Product {
  id             String      @id @default(cuid())
  companyId      String
  sku            String                      // NOT NULL, unique per company
  name           String
  nameAr         String?
  description    String?
  type           ProductType @default(PRODUCT)
  barcode        String?                     // nullable, partial unique per company
  unit           String?                     // pcs / kg / hr / ...
  priceBeforeVat Decimal?  @db.Decimal(18, 4) // Decimal NEVER Float
  vatRate        Decimal   @default(15.00) @db.Decimal(5, 2)
  isActive       Boolean   @default(true)
  deletedAt      DateTime?                   // soft delete only
  createdAt/updatedAt DateTime (auto)
  createdById/updatedById String?            // via User relation (SetNull)

  company   Company @relation(...)
  createdBy User?   @relation("ProductCreatedBy", ...)
  updatedBy User?   @relation("ProductUpdatedBy", ...)

  @@unique([companyId, sku])
  @@index([companyId, isActive])
  @@index([companyId, deletedAt])
  @@index([companyId, name])
  @@map("products")
}

enum PartnerType { CUSTOMER SUPPLIER BOTH }

model Partner {
  // Same shape as Product but:
  //  - code (nullable, partial unique per company)
  //  - vatNumber (nullable, 15 digits, partial unique per company)
  //  - commercialRegistration / email / phone / address / city / country
  //  - default country = 'SA'
  // compound unique via partial indexes only (Prisma cannot express nullable-unique
  //   in its DSL). Indexes appended in raw SQL of the migration.
}

User {
  // New reverse-relations added (no breaking change):
  productsCreated Product[] @relation("ProductCreatedBy")
  productsUpdated Product[] @relation("ProductUpdatedBy")
  partnersCreated Partner[] @relation("PartnerCreatedBy")
  partnersUpdated Partner[] @relation("PartnerUpdatedBy")
}
```

**Migration name:** `phase2_products_partners` (id `20260907002406_phase2_products_partners`).

**Partial unique indexes** (للقيم nullable القابلة للتكرار null) — Prisma لا تستطيع التعبير عنها في DSL، لذا أُضيفت يدوياً عبر SQL خام في الـ migration:

```sql
CREATE UNIQUE INDEX "products_companyId_barcode_key"
  ON "products"("companyId", "barcode")
  WHERE "barcode" IS NOT NULL;

CREATE UNIQUE INDEX "partners_companyId_code_key"
  ON "partners"("companyId", "code")
  WHERE "code" IS NOT NULL;

CREATE UNIQUE INDEX "partners_companyId_vatNumber_key"
  ON "partners"("companyId", "vatNumber")
  WHERE "vatNumber" IS NOT NULL;
```

**Seed update:** الـ `seed.ts` يحتوي بالفعل على الـ 8 صلاحيات في الـ `PERMISSIONS` array ويُمرّرها جميعاً (39 إجمالاً في Phase 1+2) إلى `RolePermission` عبر loop للـ `company_admin` role. لا wildcards. لا توجد منتجات ولا شركاء تجريبيين في الـ seed — المستخدم نفسه هو فقط من يضيف البيانات عبر الـ API.

### Backend Implementation

**Modules:**

```
backend/src/products/
├── products.module.ts           # Module + providers
├── products.controller.ts       # 5 endpoints
├── products.service.ts          # business logic, scoped by companyId
└── dto/
    ├── create-product.dto.ts    # class-validator + Swagger
    ├── update-product.dto.ts    # كل الحقول optional
    └── product-query.dto.ts     # pagination + filters

backend/src/partners/
├── partners.module.ts           # (نفس الـ structure)
├── partners.controller.ts
├── partners.service.ts
└── dto/
    ├── create-partner.dto.ts
    ├── update-partner.dto.ts
    └── partner-query.dto.ts
```

**Tenancy guardrails:**

- `companyId` مستخرج حصرياً من `me.companyId` (الـ JWT). **لا يُقبل** `companyId` من body ولا query.
- كل query يستخدم `findFirst({ where: { id, companyId, deletedAt: null } })`. لا `findUnique({ where: { id } })` وحده أبداً.
- كل `list` يُضيف `where.deletedAt = null` تلقائياً → soft-deleted rows مخفية تماماً.
- الـ `createById/updatedById` تأتي من `me.id` (actor الـ JWT)، لا من الـ body.
- `decimal-as-string` على كل money fields (لا `Float` أبداً). الـ Postgres columns هي `Decimal(18,4)` و `Decimal(5,2)`.
- `vatNumber` validation: `@Matches(/^\d{15}$/)` (15 رقم ZATCA).

**Duplicate-detection في transaction:**

```ts
async create(companyId, dto, actorUserId) {
  return this.prisma.$transaction(async (tx) => {
    await this.assertSkuUnique(tx, companyId, dto.sku);
    await this.assertBarcodeUnique(tx, companyId, dto.barcode);
    return tx.product.create({ data: { ... } });
  });
}
```

الـ `assertSkuUnique` و `assertBarcodeUnique` يستخدمان `findFirst({ where: { companyId, sku, deletedAt: null, NOT: { id } } })`، ثم `ConflictException` على وجود سجل. نفس النمط في `update` (مع `NOT: { id }`) و `PartnersService` لـ `code` و `vatNumber`.

**Audit:**

```ts
await this.audit.record({
  companyId,
  userId: actorUserId,
  action: 'products.created',  // or 'products.updated' / 'products.deleted'
  entity: 'Product',
  entityId: created.id,
  metadata: { sku, type },
});
```

لا metadata حساسة — الـ `AuditService` يحذف مفاتيح يحوي كلمات `password/token/accessToken/refreshToken/passwordHash` بـ `FORBIDDEN_KEYS`.

**Guards و RBAC:**

- كل endpoint محمي بـ `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
- كل handler يحدد `@RequirePermissions('products.read' / 'products.create' / 'products.update' / 'products.delete')` (و counterparts للـ partners).
- `@ApiTags('Products')` و `@ApiTags('Partners')` و `@ApiBearerAuth()` على مستوى الـ controller.

### Frontend Implementation

**Pages:**

```
frontend/src/app/products/page.tsx   # ~16.7 KB
frontend/src/app/partners/page.tsx   # ~18.1 KB
```

كل صفحة توفر:

| الميزة | السلوك |
|---|---|
| Auth gate | `useEffect` يعيد توجيه لـ `/login` إذا لم يكن هناك user، ولـ `/dashboard` إذا لا يحمل الـ permission المطلوب |
| List | `api.listProducts({...})` / `api.listPartners({...})` مع pagination (`page`, `pageSize=20`) و search و filter |
| Search | بحث في `name`/`sku`/`barcode` للمنتجات، و `name`/`code`/`vatNumber`/`phone`/`email` للشركاء. يعاد ضبط `page=1` عند الكتابة. |
| Filter | `type` filter (PRODUCT/SERVICE للعناصر، CUSTOMER/SUPPLIER/BOTH للشركاء). |
| Loading / Empty / Error | جدول يعرض "...جاري التحميل" أو empty state أو رسالة خطأ |
| Create / Edit form | حقيقي في نفس الصفحة. الـ Edit يَملأ الـ form ويُغيّر POST → PATCH. |
| Delete | confirm dialog + soft-delete عبر `api.deleteProduct(id)` / `api.deletePartner(id)` الذي يضع `deletedAt=now`. ينعكس في الـ list. |
| Per-row action buttons | enabled/disabled بناءً على `hasPermission('products.update' / 'products.delete')` |
| RTL | كل النصوص العربية بطبيعة `dir=rtl`، الـ numeric fields بطبيعة `dir=ltr` |

**API client (`frontend/src/lib/api.ts`):** الـ 12 method الجديدة + types الكاملة للـ `Paginated<T>` و `Product` و `Partner`. لا تغيير على آلية الـ access token (يبقى in-memory) ولا على `/auth/refresh` flow. لا localStorage ولا sessionStorage.

### Endpoints

| Method | Path | Permission | الوصف |
|---|---|---|---|
| GET | `/api/products` | `products.read` | list+search+filter+pagination, scoped by companyId, excludes soft-deleted |
| GET | `/api/products/:id` | `products.read` | single, scoped by companyId, 404 if soft-deleted |
| POST | `/api/products` | `products.create` | DECIMAL-as-string للأرقام، unique sku+barcode per company |
| PATCH | `/api/products/:id` | `products.update` | partial update, dup-check على sku/barcode (إذا تغيرا) |
| DELETE | `/api/products/:id` | `products.delete` | soft delete (deletedAt + isActive=false)، 200 body `{id, isActive:false}` |
| GET | `/api/partners` | `partners.read` | list+search+filter+pagination، البحث في name/code/vat/phone/email |
| GET | `/api/partners/:id` | `partners.read` | single, 404 if soft-deleted |
| POST | `/api/partners` | `partners.create` | `vatNumber` regex 15 رقم، `code` partial unique |
| PATCH | `/api/partners/:id` | `partners.update` | partial update, dup-check |
| DELETE | `/api/partners/:id` | `partners.delete` | soft delete |

### Permissions Added in Phase 2

| Permission | Purpose |
|---|---|
| `products.read` | قراءة قائمة/تفاصيل products |
| `products.create` | إضافة product جديد |
| `products.update` | تعديل product موجود |
| `products.delete` | soft-delete product |
| `partners.read` | قراءة قائمة/تفاصيل partners |
| `partners.create` | إضافة partner جديد |
| `partners.update` | تعديل partner موجود |
| `partners.delete` | soft-delete partner |

كلها مضافة لـ `prisma/seed.ts` كـ `PERMISSIONS[]` items ومُمرَّرة لـ `company_admin` role عبر `RolePermission.upsert` loop. لا wildcards ولا `*` keys.

### Verification Commands

```bash
cd /home/user/webapp/erp-system

# Regenerate Prisma client (مباشر بعد schema changes)
pnpm db:generate

# Apply migrations (لا reset — الـ DB مستمر مع بيانات Phase 1)
pnpm db:migrate:dev   # للـ dev local
# أو (للإنتاج)
pnpm db:migrate:deploy

# Run seed (idempotent — الـ permissions الجديدة تُضاف دون تأثير على الشركة/المستخدم الحالي)
pnpm db:seed

# Backend e2e tests (Phase 1: 9 + Phase 2 Products: 7 + Phase 2 Partners: 7 = 23 total)
pnpm --filter @erp/backend test:e2e

# Backend build
pnpm --filter @erp/backend build

# Frontend build (يجب أن يكتمل مع 8 routes: /_not-found, /dashboard, /login, /users, /products, /partners + incurred)
pnpm --filter @erp/frontend build
```

### Security / Tenancy Notes

- الـ `companyId` يأتي من JWT حصرياً عبر `currentUser.companyId`. لا يُقبل من body أو query.
- التحقق العابر للشركات (cross-tenant) تم اختباره ضمنياً: `findFirst({ where: { id, companyId } })` يرجع `null` لأي id ينتمي لشركة أخرى → 404.
- لا `localStorage` ولا `sessionStorage` في الـ frontend.
- لا mock data — الـ seed ينشئ company + admin user فقط، ولا seed products/partners.
- الـ `passwordHash` لا يظهر في أي response (e2e #6 of Phase 1 يؤكد ذلك + Phase 2 e2e #6 of Products يضيف تأكيد صريح مماثل).
- الـ `Decimal` Postgres types ترجع كـ strings من Prisma — لا تحويل لـ `Number`/`Float` في أي مكان، حتى في الـ frontend.

### Testing

**e2e tests in `app.e2e-spec.ts`** (23 passing):

Phase 1 — 9 tests لا تزال passing دون تعديل يضمن عدم انكسار backward compatibility.

**Phase 2 Products — 7 tests:**
1. GET /products بدون token → 401.
2. GET /products كـ admin → 200 + paginated shape `{total, page, pageSize, items}`.
3. POST /products بـ payload صحيح → 201، يحوي `id` و `sku` و `companyId` و `deletedAt=null`.
4. POST /products بـ `sku` مكرر → 409 Conflict.
5. PATCH /products/:id → 200، يتحقق من الـ rename والـ Decimal priceBeforeVat.
6. DELETE /products/:id → 200، يُرجع `{id, isActive:false}` (soft delete).
7. GET /products/:id بعد الحذف → 404.

**Phase 2 Partners — 7 tests:**
1. GET /partners بدون token → 401.
2. GET /partners كـ admin → 200 + paginated shape.
3. POST /partners بـ payload صحيح (vatNumber 15 رقم) → 201.
4. POST /partners بـ `code` مكرر → 409.
5. PATCH /partners/:id → 200، يتحقق من الـ rename + city.
6. DELETE /partners/:id → 200.
7. GET /partners/:id بعد الحذف → 404.

### Known Limitations / TODOs Forwarded

كل TODOs من Phase 1 الـ 6 السابقة لا تزال قائمة. لا شيء تم تجاهله.

مضاف إلى Phase 2:

1. **`last-admin protection`** — لا يزال TODO في Phase 1 (بانتظار الـ admin لحماية في users، لا علاقة لها بـ products/partners).
2. **`stockQuantity` و costPrice** — مُؤجَّلاً لـ Phase 3 (Inventory). الـ schema الحالي يحوي `priceBeforeVat` فقط — سعر البيع قبل الضريبة. لا متوسط تكلفة ولا FIFO ولا LIFO.
3. **`openedAt/openBalance`** بالنسبة للـ Partners — مُؤجَّلاً. الـ Partner حالياً لا يحوي رصيد افتتاحي ولا ledger، فقط data only.
4. **`partner ar/en name lookup` keys** — الـ Partner model يحوي `name` (English/required) + `nameAr` (Arabic/optional). لا يوجد search/duplicate detection على `nameAr` — فقط على `code` و `vatNumber`.
5. **OpenAPI examples** — الـ DTOs تستخدم generic examples (مثل `"SKU-0001"`). لا توجد بيانات أعمال حقيقية في الـ Swagger docs (التزاماً بـ "no mock business data").

### Recommendation

المرحلة 2 جاهزة للإغلاق. **المرحلة 3 (Inventory only)** يجب ألا تبدأ إلا بعد موافقة صريحة. تقترح المرحلة 3:

- موديلات: `Warehouse`, `StockLevel`, `StockMovement`.
- permissions: `inventory.read`, `inventory.adjust`, `inventory.transfer`.
- endpoints أساسية فقط.
- لا sales / purchases / accounting / ZATCA في Phase 3.

---

**آخر تحديث:** إغلاق المرحلة 2 — `23/23 e2e tests passing` (Phase 1: 9 + Phase 2 Products: 7 + Phase 2 Partners: 7)، builds نظيفة للـ backend (8 routes) و frontend. git commit موثَّق في تقرير الـ repo. لا انتقال إلى Phase 3 قبل موافقة صريحة.

---

## Phase 3: Inventory Core

> **هذه المرحلة هي Inventory Core فقط** — لا Sales/POS/Purchases/Accounting/Reports/ZATCA. تمت كتابتها كطبقة فوق Phase 1 (Auth + RBAC) و Phase 2 (Products/Partners) بالكامل، ولا تغيّر أي معمارية قائمة.

### Scope

Phase 3 introduces the **inventory core** layer:

- **Warehouses** — master data for physical locations.
- **Stock Levels** — current quantity per `(companyId, productId, warehouseId)`.
- **Stock Movements** — append-only audit log of every quantity change.
- **Manual Adjustments** — `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` with required reason.
- **Warehouse Transfers** — paired `TRANSFER_OUT` + `TRANSFER_IN` in one transaction.

### What is included

- Warehouse CRUD (unique code per company, soft delete only).
- Stock level listing filtered by product / warehouse / search by SKU/name.
- Append-only stock movement log with `OPENING_BALANCE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `TRANSFER_IN`, `TRANSFER_OUT` types and `IN` / `OUT` direction.
- Manual stock adjustment endpoint (`POST /api/inventory/adjustments`) — refuses SERVICE products, refuses OUT > current balance.
- Warehouse transfer endpoint (`POST /api/inventory/transfers`) — refuses same-warehouse, refuses insufficient source stock; creates **paired** movements in a single transaction.
- Refusal to soft-delete a warehouse that has any `quantity > 0` or `reservedQuantity > 0`.
- 7 RBAC permissions wired through the existing `JwtAuthGuard` + `PermissionsGuard` + `@RequirePermissions` chain.
- Frontend pages: `/warehouses` (CRUD) and `/inventory` (levels + movements + adjust + transfer).

### What is intentionally excluded

The following are **explicitly NOT** included in Phase 3 and will not appear in the codebase, seed data, or generated migrations:

- Sales & POS (invoices, sales orders, point-of-sale)
- Purchases & procurement flows
- Accounting (journals, GL, COGS, cost layers)
- Reports (financial, inventory valuation, sales)
- ZATCA e-invoicing
- HR / Payroll / WPS / Qiwa / GOSI
- SaaS billing, subscriptions, tenant portal
- Costing / COGS / FIFO / LIFO / average cost
- Serial numbers / batch tracking / expiry dates
- Barcode scanning / hardware integration
- **Mock business data** (no demo warehouses, no demo products, no demo stock, no demo movements)

### Inventory rules (enforced in `backend/src/inventory/inventory.service.ts`)

| Rule | Enforcement |
|---|---|
| Only `PRODUCT` items can have stock | `SERVICE` returns `400 BadRequestException` |
| No negative stock | `ADJUSTMENT_OUT > balance` → `400`; `TRANSFER > sourceBalance` → `400` |
| `StockMovement` is append-only | No UPDATE/DELETE endpoint is exposed; consumers GET only |
| Adjustments create one movement | Single `StockMovement` insert in same `$transaction` as `StockLevel` update |
| Transfers create paired movements | One `TRANSFER_OUT` (source, OUT, `referenceId = out.id`) + one `TRANSFER_IN` (dest, IN) per transfer |
| No sales/purchase integration | `referenceType` is `'manual_adjustment'` or `'transfer'` only; no foreign key to any sales/purchase table |

### Permissions

| Permission | Purpose |
|---|---|
| warehouses.read | List/get warehouses |
| warehouses.create | Create warehouses (unique `code` per company) |
| warehouses.update | Edit warehouses (re-checks `code` uniqueness, including when changing the code) |
| warehouses.delete | Soft-delete warehouses (refused while stock > 0) |
| inventory.read | Read stock levels per warehouse / product |
| inventory.adjust | Create manual stock adjustments (IN / OUT) |
| inventory.transfer | Transfer stock between warehouses (paired movements) |
| stockMovements.read | Read append-only stock movement log |

All 8 permissions are seeded into the `company_admin` role at `pnpm db:seed` time. `inventory.read` / `inventory.adjust` / `inventory.transfer` were inserted in Phase 2; `warehouses.*` and `stockMovements.read` were added for Phase 3 (`pnpm db:seed` now reports **44 permissions × 44 admin grants**).

### Endpoints

| Method | Path | Permission |
|---|---|---|
| GET | /api/warehouses | warehouses.read |
| GET | /api/warehouses/:id | warehouses.read |
| POST | /api/warehouses | warehouses.create |
| PATCH | /api/warehouses/:id | warehouses.update |
| DELETE | /api/warehouses/:id | warehouses.delete |
| GET | /api/inventory/levels | inventory.read |
| GET | /api/inventory/movements | stockMovements.read |
| POST | /api/inventory/adjustments | inventory.adjust |
| POST | /api/inventory/transfers | inventory.transfer |

### Testing commands

```bash
pnpm --filter @erp/backend test:e2e
pnpm --filter @erp/backend build
pnpm --filter @erp/frontend build
```

Expected results after Phase 3:

- Backend `test:e2e`: **41 / 41 passing** (9 Phase 1 + 7 Phase 2 Products + 7 Phase 2 Partners + **7 Phase 3 Warehouses + 11 Phase 3 Inventory**).
- Backend `build`: `nest build` exits 0.
- Frontend `build`: 10 routes (`/login`, `/dashboard`, `/users`, `/products`, `/partners`, **`/warehouses`**, **`/inventory`**, `/_not-found`, plus shared chunks).

### Migration note

The Phase 3 migration applied to the PostgreSQL dev database is:

```
20260907005059_phase3_inventory_core
```

It creates:

- Enum types `StockMovementType` and `StockMovementDirection`.
- Tables `warehouses`, `stock_levels`, `stock_movements`.
- The required `@@unique([companyId, code])` partial uniqueness, a `[companyId,productId,warehouseId]` uniqueness on `stock_levels`, and the standard `ForeignKey` references to `companies`, `users`, `products`, `warehouses`.
- Indexes: `[companyId, isActive]`, `[companyId, deletedAt]`, `[companyId, name]` on `warehouses`; `[companyId, movementDate]`, `[companyId, productId, movementDate]`, `[companyId, warehouseId, movementDate]`, `[companyId, movementType]` on `stock_movements`.

### Security / tenancy (unchanged from Phase 1 + 2)

- `companyId` is **always** sourced from `currentUser.companyId` (JWT). It is **never** accepted from request body / query / path.
- Every `prisma.warehouse / prisma.stockLevel / prisma.stockMovement` query is filtered by `companyId`.
- Stock never escapes the owning company's tenancy.
- No `localStorage` / `sessionStorage`; access token lives in-memory in `frontend/lib/api.ts` (Phase 1 holds the contract).
- No mock business data — only permissions and an admin user are seeded. The e2e suite creates and abandons its own test products/warehouses.

### Recommendation

Phase 3 (Inventory Core) is ready to close. **Phase 4 must NOT be started without explicit user approval.** When approved, Phase 4 should be Sales + POS only and follow the same scope discipline (RBAC permissions, append-only audit, `companyId` coupling, no mock business data).

---

## Phase 4: Sales + POS

> **هذه المرحلة هي Sales + POS فقط** — لا Purchases/Accounting/Reports/ZATCA/HR/Payroll. تمت كتابتها فوق Phase 1 (Auth + RBAC) و Phase 2 (Products/Partners) و Phase 3 (Inventory Core) بالكامل، ولا تغيّر أي معمارية قائمة. لا تستخدم أي خدمات Cloudflare (لا Workers، لا D1، لا KV، لا R2، لا Pages) ولا Wrangler ولا النشر المُستضاف.

### Scope

Phase 4 introduces the **sales + point-of-sale** layer:

- **Sales Invoices** — `STANDARD` (مشتريات تقليدية عبر /sales/invoices) و `POS` (نقطة بيع فورية).
- **Sales Status Machine** — `DRAFT → ISSUED → CANCELLED`.
- **POS Backend** — إصدار فوري عبر `/pos/sales` (SalesInvoice of type `POS`, يُصدر فورًا بنفس الـ transaction).
- **SALE_OUT Stock Movement** — خصم المخزون يتم في `SalesService.issue` في نفس transaction الذي يخصم `StockLevel` ويُلحق `SALE_OUT movement` بـ `referenceType='sales_invoice'` و `referenceId = invoice.id`.
- **Frontend** — صفحتان جديدتان تحت RTL مع بوابات RBAC.

### What is included

#### Phase 4B-1: Sales drafts (Phase 4B-1 commit `edb8456`)

- إنشاء مسودة فاتورة بيع عبر `POST /api/sales/invoices` مع رأس (customer, issueDate, dueDate, notes) و خطوط (product, warehouseId?, quantity, unitPrice, discountAmount, vatRate, description).
- القراءة `GET /api/sales/invoices/:id` لاسترجاع المسودة.
- التحديل `PATCH /api/sales/invoices/:id` للمسودات فقط (الحالة `DRAFT`).
- الحذف الناعم `DELETE /api/sales/invoices/:id` (soft-delete بـ `deletedAt`/`isActive`).
- توليد `invoiceNumber = si-YYYYMMDD-NNNN` مع إعادة محاولة 3-مرات ضد تصادم race.

#### Phase 4B-2: Sales issue/cancel (Phase 4B-2 commit `d8bd54d`)

- `POST /api/sales/invoices/:id/issue` — DRAFT → ISSUED، يخصم المخزون + يُصدر `SALE_OUT movement`.
- `POST /api/sales/invoices/:id/cancel` — DRAFT → CANCELLED (مرفوض لـ ISSUED برسالة "credit note introduction in a future phase"، ومرفوض لـ CANCELLED كـ already-cancelled).
- `SERVICE` lines تعبر بدون خصم مخزون.
- `PRODUCT` lines تتطلب `warehouseId` وتُرفض في `issue` لو `quantity > balance` (`BadRequestException` 400).

#### Phase 4B-3: POS backend (Phase 4B-3 commit `3738151`)

- `PosModule` بجانب `SalesModule` في `app.module.ts`. AuditModule هو `@Global()`.
- `POST /api/pos/sales` — ينشئ مسودة POS ثم يُصدرها فورًا بنفس transaction (يكتب `paymentMethod`، `paidAmount`، `notes` ويحط `type=POS`).
- `GET /api/pos/sales` — paginated، محصور بـ `type=POS, deletedAt=null`.
- `sales.createDraft(..., { type, paymentMethod, paidAmount })` هو internal helper، الـ facade العمومي بقيّ `create()` لـ `type: STANDARD` بنفس signature.

#### Phase 4C: Frontend (this commit, planned message `feat(phase-4): add sales+pos frontend`)

- `frontend/src/lib/api.ts` (578 سطرًا) — أضفنا `listSalesInvoices`/`getSalesInvoice`/`createSalesInvoice`/`updateSalesInvoice`/`deleteSalesInvoice`/`issueSalesInvoice`/`cancelSalesInvoice` + `listPosSales`/`createPosSale` + helpers `listActiveCustomers`/`listActiveWarehouses`/`listActiveProducts`. 12 نوعًا جديدًا في الفئة `Sales + POS` (Decimals end-to-end كسلاسل نصية).
- `frontend/src/app/sales/page.tsx` (Single Page App) — جدول فواتير مع فلاتر (search/status/type/customer)، نموذج مسودة برأس + خطوط ديناميكية، per-row actions (edit/issue/cancel/delete) each gated by `sales.{read,create,update,delete,issue,cancel}`.
- `frontend/src/app/pos/page.tsx` — سلة POS + نموذج دفع + جدول آخر 20 فاتورة POS. بوابة RBAC: `pos.read` للقراءة، `pos.create` للإصدار.
- `frontend/src/app/dashboard/page.tsx` — أضفنا زرين جديدين بألوان مميزة: `المبيعات` (teal) gated بـ `sales.read` و `نقطة البيع` (rose) gated بـ `pos.read`.
- جميع الصفحات RTL `<html dir="rtl" lang="ar">`, لا `Number` حسابي في الـ UI (الـ Display-only conversions فقط).

### What is intentionally excluded

ما يلي **ليس** في Phase 4 ولا يجب أن يظهر في الـ codebase أو الـ migrations أو الـ seed:

- **Purchases** (المشتريات، أوامر الشراء، استلام البضاعة).
- **Accounting** (دفاتر يومية، GL، COGS، cost layers).
- **Reports / analytics / dashboards** (تقارير مالية، تقارير مخزون، تقارير مبيعات، valuation).
- **ZATCA** (الفوترة الإلكترونية، TLV/SHA256، CSID، XML).
- **HR / Payroll / WPS / Qiwa / GOSI**.
- **SaaS billing** (اشتراكات، tenant portal، Stripe).
- **Costing / COGS / FIFO / LIFO / average cost** حتى داخل الـ sales.
- **Serial numbers / batch / expiry** للمواد المباعة.
- **POS hardware integration** (Barcode scanner, cash drawer, receipt printer).
- **Payment gateway integration** (Stripe, Tap, HyperPay, mada, ApplePay).
- **Refunds, returns, credit notes, partial payments, split payments, shift management**.
- **No mock business data** — لا عملاء تجريبيين، لا منتجات تجريبية، لا فواتير demo.

### Permissions (Phase 4 — extended from Phase 1's 52-permission matrix)

| Permission | الغرض | المرحلة |
|---|---|---|
| `sales.read` | قراءة/قائمة الفواتير | Phase 4B-1 |
| `sales.create` | إنشاء مسودة فاتورة | Phase 4B-1 |
| `sales.update` | تعديل مسودة | Phase 4B-1 |
| `sales.delete` | حذف ناعم لمسودة | Phase 4B-1 |
| `sales.issue` | إصدار (issue) مسودة → خصم المخزون + SALE_OUT | Phase 4B-2 |
| `sales.cancel` | إلغاء فاتورة (DRAFT→CANCELLED) | Phase 4B-2 |
| `pos.read` | قراءة / قائمة POS sales | Phase 4B-3 |
| `pos.create` | إصدار فاتورة POS فورًا | Phase 4B-3 |

جميع 8 الصلاحيات تُضاف لِدور `company_admin` وقت `pnpm db:seed` (الـ seed idempotent: الصلاحيات الجديدة تُضاف دون تأثير على الشركة/المستخدم الحالي). الإجمالي الآن: **52 permission × admin grants**.

### Endpoints (الـ 11 مسار الجديد لـ Phase 4)

| Method | Path | Permission | Phase |
|---|---|---|---|
| GET | /api/sales/invoices | sales.read | 4B-1 |
| GET | /api/sales/invoices/:id | sales.read | 4B-1 |
| POST | /api/sales/invoices | sales.create | 4B-1 |
| PATCH | /api/sales/invoices/:id | sales.update | 4B-1 |
| DELETE | /api/sales/invoices/:id | sales.delete | 4B-1 |
| POST | /api/sales/invoices/:id/issue | sales.issue | 4B-2 |
| POST | /api/sales/invoices/:id/cancel | sales.cancel | 4B-2 |
| GET | /api/pos/sales | pos.read | 4B-3 |
| POST | /api/pos/sales | pos.create | 4B-3 |

### Sales rules (enforced in `backend/src/sales/sales.service.ts`)

| القاعدة | الإنفاذ |
|---|---|
| الحقول النقدية `@db.Decimal(18, 4)` | Prisma Decimal، لا `Number` رياضيات في الـ service |
| `companyId` من JWT فقط | لا يُقبل من body/query/path |
| DRAFT→ISSUED حصرًا عبر `POST /issue` | خصم المخزون + `SALE_OUT movement` نفس الـ `$transaction` |
| ISSUED→CANCELLED مرفوض حاليًا | خدمة تُرجع `400` بالرسالة "Issued invoices require credit note/reversal flow in a future phase." |
| CANCELLED→CANCELLED مرفوض | `400 BadRequestException('Invoice is already CANCELLED.')` |
| PATCH مسودة مرفوض إذا الحالة ليست DRAFT | `ConflictException` 409 |
| `POS sales` يُصدر تلقائيًا من POST | يستخدم `sales.createDraft({ type:POS, paymentMethod, paidAmount })` ثم `sales.issue(...)` |
| `SERVICE` خطوط تتجاوز المخزون | لا خصم، لا `movement` |
| `PRODUCT` خطوط تتطلب `warehouseId` | `BadRequestException('PRODUCT lines require warehouseId.')` |
| `quantity > balance` في الـ issue مرفوض | `BadRequestException` 400 مع `Balance: X, Requested: Y` |
| رقم فاتورة فريد على مستوى الشركة | `si-YYYYMMDD-NNNN`, 3-attempt race retry |
| `AuditService.record` best-effort | `FORBIDDEN_KEYS` sanitization, لا يُكسر الـ flow |

### Stock coupling (Sales ↔ Inventory)

- `SALE_OUT movement` يُلحق فقط في `POST /issue` (STANDARD) أو في `POST /pos/sales` (POS, يُصدر فورًا).
- `referenceType='sales_invoice'` و `referenceId=invoice.id` على الـ movement.
- كل حركة تتنزل من `StockLevel.quantity` في نفس الـ transaction.
- لا يُنشأ أي `SaleInvoice` بدون أن تتحرك الـ movements الإلكترونيات الخاصة به لو الـ lines his `PRODUCT`.
- لا `PURPOSE_IN/STOCK_IN` مرتبط — طريق خصم المخزون الوحيد في هذا الـ codebase هو عبر sales issue أو adjustments/transfer.

### Frontend routes (Phase 4C)

| المسار | RBAC gate | الغرض |
|---|---|---|
| `/sales` | `sales.read` | كل الفواتير (status/type filter، draft form) |
| `/pos` | `pos.read` (يقرأ) + `pos.create` (يصدر) | POS point-of-sale canvas + recent list |
| `/dashboard` | (existing) | زرين إضافيين: `المبيعات` (teal) + `نقطة البيع` (rose) |

عدد routes بعد Phase 4: **12 routes** (`/login`, `/dashboard`, `/users`, `/products`, `/partners`, `/warehouses`, `/inventory`, **`/sales`**, **`/pos`**, `/_not-found`، +2 chiral chunks).

### Testing commands

```bash
# من جذر الـ monorepo
pnpm --filter @erp/backend test:e2e   # 61/61
pnpm --filter @erp/backend build       # nest build exit 0
pnpm --filter @erp/frontend build      # next build exit 0
```

النتائج المتوقعة بعد Phase 4:

- Backend `test:e2e`: **61 / 61 passing** (9 Phase 1 + 7 Phase 2 Products + 7 Phase 2 Partners + 7 Phase 3 Warehouses + 11 Phase 3 Inventory + **13 Phase 4 Sales (4B-1 + 4B-2 + 4B-3)** + **7 Phase 4B-3 POS**).
- Backend `build`: `nest build` exits 0.
- Frontend `build`: **12 routes** compile، يشمل `/sales` و `/pos` الجديدتين.

### Migration note (Phase 4 SQL migration)

```
20260907014059_phase4_sales_pos
```

تنشئ:

- Enum types `SalesInvoiceStatus { DRAFT, ISSUED, CANCELLED }`, `SalesInvoiceType { STANDARD, POS }`, `PaymentMethod { CASH, CARD, TRANSFER, OTHER }`.
- جداول `sales_invoices`, `sales_invoice_lines` بـ `@@unique([companyId, invoiceNumber])`, `@@index([companyId, status, deletedAt])`, `@@index([companyId, type, deletedAt])`.
- `Decimal @db.Decimal(18, 4)` على كل الـ money columns: `subtotal, vatTotal, discountTotal, total, paidAmount, quantity, unitPrice, discountAmount, vatRate, vatAmount, lineSubtotal, lineTotal`.
- `@@index([invoiceId])` على `sales_invoice_lines`, `@@index([companyId, productId])`.
- FK references على `companies`/`users`/`partners`/`products`/`warehouses`.

### Security / tenancy (unchanged from Phase 1 + 2 + 3)

- `companyId` **دائمًا** من `currentUser.companyId` (JWT)؛ لا يُقبل من body/query/path.
- كل `prisma.salesInvoice / prisma.salesInvoiceLine` query مفلتر بـ `companyId`.
- الفاتورة لا تعبر tenure الـ owning company (لا cross-company joins).
- لا `localStorage` / `sessionStorage`؛ access token في-memory داخل `frontend/lib/api.ts`.
- لا بيانات تجربة/وهمية — الـ seed يضيف فقط الصلاحيات ومستخدم admin. الـ e2e suite يبني ويترك الـ sales الخاصة به.
- **`AuditService.record`** is best-effort (لا تُكسر operations لو الـ audit fail). تستخدم `FORBIDDEN_KEYS` لاكتشاف أي dataset حساس تلقائيًا.
- Decimal end-to-end (`Prisma.Decimal` في الـ service، `string` في الـ JSON)، لا `Number` حسابي في الـ UI.

### Recommendation

**Phase 4 (Sales + POS) انتهت. Phase 5 يجب ألّا تبدأ بدون موافقة صريحة من المستخدم.** الـ scope inclusion pattern المتبع هنا (RBAC + append-only audit + `companyId` coupling + no mock data + لا خدمات مُستضافة) يجب أن يستمر في المرحلة القادمة، وأي مرحلة لاحقة يجب أن تكون **single-domain** فقط: إمّا Purchases, أو Accounting, أو Reports, أو ZATCA, أو HR — كل واحدة بمعماريتها الخاصة، ولا جمع في مرحلة واحدة دون مبرر صريح.

---

## Phase 5: Purchases Core

يقدّم Phase 5 الـ **core purchase‑invoice lifecycle** بدون أي Accounting / GL / AP / COGS / landed cost / supplier balance / payments / debit-credit notes / returns. كل شيء على نفس معمارية Phase 1–4: RBAC من JWT، Company scoping، append-only audit، server-side Decimal، لا mock business data، لا خدمات مُستضافة.

### Commit map (Phase 5)

| Sub‑phase | الوصف | Commit |
|-----------|-------|--------|
| 5A | Prisma: `PurchaseInvoiceStatus` enum، `StockMovementType += PURCHASE_IN`، جدولا `purchase_invoices` / `purchase_invoice_lines`، migration `20260907225332_phase5_purchases_core`، seed 6 permissions جديدة (`purchases.{read,create,update,delete,receive,cancel}` ← 52+6 = **58** total) | مدمج في commit الـ Phase 5 الـbackend |
| 5B | `PurchasesModule` + `PurchasesController` (7 endpoints RBAC‑gated) + `PurchasesService` (DRAFT/RECEIVED/CANCELLED + Supplier/Product validation + PurchaseInvoice number generator `pi‑YYYYMMDD‑NNNN` + receive flow: PRODUCT → StockLevel Upsert + PURCHASE_IN movement, SERVICE → pass‑through) + 6 DTOs + ربط `PurchasesModule` في `app.module.ts` | `ee5a705 feat(phase-5): implement purchases core` |
| 5C | 13 e2e جديدة في `backend/test/app.e2e-spec.ts`. **`74/74 passing`** (61 baseline + 13 Phase 5) | مدمج في الـ commit نفسه |
| 5D | هذا الـ commit: frontend purchases client + RTL page `/purchases` + dashboard nav المشتريات + تحديث README | `feat(phase-5): add purchases frontend + README final` |

### Status machine

| From → To | مسموح؟ | شرط |
|-----------|--------|------|
| DRAFT → RECEIVED | نعم | `POST /purchases/invoices/:id/receive`. PRODUCT lines → StockLevel Upsert + PURCHASE_IN movement؛ SERVICE → pass‑through |
| DRAFT → CANCELLED | نعم | `POST /purchases/invoices/:id/cancel`. سبب اختياري |
| DRAFT → DRAFT (update) | نعم | `PATCH /purchases/invoices/:id` يستبدل الـ lines ويعيد حساب totals |
| DRAFT → soft‑deleted | نعم | `DELETE /purchases/invoices/:id`، soft‑delete فقط |
| RECEIVED → * | ❌ | "Received purchase invoices require returns/debit‑note flow in a future phase." |
| CANCELLED → * | ❌ | "Invoice is already cancelled." |

### Supplier & Product rules (server‑enforced)

- `supplierId` يجب أن يكون `Partner` داخل نفس الـ company، `active=isActive=true`، `deletedAt=null`، و `type ∈ {SUPPLIER, BOTH}`. الـ `CUSTOMER`‑only مرفوض بـ **HTTP 400** ورسالة "not a supplier".
- كل line يستخدم `Product` داخل نفس الـ company، `active`، `not deleted`.
- PRODUCT line في create يقبل `warehouseId` (يُحفظ على الـ line). في **receive**، الـ PRODUCT line **يجب** أن يحمل `warehouseId` نشط وإلا يرفض.
- SERVICE line في create يقبل `warehouseId` كاختياري (يُهمل). في **receive**، SERVICE line **pass‑through كاملاً**: لا StockLevel update، لا StockMovement append.

### Calculations (server‑side Decimal only)

لكل line:

- `lineSubtotal = qty * unitCost`
- `lineDiscount` = بند الـ discount (موجب أو 0)
- `lineTaxable = max(lineSubtotal - lineDiscount, 0)`
- `vatAmount = (lineTaxable * vatRate / 100).toDecimalPlaces(4, ROUND_HALF_UP)`
- `lineTotal = lineTaxable + vatAmount`

على مستوى الـ header: `subtotal`, `vatTotal`, `discountTotal`, `total` كلها `@db.Decimal(18, 4)`، تُجمع server‑side فقط. الـ frontend لا يرسل totals في الـ body.

### Permissions (Phase 5 — extends Phase 1's 52‑permission matrix by 6)

| Key | الوصف | Phase |
|-----|-------|-------|
| `purchases.read`   | قائمة/قراءة فواتير الشراء | 5B |
| `purchases.create` | إنشاء مسودة فاتورة شراء | 5B |
| `purchases.update` | تعديل مسودة شراء | 5B |
| `purchases.delete` | حذف ناعم لمسودة شراء | 5B |
| `purchases.receive`| استلام فاتورة شراء (PRODUCT → StockLevel + PURCHASE_IN) | 5B |
| `purchases.cancel` | إلغاء DRAFT → CANCELLED | 5B |

> legacy `purchases.invoice.{read,create,approve}` لا تزال في الـ seed (idempotency)، لكن الـ RBAC الفعّال يستخدم الـ 6 keys الجديدة فقط (نفس النمط الـ Phase 4 sales.read/.../sales.issue/.../sales.cancel vs. sales.invoice.*). المجموع الكلي للـ permissions بعد seed الـ Phase 5: **58**.

### Endpoints (الـ 7 مسارات الجديدة لـ Phase 5)

كلها تحت `JwtAuthGuard + PermissionsGuard` وتستخدم `@CurrentUser` لاستخراج `companyId`:

| Method | Path | Permission | Body |
|--------|------|-----------|------|
| GET    | `/api/purchases/invoices` | `purchases.read` | query: `page, pageSize, search, status, supplierId` |
| GET    | `/api/purchases/invoices/:id` | `purchases.read` | — |
| POST   | `/api/purchases/invoices` | `purchases.create` | `{ supplierId?, purchaseDate?, dueDate?, notes?, lines: [...] }` (HttpCode 201) |
| PATCH  | `/api/purchases/invoices/:id` | `purchases.update` | DRAFT only؛ يستبدل الـ lines ويعيد حساب الـ totals في transaction واحد |
| DELETE | `/api/purchases/invoices/:id` | `purchases.delete` | DRAFT only؛ soft‑delete |
| POST   | `/api/purchases/invoices/:id/receive` | `purchases.receive`| DRAFT only؛ `{ purchaseDate?, notes? }`؛ PRODUCT → StockLevel upsert + PURCHASE_IN |
| POST   | `/api/purchases/invoices/:id/cancel` | `purchases.cancel` | DRAFT only؛ `{ reason?, notes? }` |

### Frontend routes (Phase 5D)

| Route | الوصف | Permission gate |
|-------|-------|----------------|
| `/dashboard` | أضيف زر **المشتريات** (indigo‑700) | `purchases.read` |
| `/purchases` | صفحة RTL: قائمة + فلتر (status/supplier/search) + form مسودة (إنشاء/تعديل) + actions لكل صف (edit / receive / cancel / delete) | `purchases.read`؛ الإجراءات مفصّلة على `purchases.{update,receive,cancel,delete}` |

Frontend additions (commit هذا الـ commit):
- `frontend/src/lib/api.ts`: types `PurchaseInvoiceStatus`, `PurchaseInvoiceLine`, `PurchaseInvoice`, `Create{Update,Receive,Cancel}*Input`، توسيع `StockMovementTypeKey += 'PURCHASE_IN'`, helpers `listPurchaseInvoices / getPurchaseInvoice / createPurchaseInvoice / updatePurchaseInvoice / deletePurchaseInvoice / receivePurchaseInvoice / cancelPurchaseInvoice` + convenience `listActiveSuppliers` (filter على `SUPPLIER|BOTH` على الـ client لتفادي 400s).
- `frontend/src/app/purchases/page.tsx`: صفحة RTL `dir="rtl" lang="ar"` بنفس نمط `sales/page.tsx`، مع تأمين:
  - الـ receive يعرض confirm قبل الـ API call، ويعرض backend error verbatim (مثل "Received purchase invoices require returns/debit-note flow in a future phase.").
  - الـ SERVICE line: لا warehouse select (مُعطّل)، لا Stock preview (الـ backend لا ينشئ StockLevel/StockMovement عليها).
  - لا `localStorage` / `sessionStorage`. Access token في-memory داخل `frontend/lib/api.ts`.
- `frontend/src/app/dashboard/page.tsx`: زر **المشتريات** (indigo‑700) قبل زر نقطة البيع، gated على `purchases.read`.

عدد routes بعد Phase 5: **13 routes** (`/login`, `/dashboard`, `/users`, `/products`, `/partners`, `/warehouses`, `/inventory`, `/sales`, `/pos`, **`/purchases`**, `/_not-found`، +2 chiral chunks).

### Migration note (Phase 5 SQL migration)

```
20260907225332_phase5_purchases_core
```

تنشئ:

- Enum type `PurchaseInvoiceStatus { DRAFT, RECEIVED, CANCELLED }`.
- `ALTER TYPE StockMovementType ADD VALUE 'PURCHASE_IN'` (PostgreSQL لا يدعم الـ remove؛ forward‑only).
- جدول `purchase_invoices`: `invoiceNumber` بحقل `pi-YYYYMMDD-NNNN` مولّد server‑side، `subtotal / vatTotal / discountTotal / total` كلها `Decimal @db.Decimal(18, 4)`، `@@unique([companyId, invoiceNumber])`, `@@index([companyId, status, deletedAt])`, `@@index([companyId, supplierId])`, `@@index([companyId, purchaseDate])`، FK references على `companies` (Cascade)، `users × 4` (audit fields createdById/updatedById/receivedById/cancelledById — `SetNull`)، `partners` (Restrict على supplierId).
- جدول `purchase_invoice_lines`: كل بند يحمل `quantity / unitCost / discountAmount / vatRate / vatAmount / lineSubtotal / lineTaxable / lineTotal` كـ `Decimal @db.Decimal(18, 4)` أو `@db.Decimal(5, 2)` (`vatRate`)، `@@index([invoiceId])`, `@@index([companyId, productId])`, FK على `purchase_invoices` (Cascade)، `products` (Restrict)، `warehouses` (`SetNull` — الـ SERVICE line قد لا يحتاج warehouse).
- 11 `AddForeignKey` بـ Cascade/SetNull/Restrict حسب الـ semantics.

### StockMovement extension (Phase 5)

`StockMovementType += PURCHASE_IN`. الـ receive flow يكتب حركة:

```text
{
  movementType: 'PURCHASE_IN',
  direction:    'IN',
  quantity:     lineQty,
  referenceType:'purchase_invoice',
  referenceId:  invoice.id,
  reason:       null,
  notes:        invoice.notes,
  movementDate: invoice.purchaseDate ?? now,
}
```

**SERVICE lines → لا StockLevel update، لا StockMovement**. الـ e2e test #7 يفرض `sameInvoice.length === 1` على الـ StockMovement للتحقق من الـ pass‑through.

### الـ e2e Suite بعد Phase 5

- Backend `test:e2e`: **74 / 74 passing** (9 Phase 1 + 7 Phase 2 Products + 7 Phase 2 Partners + 7 Phase 3 Warehouses + 11 Phase 3 Inventory + 13 Phase 4 Sales + 7 Phase 4B‑3 POS + **13 Phase 5 Purchases**).
  - 13 tests Phase 5 مغطّية:
    1. `/api/purchases/invoices without token => 401`.
    2. list مع admin token => 200 + page/pageSize shape.
    3. SERVICE‑only line => totals 400/60/460 (subtotal/discount/vat/total).
    4. PRODUCT + BOTH supplier => 400/60/460.
    5. CUSTOMER‑only supplier => 400 "not a supplier".
    6. PATCH مع discount recompute => 350/52.5/402.5.
    7. receive mixed SERVICE+PRODUCT draft => RECEIVED + receivedAt + **StockLevel productReceiveQty=7** + **exactly 1 PURCHASE_IN movement** بـ `referenceId=invoice.id` (SERVICE pass‑through).
    8. re‑receive على RECEIVED => 400 "cannot‑receive".
    9. PATCH على RECEIVED => 409 "cannot‑edit‑RECEIVED".
    10. cancel DRAFT => 200 + CANCELLED.
    11. re‑cancel على CANCELLED => 400 "already‑cancelled".
    12. RBAC list works on admin token.
    13. Random unique codes via `${Date.now().toString(36)}` لتجنّب الـ collisions بين runs.

- Backend `build`: `nest build` exits 0.
- Frontend `build`: `next build` exits 0 مع 13 routes static (+ `/purchases`).

### Hard prohibitions honored (Phase 5)

ما هو **ليس** في Phase 5 ولا في الـ codebase ولا في الـ migrations ولا في الـ seed:

- Accounting / General Ledger / Journal entries.
- Accounts Payable / supplier balances / Payments / payment gateway.
- Reports / ZATCA e‑invoicing / HR / Payroll / SaaS billing.
- Sales returns / Purchase returns / Debit notes / Credit notes.
- Cost layers / FIFO / LIFO / Weighted average costing / Landed cost.
- Barcode hardware / Receipt printer / Cash drawer / Shift management.
- أي mock / fake / demo business data — الـ seed يضيف فقط الـ admin user + الـ 58 permissions. كل الـ suppliers/products/warehouses/invoices في الـ e2e تُبنى داخل نفس الـ test.
- **لا Cloudflare / Workers / D1 / KV / R2 / Wrangler / OAuth / Skills** — المشروع Docker Compose محلي.

### Security / tenancy (unchanged from Phase 1 + 2 + 3 + 4)

- `companyId` **دائمًا** من `currentUser.companyId` (JWT)؛ لا يُقبل من body/query/path.
- كل `prisma.purchaseInvoice / prisma.purchaseInvoiceLine` query مفلتر بـ `companyId`. لا cross‑company joins.
- لا `localStorage` / `sessionStorage`؛ access token في-memory داخل `frontend/lib/api.ts`.
- لا بيانات تجربة/وهمية — الـ seed يضيف فقط الصلاحيات ومستخدم admin. الـ e2e يبني ويترك الـ fixtures الخاصة به.
- **`AuditService.record`** is best‑effort (لا يُكسر الـ operations لو الـ audit fail). يستخدم `FORBIDDEN_KEYS` لاكتشاف أي dataset حساس تلقائيًا. Phase 5 events: `purchases.invoice.{created,updated,deleted,received,cancelled}`.
- Decimal end‑to‑end (`Prisma.Decimal` في الـ service، `string` في الـ JSON)، لا `Number` حسابي في الـ UI.

### Recommendation

**Phase 5 (Purchases Core) انتهت.** Phase 6 يجب ألّا تبدأ بدون موافقة صريحة من المستخدم. الـ scope inclusion pattern يجب أن يستمر (RBAC + append-only audit + `companyId` coupling + no mock data + no hosted services)، وأي مرحلة لاحقة يجب أن تكون **single-domain** فقط: إمّا **Accounting/GL/AP**، أو **Reports/ZATCA**، أو **HR/Payroll**، أو **Sales/Purchase Returns + Debit/Credit notes**، إلخ — كل واحدة بمعماريتها الخاصة، ولا جمع في مرحلة واحدة دون مبرر صريح.

> **لا تبدأ Phase 6 تلقائياً.** انتظر تعليمات صريحة من المستخدم.

## Phase 6: Accounting Core

**نطاق صارم:** Chart of Accounts + Manual Journal Entries فقط. لا تقارير مالية، لا قيود آلية من المبيعات/المشتريات، لا AR/AP، لا دفعات، لا ZATCA/VAT، لا COGS، لا أصول ثابتة، لا payroll، لا SaaS billing في هذه المرحلة.

### Commit map (Phase 6)

- **Phase 6A** — `d57b80e feat(phase-6): accounting core schema + migration + permissions`
  Prisma schema additions (`Account`, `JournalEntry`, `JournalEntryLine`)،
  partial unique index على `(companyId, code) WHERE deletedAt IS NULL`،
  partial unique على `(companyId, entryNumber)`، FK Restrict من
  `JournalEntryLine` إلى `Account` (debited/credited accounts),
  Audit events جديدة، 7 صلاحيات RBAC إضافية مُلحقة بـ seed.

- **Phase 6B** — `e1c7a5e feat(phase-6): implement accounting core`
  `AccountingController` (11 endpoint تحت `/api/accounting/accounts` +
  `/api/accounting/journal`) + `AccountingService` مع double-entry validation
  (≥2 lines, debit XOR credit per line, totalDebit == totalCredit عبر
  `Prisma.Decimal` server-side لا `Number`)، DRAFT-only mutations على
  journal entries، 409 على duplicate code في نفس الشركة وعلى
  accounts referenced by posted lines، soft-delete (`deletedAt`).

- **Phase 6C** — `362a430 feat(phase-6): accounting backend e2e smoke tests`
  19 e2e اختبارات (A1–G1) ملحقة بـ `backend/test/app.e2e-spec.ts`.
  إجمالي suite الآن 99/99 passing. Real-bug fixes: `getAccount` filter
  لـ `deletedAt`، و class-validator decorators على `UpdateJournalEntryDto`.

- **Phase 6D** — `feat(phase-6): accounting frontend + README final` (هذا الـ commit)
  صفحة `/accounting` في الـ frontend، تحديث الـ `api.ts`،
  رابط `/accounting` من `/dashboard` (مُقيَّد بـ `accounting.read`).

### Scope of Phase 6

**مشمول:**

1. **Chart of Accounts CRUD** (`/api/accounting/accounts`)
   - List (paginated + search by code/name + filter by type + includeInactive flag + rootsOnly flag)
   - Get (single account with `parent` + `children` relations)
   - Create (code 1..32 chars من `[A-Za-z0-9._-]`، unique per company،
     type×normalBalance invariant: ASSET/EXPENSE → DEBIT،
     LIABILITY/EQUITY/REVENUE → CREDIT)
   - Update (no code change بعد POSTED lines — FK Restrict في الـ DB)
   - Delete (soft-delete: يَضبط `deletedAt` و `isActive=false`؛ يرجع 409 لو في posted lines مرتبطة)

2. **Manual Journal Entries** (`/api/accounting/journal`)
   - List (paginated + search by entryNumber/description/notes + status filter)
   - Get (with nested `lines[]` و nested `debitAccount`/`creditAccount` refs)
   - Create (DRAFT؛ entryNumber `je-YYYYMMDD-NNNN` مع 3-attempt race retry)
   - Update DRAFT (notes/reference/description/entryDate؛ line replace إذا `lines` تم تمريرها)
   - Post (DRAFT → POSTED؛ `postedAt` يُكتب؛ postedBy tracked)
   - Cancel (DRAFT → CANCELLED؛ POSTED → 409 "reverse entries out of scope"؛
     CANCELLED → 409 "already cancelled")

**ممنوع عمداً في Phase 6:**

- لا GET aggregations → **لا** Trial Balance / Balance Sheet / P&L / General Ledger reports.
- لا قيود آلية من `Sales / Purchases` (لا AR من فواتير المبيعات، لا AP من فواتير المشتريات، لا COGS، لا inventory valuation posting، لا landed cost).
- لا **VAT / ZATCA** integration.
- لا **payments**, **bank reconciliation**, **cash management**.
- لا **AR/AP ledgers** ولا customer/supplier statements.
- لا **cost accounting**, **fixed assets**, **payroll**, **SaaS billing**.
- لا **reverse entries / period locking** (يلزم manually delete DRAFT أو قبول الـ 409 على POSTED).
- لا default seed/demo chart of accounts — كل شركة تبني دليلها عبر الـ UI.
- لا **deployment** ولا **Cloudflare/Workers/Wrangler** ولا أي hosted services.

### Database / Prisma Changes (Phase 6A SQL migration)

Migration file: `backend/prisma/migrations/<timestamp>_phase6_accounting_core/migration.sql`

- **Account** table — `id, companyId, code, name, nameAr, type (ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE), normalBalance (DEBIT|CREDIT), parentId?, isActive, deletedAt?, createdById?, updatedById?, timestamps`.
  - `@@unique([companyId, code]) WHERE deletedAt IS NULL` (partial unique — reactivation of deleted code ممكن).
- **JournalEntry** — `id, companyId, entryNumber, status (DRAFT|POSTED|CANCELLED), entryDate, description?, reference?, totalDebit, totalCredit, notes?, postedAt?, cancelledAt?, createdById?, updatedById?, postedById?, cancelledById?, timestamps`.
  - `@@unique([companyId, entryNumber])` (full unique؛ race retry في الـ service).
- **JournalEntryLine** — `id, companyId, entryId, debitAccountId?, creditAccountId?, description?, debit, credit, timestamps`.
  - FK Restrict من `debitAccountId`/`creditAccountId` إلى `Account.id`.
  - Constraint: لا يمكن أن يكون الـ debit و الـ credit > 0 في نفس الـ line.

كل حقول الـ Decimal بـ `@db.Decimal(18, 4)` (money-scale 4 fractional digits).
`AuditLog` جدول موسَّع بـ events جديدة:
`accounting.account.{created,updated,deleted}`، `accounting.journal.{created,updated,posted,cancelled}`.
JWT-only `companyId`: `WHERE companyId = me.companyId` على كل query، ولا يقبل `companyId` في الـ body.

### Permissions Added in Phase 6

مُلحقة بـ Phase 1's 52-permission matrix (التي مُلحق بها 6 Phase 5 purchases → إجمالي 58 سابقاً).
الآن 7 إضافية → **إجمالي 65 permission**:

| Key | Endpoint |
|---|---|
| `accounting.read` | GET `/api/accounting/accounts` و `/journal` |
| `accounting.accounts.create` | POST `/api/accounting/accounts` |
| `accounting.accounts.update` | PATCH `/api/accounting/accounts/:id` |
| `accounting.accounts.delete` | DELETE `/api/accounting/accounts/:id` |
| `accounting.journal.update` | POST و PATCH `/api/accounting/journal` و PATCH `/journal/:id` |
| `accounting.journal.post` | POST `/api/accounting/journal/:id/post` |
| `accounting.journal.cancel` | POST `/api/accounting/journal/:id/cancel` |

ملاحظة: لا يوجد `accounting.journal.create` منفصل — الـ controller يستخدم
`accounting.journal.update` لكل من POST و PATCH على `/api/accounting/journal`
(نفس الـ permission). `accounting.accounts.create` مش متطلب لكتابة journal
lines منطقياً — السطور تستخدم accounts موجودة فقط وفي نفس الشركة.

### Endpoints (الـ 11 مسار Phase 6)

```
GET    /api/accounting/accounts             — accounting.read
GET    /api/accounting/accounts/:id         — accounting.read
POST   /api/accounting/accounts             — accounting.accounts.create
PATCH  /api/accounting/accounts/:id         — accounting.accounts.update
DELETE /api/accounting/accounts/:id         — accounting.accounts.delete

GET    /api/accounting/journal              — accounting.read
GET    /api/accounting/journal/:id          — accounting.read
POST   /api/accounting/journal              — accounting.journal.update
PATCH  /api/accounting/journal/:id          — accounting.journal.update
POST   /api/accounting/journal/:id/post     — accounting.journal.post
POST   /api/accounting/journal/:id/cancel   — accounting.journal.cancel
```

كل request body و response shape مُعرَّف في `backend/src/accounting/**`؛ جميع الـ
decimal fields تُسلسل كـ strings. `UpdateAccountDto.parentId?: null` يَعني
"إزالة الـ parent" (top-level). `UpdateJournalEntryDto.lines` كامل الـ replace
(الجانب يحذف السطور القديمة ويَكتب الجديدة في transaction).

### Frontend routes (Phase 6D)

- **`/accounting`** (`frontend/src/app/accounting/page.tsx`) — client component،
  Arabic/RTL layouts، تقسيم ضمن two-column grid: يسار Chart of Accounts، يمين
  Manual Journal Entries.
  - Account form: code (مُعَطَّل في edit)، name، nameAr، type،
    normalBalance (مُشتق تلقائياً من type ويُعرض read-only envelope)،
    optional parent، isActive checkbox.
  - Account list: paginated، filter by type، search by code/name، row actions
    (Edit / Delete soft-delete، معطل لو الحساب محذوف).
  - Journal form: entryDate, reference, description, notes،
    خطوط ديناميكية (≥2 إلزامي)، per-line: account + description + debit XOR credit،
    live total computed في الـ UI + balanced check (الـ server يُطبق نفس الـ invariant).
  - Journal list: paginated، search by entryNumber/description/notes،
    filter by status، row actions (Edit / Post / Cancel — معطلة بشكل صحيح
    للحالة غير المسودة).
  - محمي بـ `accounting.read`؛ بدونها redirect إلى `/dashboard`.
  - كل أزرار الإجراءات معطلة (لا مخفية) إذا الـ permission غير موجود — الـ
    المستخدم يرى الـ UX لكنه لا يستطيع التشغيل.

- **`/dashboard`** — رابط جديد `/accounting` يظهر فقط لو
  `user.permissions.includes('accounting.read')`.

### Testing commands

```bash
# Backend build + e2e (تأكيد لا regression في 99/99 السابقة)
cd /home/user/webapp/erp-system
pnpm --filter @erp/backend build                       # exit 0
pnpm --filter @erp/backend test:e2e                    # 99 passed / 99 total
                                                         # 74 baseline + 19 Phase 6 = 93 + 6 Phase 4 = 99
                                                         # (19 labelled A1..G1)

# Frontend build (تأكيد /accounting route compiles + types pass)
pnpm --filter @erp/frontend build                      # exit 0
```

اختبارات Phase 6 الـ 19 (`e2e`, `backend/test/app.e2e-spec.ts`):

- **A1–A2** — List accounts: 401 without token؛ 200 + paginated shape كأدمن.
- **B1–B5** — Create accounts: ASSET/DEBIT، LIABILITY/CREDIT، EQUITY/CREDIT،
  duplicate code → 409، invalid code chars → 400.
- **C1–C4** — Account lifecycle: GET with nested parent/children، PATCH، soft-delete،
  GET after soft-delete → 404 (الـ `deletedAt: null` invariant).
- **D1–D2** — List journal entries: 401 / 200 + paginated shape.
- **E1–E4** — Create journal: <2 lines → 400، both debit+credit → 400،
  unbalanced → 400، balanced ≥2 → 201 DRAFT.
- **F1–F7** — Journal lifecycle: GET → PATCH DRAFT → POST /post → POST /post
  على POSTED → 409 → POST /cancel على POSTED → 409 ("reverse out of scope")
  → POST /cancel على DRAFT → CANCELLED → POST /cancel على CANCELLED → 409.
- **G1** — `status=DRAFT` filter يُرجع الـ non-POSTED set (DRAFT + CANCELLED).

### Real bugs fixed by Phase 6C e2e

1. **`accounting.service.getAccount`** كان يَنْسى فلتر `deletedAt: null` —
   soft-delete-then-GET كان يَرُدّ 200 بدل 404. الـ fix: إضافة
   `deletedAt: null` للـ where clause. C4 اكتشفها.
2. **`UpdateJournalEntryDto`** ما كان عنده `class-validator` decorators —
   الـ global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true,
   transform: true })` كان يَرفض كل property كـ `"property X should not exist"`.
   الـ fix: `IsOptional`/`IsString`/`MaxLength`/`IsISO8601`/`IsArray`/
   `ArrayMinSize(2)`/`ValidateNested({ each: true })`/`@Type(() => …)` على
   كل الحقول. F2 اكتشفها.

### Hard prohibitions honored (Phase 6)

- لا Frontend extra features (لا تقارير، لا charts، لا graph viz).
- لا تعديل Auth/RBAC العام. كل الـ 7 permissions الجديدة مضافة فقط لـ
  seed matrix، و `@RequirePermissions` decorator يَستخدم نفس الـ guard chain.
- لا `localStorage` / `sessionStorage` — access token في-memory داخل `frontend/lib/api.ts` فقط،
  refresh cookie HttpOnly بـ `credentials: 'include'`.
- لا بيانات تجربة/وهمية — seed seed Phase 1/5 يضيف permissions + admin only.
  الـ e2e يبني fixturesه الخاصة.
- لا deployment. لا Cloudflare/Workers/Wrangler/OAuth/external auth.
- لا `cf-byok-deploy`, `designer-handoff`, `gsk-hosted-deploy`, `gsk-hosted-identity`
  skills مُشغَّلة أو مُستدعاة.
- لا ZATCA / VAT reports / VAT auto-posting.
- لا AR/AP ledgers / payments / reconciliation / cost accounting / fixed assets /
  payroll / SaaS billing / reverse entries / period locking.

### Security / tenancy (unchanged from Phase 1+2+3+4+5)

- `companyId` من `JWT.currentUser.companyId` فقط — **لا** يقبل من الـ body.
- `@RequirePermissions` + `JwtAuthGuard` + `PermissionsGuard` على كل controller.
- `@UseGuards(JwtAuthGuard, PermissionsGuard)` global على `AccountingController`.
- Soft-delete عبر `deletedAt`؛ لا hard-delete؛ unique constraint excludes deleted.
- Audit events تكتب **outside** Prisma transactions (best-effort؛ fail-safe) لكل mutation.
- `Prisma.Decimal` arithmetic فقط في الـ service؛ `Number` ممنوع في الـ math paths.
- لا `companyId` من الـ form body ولا من الـ URL.
- لا tokens في `localStorage` / `sessionStorage`.

### Recommendation

**Phase 6 (Accounting Core) UI انتهت.** Phase 6 frontend فقط يَستخدم الـ APIs؛ كل
الأرقام strings بصرف Decimal @db.Decimal(18,4) ولا Number حسابي في الـ UI. أي
مرحلة لاحقة يجب أن تَكون **single-domain** فقط:
- إمّا **Reports / ZATCA / VAT** (read-only aggregations على الـ journal lines).
- أو **AR / AP ledgers** (customer/supplier outstanding من الـ journal entries).
- أو **Bank Reconciliation / Payments** (cash management).
- أو **Fixed Assets / Depreciation**.
- أو **HR / Payroll** (employees + monthly payroll cycle).
- أو **Returned invoices / Debit-Credit notes** (Sales/Purchase returns).
- أو **Period locking + Reverse entries** (rollback for posted journals).

ولا جمع في مرحلة واحدة دون مبرر صريح. ولا deployment بأمر المستودع هذا — فقط
local Docker Compose على جهاز المستخدم.

---

## Phase 7: Reports (Backend + Frontend, read-only aggregations)

**نطاق صارم:** 6 endpoints تقارير مجمّعة read-only فقط عبر `/api/reports/*`
بصلاحية `reports.read`. لا Trial Balance، لا Balance Sheet، لا P&L، لا
Cash Flow، لا AR/AP aging، لا VAT/ZATCA، لا payments/reconciliation، لا
automated posting من المبيعات/المشتريات، لا PDF/Excel export، لا charts
ثقيلة في الـ frontend، لا mocking. كل التقارير تستخدم `Prisma`
aggregations server-side، Decimal يخرج strings للنهاية، و`companyId` يجي
من JWT فقط.

### Commit map (Phase 7)

- **Phase 7B-1** — `bdc6e5b feat(phase-7): add reports backend skeleton`
  `backend/src/reports/reports.module.ts` + `reports.controller.ts` +
  `reports.service.ts` + `dto/report-query.dto.ts`. 6 endpoints
  مسجّلة (`JwtAuthGuard` + `PermissionsGuard` + `@RequirePermissions('reports.read')`)
  لكن 6 methods كلها placeholder يَرجعان `status: 'PLANNED'` و`data: null`.
  لا Prisma injections؛ schema/DTO/permissions لا تُلمس في هذه الخطوة.

- **Phase 7B-2** — `9ba9cf0 feat(phase-7): add sales and POS report summaries`
  `salesSummary` و`posSummary` تتحول إلى `READY`:
  - sales: aggregate على `SalesInvoice` مفروض `type=STANDARD`,
    `deletedAt:null`، فلتر status (افتراضي ISSUED، CANCELLED مستبعد من
    headline إضافي)، فلتر `customerId`، فلتر نطاق تاريخ على `issueDate`.
  - pos: نفس البناء لكن `type=POS`، زائد `paymentMethods` breakdown
    عبر `groupBy({ by: ['paymentMethod'] })`، زائد فلتر `paymentMethod`.
  - كل Decimal مخرَج كـ string (`.toFixed(4)`).

- **Phase 7B-3/4 (reconciled in one commit)** — `00bf328 feat(phase-7): add purchases inventory report summaries`
  `purchasesSummary` على `PurchaseInvoice` (default status=RECEIVED،
  CANCELLED مستبعد من headline)، زائد `inventorySummary` على
  `StockLevel` (levelCount + totalQuantity + totalReservedQuantity +
  top 200 levels مع join على Product/Warehouse لعرض الأسماء)، زائد
  `stockMovementsSummary` على `StockMovement` (movementCount +
  totalQuantityIn + totalQuantityOut + byType + byDirection + top 200
  recent movements، breakdown على `direction` وعلى `movementType`).
  ترتيب IN/OUT وbyType deterministic (sort by count desc ثم enum asc).

- **Phase 7B-5** — `ce425be feat(phase-7): add accounting report summary`
  `accountingSummary` على `JournalEntry` + `JournalEntryLine`:
  entryCount, lineCount, totalDebit, totalCredit, balanceDifference
  عبر `Prisma.Decimal.minus` (لا Number)، `byStatus` breakdown،
  `recentEntries` top 20. default status=POSTED؛ `DRAFT` و`CANCELLED`
  مستبعدان من headline افتراضياً (HEADLINE_JOURNAL_EXCLUSION).

- **Phase 7B-6** — `bd4169b test(phase-7): add reports backend e2e smoke tests`
  ملف جديد `backend/test/reports.e2e-spec.ts` (10 e2e اختبارات):
  - 401 بدون token لكل الـ 6 routes.
  - 403 بـ cashier role بدون `reports.read` لكل الـ 6 routes (`beforeAll`
    يبني cashier_e2e role + cashier-e2e@example.sa فيعتمد نفسه).
  - 200 + READY + body shape لكل الـ 6 routes بـ admin token.
  - Per-endpoint shape assertions: sales (headline + statusFilter +
    currency)، pos (نفس + paymentMethods[])، purchases (نفس الـ shape)，
    inventory (levelCount + totalQuantity + levels[*])، stock-movements
    (movementCount + byType + byDirection + movements[*])، accounting
    (totalDebit/Credit + byStatus + recentEntries).
  - Query filter smoke عبر `Promise.all` يطلق 6 filtered requests
    متوازية (fromDate/toDate/status/paymentMethod/productId/warehouseId).
  إجمالي suite الآن 109/109 passing في 23.047 s (2 suites: app.e2e-spec.ts
  + reports.e2e-spec.ts). لا production code touched في هذه الخطوة.

- **Phase 7C** — `55c9547 feat(phase-7): add reports frontend page` (هذا الـ README commit لاحقة)
  صفحة `/reports` جديدة في الـ frontend Next.js 14 مع `use client`،
  RTL Arabic، 6 cards (sales / POS / purchases / inventory / stock-movements
  / accounting)، filter form (fromDate, toDate, status, paymentMethod,
  productId, warehouseId) يحفظ state محلي فقط ولا يَلمس
  localStorage/sessionStorage، loading/error/empty states per section،
  refresh-all button، "تحديث الكل" apology-free. Money fields يَبقَو
  strings بصرف Decimal؛ `Number()` يُستخدم فقط في display formatting
  عبر `toLocaleString` (لا math).
  رابط `/reports` من `/dashboard` (مُقيَّد بـ `reports.read` بنفس
  pattern الـ existing cluster).

- **Phase 7D-1** — read-only verification (لا commit). bash
  `pnpm --filter @erp/backend build` → exit 0؛
  `pnpm --filter @erp/backend test:e2e` → 109/109 passing في 21.931 s؛
  `pnpm --filter @erp/frontend build` → exit 0 مع 13 routes في الـ
  output (شامل `/reports` 5.39 kB / 105 kB First Load JS، prerendered
  كـ static).

- **Phase 7D-2** — هذا الـ commit `docs(phase-7): update README for phase 7 final`.
  لا backend، لا frontend، لا schema/migration/seed، لا RBAC،
  لا deployment — تحديث README فقط.

### Scope of Phase 7

**ما تم بناؤه:**
- 6 endpoints `/api/reports/{sales-summary,pos-summary,purchases-summary,inventory-summary,stock-movements-summary,accounting-summary}`، كل واحد
  - مقيَّد بـ `JwtAuthGuard` + `PermissionsGuard` + `@RequirePermissions('reports.read')`.
  - يأخذ `@Query() q: ReportQueryDto` (`fromDate`, `toDate`, `status`, `type`,
    `customerId`, `supplierId`, `productId`, `warehouseId`, `paymentMethod` — كلها optional).
  - مكافأة tenant scope: `companyId` فقط من JWT عبر `@CurrentUser() me`.
  - يَرجع `ReadyResponse<T>` بـ `{ report, status: 'READY', companyId, filters, generatedAt, data }`.
- Prisma aggregations لا `Number()` arithmetic:
  - `aggregate({ _count, _sum })` لـ headline totals.
  - `groupBy({ by: ['paymentMethod'] })` للـ POS breakdown.
  - `groupBy({ by: ['status'] })` للـ accounting `byStatus`.
  - `groupBy({ by: ['movementType'] })` + 2 `aggregate`s (IN/OUT) لـ stock-movements.
  - `findMany({ take: 200 })` لـ detail rows (inventory levels + recent movements + 20 recent journal entries).
- Decimal-as-string ends-to-end: `.toFixed(4)` للـ non-nullable،
  `.toString()` للـ nullable (`paidAmount`)، مع تمييز null (omit key)
  عبر helper `decimalToNullableString`.
- `balanceDifference` عبر `Prisma.Decimal.minus(...)` — لا Number.
- Phase 7 frontend: `/reports` صفحة واحدة، 6 sections، cards + tables فقط
  (لا charts)، filter form، RTL Arabic، refresh-all.
- 10 e2e tests (Phase 7B-6): 401/403/200/shape/per-endpoint/query-filter smoke.

**ممنوع عمداً في Phase 7:**
- لا Trial Balance، لا Balance Sheet، لا P&L، لا Cash Flow.
- لا AR/AP aging (لا customers/suppliers outstanding ledger).
- لا VAT / ZATCA reports ولا VAT auto-posting من المبيعات/المشتريات.
- لا payments / bank reconciliation / cash management.
- لا automated journal posting (لا `event-driven` GL updates).
- لا PDF / Excel export.
- لا charts / dashboards ثقيلة (Chart.js / recharts / D3).
- لا sales/purchase returns / debit-credit notes.
- لا period locking / reverse entries.
- لا period-close workflow.

### Database / Prisma Changes (Phase 7)

**لا schema/migration/seed changes** في Phase 7. كل الـ 6 endpoints
تقرأ من الـ models الموجودة (SalesInvoice + SalesInvoiceLine،
PurchaseInvoice + PurchaseInvoiceLine، StockLevel، StockMovement،
JournalEntry + JournalEntryLine) عبر الـ aggregations و joins
الموصوفة أعلاه. لا partial unique indexes جديدة. لا FK changes.

### Permissions Added in Phase 7

**لا permissions جديدة** في Phase 7. الصلاحية `reports.read` الموجودة
من Phase 7A-2 (planning) هي المُستخدمة. الـ service-level guard
سيرفض أي user بدون `reports.read` بـ 403 Forbidden.

### Endpoints (Phase 7 الـ 6)

| Method | Path | Source model | Permission |
|--------|------|--------------|------------|
| GET | `/api/reports/sales-summary` | `SalesInvoice WHERE type=STANDARD` | `reports.read` |
| GET | `/api/reports/pos-summary` | `SalesInvoice WHERE type=POS` | `reports.read` |
| GET | `/api/reports/purchases-summary` | `PurchaseInvoice` | `reports.read` |
| GET | `/api/reports/inventory-summary` | `StockLevel` | `reports.read` |
| GET | `/api/reports/stock-movements-summary` | `StockMovement` | `reports.read` |
| GET | `/api/reports/accounting-summary` | `JournalEntry + JournalEntryLine` | `reports.read` |

ملاحظات عامّة:
- كل endpoint يَقبل نفس الـ `ReportQueryDto` (loose، لا IsEnum()).
- `fromDate`/`toDate` يَترجما إلى `gte/lte` UTC inclusive
  (`00:00:00.000Z` → `23:59:59.999Z`).
- `status`/`paymentMethod` ينظفان server-side عبر `resolve*()` helpers.
- CANCELLED مستبعد من headline totals افتراضياً لكل من Sales/POS
  (`HEADLINE_STATUS_EXCLUSION`) والمشتريات (`HEADLINE_PURCHASE_EXCLUSION`)
  والقيود (HEADLINE_JOURNAL_EXCLUSION = DRAFT + CANCELLED). لو الـ caller
  يَمُر `status=CANCELLED` صراحةً، الـ aggregate يصير audit count not revenue.
- POS يَرجع `paymentMethods[]` إلا عند تمرير `paymentMethod=...` (single-bucket).
- Accounting `byStatus` يَستثني الـ explicit status filter (يعكس كل الـ statuses
  داخل الـ date scope موجودة).

### Frontend routes (Phase 7C + Phase 7D-2 verification)

```
┌ ○ /_not-found                          870 B          88.2 kB
├ ○ /accounting                          6.35 kB         106 kB
├ ○ /dashboard                           1.97 kB         101 kB
├ ○ /inventory                           3.65 kB         103 kB
├ ○ /login                               2.22 kB        92.1 kB
├ ○ /partners                            3.33 kB         103 kB
├ ○ /pos                                 4.53 kB         104 kB
├ ○ /products                            3.11 kB         103 kB
├ ○ /purchases                           4.7 kB          104 kB
├ ○ /reports                             5.39 kB         105 kB   ← Phase 7C addition
├ ○ /sales                               4.72 kB         104 kB
├ ○ /users                               1.73 kB         101 kB
└ ○ /warehouses                          2.81 kB         102 kB
+ First Load JS shared by all            87.3 kB
```

### Tests (Phase 7B-6 + Phase 7D-1 verification)

`backend/test/reports.e2e-spec.ts` (Phase 7B-6) — 10 اختبارات جديدة:

1. 401 without Authorization header → كل الـ 6 routes.
2. 403 with cashier role (`cashier_e2e`) without `reports.read` → كل الـ 6 routes (`beforeAll`
   يبني role + user فيعتمد نفسه).
3. 200 + `body.status === 'READY'` + body shape → كل الـ 6 routes.
4a. sales-shape: `data.{invoiceCount, subtotal, vatTotal, discountTotal, total, currency, statusFilter, typeFilter}`.
4b. pos-shape: sales-shape + `data.paymentMethods[]` (`method`, `count`, `total`).
4c. purchases-shape: `data.{invoiceCount, subtotal, vatTotal, discountTotal, total, currency, statusFilter, dateField}`.
4d. inventory-shape: `data.{levelCount, totalQuantity, totalReservedQuantity, levels[]}` + per-level `productId/warehouseId/quantity`.
4e. stock-movements-shape: `data.{movementCount, totalQuantityIn, totalQuantityOut, byType[], byDirection[], movements[]}`
   + per-movement `{type, direction, quantity}`.
4f. accounting-shape: `data.{entryCount, lineCount, totalDebit, totalCredit, balanceDifference, byStatus[], recentEntries[]}`
   + recent-entry `id, status`.
5. Query filter smoke: 6 parallel `Promise.all` requests (`fromDate/toDate/status/paymentMethod/...`) → 200.

إجمالي backend e2e الآن: **109/109 passing** في ~22 s (2 suites):
app.e2e-spec.ts (~17 s) + reports.e2e-spec.ts (~5 s).

### Security / tenancy (unchanged from Phase 1+2+3+4+5+6)

- `companyId` من `@CurrentUser()` فقط — **لا** يقبل من الـ query ولا من الـ body
  على أيٍّ من الـ 6 endpoints.
- `@UseGuards(JwtAuthGuard, PermissionsGuard)` global على `ReportsController`.
- كل الـ 6 methods مقيَّدة بـ `@RequirePermissions('reports.read')`.
- Soft-delete (`deletedAt: null`) مضاف صراحة للـ where على
  SalesInvoice/PurchaseInvoice؛ StockLevel وStockMovement وJournalEntry
  لا `deletedAt` أصلاً (append-only or lifetime-row).
- `Prisma.Decimal` arithmetic في الـ service؛ `Number()` في الـ paths الحسابية **ممنوع**.
- لا `companyId` من الـ URL أو الـ form body.
- لا tokens في `localStorage` / `sessionStorage` (frontend token
  in-memory فقط، refresh cookie HttpOnly لا يُلمس).

### Hard prohibitions honored (Phase 7)

- لا skills مُشغَّلة أو مُستدعاة في الـ loop الكامل (7A → 7D-2).
- لا cloudflare / workers / wrangler / OAuth / external auth / Google / social login.
- لا PDF / Excel / SVG / canvas charts / recharts / Chart.js / D3 في
  الـ frontend.
- لا network calls إلى third-party APIs باستثناء الـ backend Local Docker.
- لا in-memory caching في الـ backend؛ responses تُحسب fresh كل request
  من Postgres.
- لا mock / demo / fake data في الـ backend ولا الـ frontend.

### Recommendation

**Phase 7 (Reports) انتهت** على مستوى الـ backend (Phase 7B-1 → 7B-6)
والـ frontend (Phase 7C) والـ verification (Phase 7D-1) والـ README
final (Phase 7D-2). كل التقارير الستة تُرجع `status: 'READY'` بصرف
`Prisma.Decimal` aggregations server-side، ولا Number حسابي في أي
math path. أي مرحلة لاحقة يجب أن تَكون **single-domain** فقط:

- إمّا **AR / AP ledgers** (customer/supplier outstanding من الـ journal entries).
- أو **Bank Reconciliation / Payments** (cash + bank matching).
- أو **VAT / ZATCA** filings (لو Saudi compliance صار أولوية؛ الآن خارج النطاق).
- أو **Fixed Assets / Depreciation**.
- أو **HR / Payroll** (employees + monthly payroll cycle).
- أو **Sales / Purchase Returns + Debit-Credit notes**.
- أو **Period locking + Reverse entries** (rollback for posted journals).
- أو **PDF / Excel export layer** للـ reports الحالية (Frontend-only).
- أو **Charts / dashboards layer** للـ reports الحالية (Frontend-only).

ولا جمع في مرحلة واحدة دون مبرر صريح. ولا deployment بأمر المستودع
هذا — فقط local Docker Compose على جهاز المستخدم. ولا hosted
deploy / hosted identity في هذه المرحلة.
