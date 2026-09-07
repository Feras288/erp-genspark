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

**آخر تحديث:** إغلاق المرحلة 1 — `9/9 e2e tests passing`، builds نظيفة للـ backend و frontend، git commit موثَّق في record الـ repo.

