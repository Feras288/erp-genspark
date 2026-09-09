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

---

## Phase 8: AR / AP Summary Reports (Phase 8B + Phase 8C-code + Phase 8D)

### Commit map (Phase 8 — على branch `main`, HEAD `8ad91f7` عند الـ closure)

```
8ad91f7 feat(phase-8): wire AR AP into reports frontend          ← Phase 8C-code
272d268 test(phase-8): add AR AP reports e2e smoke tests        ← Phase 8B-3
896a2a7 feat(phase-8): add AR AP summary calculations           ← Phase 8B-2
dd411e3 feat(phase-8): add AR AP report skeleton                ← Phase 8B-1
a143444 docs(phase-7): update README for phase 7 final          ← (Phase 7D-2 السابق)
```

- **Phase 8A** (planning only, no commit): تحديد النطاق — حصر Phase 8 في ملخصات AR/AP فقط دون aging/outstanding/payments، مع مخطط تقسيم المراحل إلى 8B-1/2/3 و 8C و 8D.
- **Phase 8B-1**: skeleton — `ArSummaryFilters`, `ApSummaryFilters` interfaces + `PLANNED` method stubs في `reports.service.ts` + `@Get('ar-summary')` و `@Get('ap-summary')` في `reports.controller.ts` (كلاهما gated بـ `reports.read`).
- **Phase 8B-2**: تكميل الـ data shapes (`ArSummaryData`, `ApSummaryData`، status breakdowns، recent invoices) + `prisma.salesInvoice.{aggregate, groupBy, findMany}` و `prisma.purchaseInvoice.{aggregate, groupBy, findMany}` + `buildArWhere` helper + `Omit<ReadyResponse<T>, 'filters'> & { filters: ... }` لـ تخصيص الـ filters shape.
- **Phase 8B-3**: backend e2e smoke tests — Tests 4g/4h + AR/AP extensions لـ Test 5 + `adminAgent = request.agent(http)` shared across all tests (إصلاح flakiness من إعادة login per test).
- **Phase 8C**: (planning only, no commit): per-component data-shape table يحدد KPIs + tables بالضبط.
- **Phase 8C-code**: frontend AR/AP wiring في `frontend/src/app/reports/page.tsx` — إضافة `'ar' | 'ap'` للـ `SectionKey` union + 2 renderers (`ArSection`, `ApSection`) + توسيع `FilterFormState` بـ `customerId`/`supplierId` + 2 inputs في الـ filter UI + 2 new `<section>` cards في الـ layout grid.
- **Phase 8D-1**: (verification only, no commit): rebuild + retest — frontend build OK، e2e 111/111 PASS.
- **Phase 8D-2**: هذا الـ README closure.

### Scope of Phase 8

**ما تم بناؤه** (داخل النطاق):

- **AR-side Read-only Aggregates**: مجموع الفواتير الصادرة (`SalesInvoice.type = 'STANDARD'`) لـ partner من نوع `CUSTOMER` أو `BOTH`، مع `byStatus` groupBy + 20 آخر الفواتير (`recentInvoices`) مع customer labels (`customerCode`, `customerName`).
- **AP-side Read-only Aggregates**: مجموع فواتير المشتريات (`PurchaseInvoice`) لـ partner من نوع `SUPPLIER` أو `BOTH`، مع `byStatus` groupBy + 20 آخر الفواتير (`recentInvoices`) مع supplier labels (`supplierCode`, `supplierName`).
- **`dateField`**: AR = `issueDate`، AP = `receivedAt` (verified في Prisma schema).
- **`paidAmount`**: AR فقط (حقل اختياري null، مربوط بـ `SalesInvoice.paidAmount Decimal? @db.Decimal(18,4)`). AP لا يحوي العمود (verified في Prisma `PurchaseInvoice` line 507).

**ما لم يتم بناؤه عمداً** (خارج النطاق في هذه المرحلة):

- **AR / AP Aging buckets** (current / 1-30 / 31-60 / 61-90 / >90 days).
- **Outstanding receivables/payables** (أي worked-out balance — `total − paidAmount`).
- **Customer/Supplier statements** (per-partner drill-down مع invoice-by-invoice view).
- **AR / AP payments + settlement tracking**.
- **AR / AP integration مع الـ journal entries** (لا posting تلقائي للـ receivables on invoice issue ولا settlement).
- **AR / AP opening balances** (لا migration للأرصدة الافتتاحية).
- **Currency conversion** (لا multi-currency — `'SAR'` literal فقط).
- **GL control accounts** (لا chart-of-accounts binding للـ AR / AP control).

### Database / Prisma Changes (Phase 8)

لا تغييرات schema. Phase 8 read-only على البيانات الموجودة:

- `SalesInvoice` (line 421): aggregates على `subtotal`, `vatTotal`, `discountTotal`, `total`, `paidAmount` + groupBy على `status` + findMany للـ 20 recent.
- `PurchaseInvoice` (line 507): aggregates على `subtotal`, `vatTotal`, `discountTotal`, `total` (NO `paidAmount`) + groupBy على `status` + findMany للـ 20 recent.
- `Partner` (line 255): joined للـ `customer.*`/`supplier.*` في الـ recent invoices.

الـ where clause يبني صراحة `companyId = JWT + deletedAt: null` + `customerId/supplierId/status/fromDate/toDate` اختياري + (AR فقط) **بدون** `type: STANDARD` (بخلاف sales-summary — الـ AR يشمل كل الـ STANDARD sales invoices بغض النظر عن `type`).

### Permissions (unchanged from Phase 7)

Phase 8 لم تضف أي permission جديدة. الـ endpointان الجديدان يستخدمان نفس `reports.read` الـ seeded في Phase 7A-2.

- `GET /reports/ar-summary` → `@RequirePermissions('reports.read')`
- `GET /reports/ap-summary` → `@RequirePermissions('reports.read')`

### Endpoints (Phase 8 — الـ 2 مسارات الجديدة)

| Method | Path | Permission | Filter inputs | Response shape |
|--------|------|------------|---------------|----------------|
| `GET` | `/reports/ar-summary` | `reports.read` | `fromDate`?, `toDate`?, `customerId`?, `status`? | `ArSummaryResponse` |
| `GET` | `/reports/ap-summary` | `reports.read` | `fromDate`?, `toDate`?, `supplierId`?, `status`? | `ApSummaryResponse` |

كل endpoint في `@Controller('reports')` class-level:

```
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
```

Response shape لكل واحد — `ReadyResponse<T>′` = `Omit<ReadyResponse<T>, 'filters'> & { filters: ArSummaryFilters | ApSummaryFilters }`:

```
{
  report: 'ar-summary' | 'ap-summary',
  status: 'READY',
  companyId: string,                       ← JWT-only
  filters: { fromDate, toDate, customerId\|supplierId, status },
  generatedAt: '2026-...',
  data: ArSummaryData | ApSummaryData {
    invoiceCount, subtotal, vatTotal, discountTotal, total, (paidAmount AR only),
    currency: 'SAR', dateField: 'issueDate' | 'receivedAt',
    statusFilter: SalesInvoiceStatus | PurchaseInvoiceStatus,
    byStatus: [...],
    recentInvoices: [...]                  ← حد أقصى 20
  }
}
```

### Frontend routes (Phase 8C-code — extension of Phase 7C)

`frontend/src/app/reports/page.tsx` — تعديل واحد فقط (478 insertions, 5 deletions):

- **SectionKey union**: `'sales' | 'pos' | 'purchases' | 'inventory' | 'stock-movements' | 'accounting' | 'ar' | 'ap'` (8 sections بدل 6).
- **الأقسام الجديدة**: `ArSection` و `ApSection` مع per-section idle/loading/error/empty/ok pattern (نفس verbatim النمط كما في الـ 6 الأصلية).
- **الـ KPI tiles (AR)**: invoiceCount, subtotal SAR, vatTotal SAR, discountTotal SAR, total SAR, paidAmount SAR (اختياري), statusFilter (عبر `AR_SALES_STATUS`), dateField label (`'تاريخ الإصدار'`).
- **الـ KPI tiles (AP)**: نفس بالضبط **بدون** paidAmount tile، statusFilter (عبر `AR_PURCHASE_STATUS`), dateField label (`'تاريخ الاستلام'`), مع نص تحذير صريح أسفل الـ KPI grid: "لا `paidAmount` — بنية فاتورة الشراء في الـ backend لا تحوي عمود دفع".
- **جدول byStatus (AR)**: 7 columns (الحالة، عدد، قبل الضريبة، الضريبة، الخصم، الإجمالي، المدفوع).
- **جدول byStatus (AP)**: 6 columns (بدون عمود المدفوع).
- **جدول recentInvoices (AR)**: 6 columns (الرقم، العميل+code، الحالة، تاريخ الإصدار، الإجمالي، المدفوع).
- **جدول recentInvoices (AP)**: 5 columns (الرقم، المورّد+code، الحالة، تاريخ الاستلام، الإجمالي — بدون المدفوع).
- **filter UI inputs الإضافية**: `customerId` (اختياري، placeholder `"customerId"`، dir="ltr") + `supplierId` (اختياري، placeholder `"supplierId"`، dir="ltr"). النص الحر — لا autocomplete، لا dropdown — مع تصميم Phase 7C نفسه (label + input + Tailwind slate border).
- **loadOne switch**: حالتا `'ar'` و `'ap'` تستخدم `apiRequest<ArSummaryReport | ApSummaryReport>` (الـ `api.arSummary()` و `api.apSummary()` غير موجودتين في الـ api object — استخدم الـ exported generic مباشرة).
- **reloadAll**: 8-key array يضمن الـ parallel `Promise.all` لكل التقارير الـ 8.

`route /reports` size بعد Phase 8C-code → **6.34 kB / 106 kB First Load JS** (قفز من 5.39 kB / 105 kB في Phase 7C بسبب الـ +478 lines).

### Tests (Phase 8B-3 + Phase 8D-1 verification)

`backend/test/reports.e2e-spec.ts` — إضافات Phase 8:

1. **التوسعة بـ 2 routes**: ROUTES array = `['reports/sales-summary', 'pos-summary', 'purchases-summary', 'inventory-summary', 'stock-movements-summary', 'accounting-summary', 'reports/ar-summary', 'reports/ap-summary']`.
2. **Tests 4g + 4h** (نفس pattern 4a..4f لـ Phase 7):
   - **4g**: AR-shape — `data.{invoiceCount, subtotal, vatTotal, discountTotal, total, currency, statusFilter, dateField, byStatus[], recentInvoices[]}` + recent-invoice `{id, status, customerId nullable, issueDate, total}` + `byStatus[].{invoiceCount, subtotal, vatTotal, total}`.
   - **4h**: AP-shape — نفس مع `recentInvoices[0].{id, status, supplierId nullable, receivedAt, total}` + لا `paidAmount` (schema-enforced).
3. **Test 5 (query filter smoke) — AR/AP extensions**: AR test = `fromDate=2026-01-01&toDate=2026-12-31&status=ISSUED` → 200 READY، AP test = `status=RECEIVED` → 200 READY.
4. **إصلاح flakiness**: `adminAgent = request.agent(http)` shared مُعتمد في `beforeAll` بـ `adminAgent.set('Authorization', Bearer <adminToken>)`. كل الاختبارات تستعمل `adminAgent.get(...)` بدل fresh `request(http).post('/auth/login')` per test (الجذر كان supertest socket-pool fragmentation).

إجمالي backend e2e **بعد Phase 8**: **111/111 passing** في ~19 s:

```
PASS test/app.e2e-spec.ts (16.82 s)
PASS test/reports.e2e-spec.ts
Test Suites: 2 passed, 2 total
Tests:       111 passed, 111 total
Time:        19.4 s
```

### AR/AP Per-Component Data-Shape Table (frontend ↔ backend contract)

| Tile / Row | AR (`ar-summary`) | AP (`ap-summary`) |
|------------|--------------------|--------------------|
| `invoiceCount` | ✅ `StatTile` | ✅ `StatTile` |
| `subtotal` SAR | ✅ `StatTile` | ✅ `StatTile` |
| `vatTotal` SAR | ✅ `StatTile` | ✅ `StatTile` |
| `discountTotal` SAR | ✅ `StatTile` | ✅ `StatTile` |
| `total` SAR | ✅ `StatTile` | ✅ `StatTile` |
| `paidAmount` SAR | ✅ `StatTile` (اختياري، `?? null`) | ❌ **محذوف عمداً** |
| `currency: 'SAR'` | literal ✅ | literal ✅ |
| `dateField` label | "تاريخ الإصدار" (`issueDate`) | "تاريخ الاستلام" (`receivedAt`) |
| `statusFilter` enum | DRAFT / ISSUED / CANCELLED | DRAFT / RECEIVED / CANCELLED |
| `byStatus[]` table cols | 7 (incl. paidAmount) | 6 (لا paidAmount col) |
| `recentInvoices[]` table cols | 6 (incl. paidAmount) | 5 (لا paidAmount col) |
| Recent invoices rows | 20 max (`slice(0, 20)`) | 20 max (`slice(0, 20)`) |
| Customer/Supplier labels | `customerName` + `customerCode` | `supplierName` + `supplierCode` |
| Filter inputs | `customerId` (free-text, opt-in) | `supplierId` (free-text, opt-in) |

### Security / tenancy (unchanged from Phase 1+2+3+4+5+6+7)

- `companyId` من `@CurrentUser() me.companyId` فقط — **لا** يقبل من الـ query ولا الـ body على أيٍّ من الـ 8 endpoints.
- `@UseGuards(JwtAuthGuard, PermissionsGuard)` global على `ReportsController` class-level، يغطي الـ 2 الجديدتين تلقائياً.
- كل الـ 8 methods مقيَّدة بـ `@RequirePermissions('reports.read')`.
- `Recent invoices` SQL يحوي `companyId = JWT + deletedAt: null` صراحة.
- AR: `customerId` filter اختياري — لو مُحدد، backend يتحقق ضمناً أن الـ customer ينتمي لنفس الـ `companyId` عبر الـ JOIN على `Partner`.
- AP: `supplierId` filter اختياري — بنفس النمط على `Partner`.
- `Prisma.Decimal` arithmetic في الـ service (subtotal/vatTotal/discountTotal/total)؛ `Number()` في أي math path الحسابية **ممنوع**. الـ serialization عبر `decimalToString` / `decimalToNullableString` على حد كل حقل.
- لا `companyId` من الـ URL أو الـ form body.
- لا tokens في `localStorage` / `sessionStorage`.

### Hard prohibitions honored (Phase 8)

- لا skills مُشغَّلة أو مُستدعاة في الـ loop الكامل (8A → 8D-2).
- لا cloudflare / workers / wrangler / OAuth / external auth / Google / social login.
- لا `gsk hosted_*` أوامر؛ لا hosted Deploy؛ لا hosted Identity.
- لا deployment بأمر المستودع هذا — فقط local Docker Compose على جهاز المستخدم.
- لا PDF / Excel / SVG / canvas / recharts / Chart.js / D3 في الـ frontend.
- لا mock / demo / fake data في الـ backend ولا الـ frontend.
- لا `git add .` ولا `git add -A` في أي commit من الـ 4 commits.
- لا modification خارج file الـ scope الوحيد المُصرَّح به:
  - 8B-1 + 8B-2 → `backend/src/reports/{reports.service.ts, reports.controller.ts}`
  - 8B-3 → `backend/test/reports.e2e-spec.ts`
  - 8C-code → `frontend/src/app/reports/page.tsx`
  - 8D-2 → `README.md` فقط (هذا الـ commit).

### Recommendation

**Phase 8 (AR / AP Summary Reports) انتهت** على مستوى:

- `8B-1` (skeleton) و `8B-2` (calculations) و `8B-3` (smoke tests) — backend.
- `8C` (planning) و `8C-code` (frontend wiring) — frontend.
- `8D-1` (verification) و `8D-2` (README closure) — closure.

كل من `ar-summary` و `ap-summary` يرجعان `status: 'READY'` بـ `Prisma.Decimal` aggregations server-side، ولا Number حسابي في أي math path. الـ permissions واحدة (`reports.read`) لـ 8 endpoints، والـ tenant isolation من JWT فقط.

**الحدود الـ strict لـ Phase 8**:

- لا computation لـ outstanding receivables/payables (`total − paidAmount`) في الـ AR أو AP.
- لا aging buckets في الـ AR أو AP.
- لا customer/supplier statements (no per-partner drill-down).
- لا payments ولا settlement tracking ولا payment reconciliation.
- لا posting تلقائي للـ receivables/payables إلى الـ journal على invoice issue/receive.
- لا opening balances migration.
- لا multi-currency — `'SAR'` literal فقط.

كل واحد من هذه الـ 6 بنود هو **مرحلة منفصلة قادمة محتملة** (بحجمها الخاص)، ولا يجب جمعها:

- إمّا **AR Aging + Outstanding** (9A).
- أو **AP Aging + Outstanding** (9B).
- أو **AR Payments + Settlement Tracking** (10A).
- أو **AP Payments + Settlement Tracking** (10B).
- أو **Customer/Supplier Statements** (11A — frontend drill-down).
- أو **AR / AP ↔ GL Integration** (12A — auto-posting).
- أو **Multi-currency layer** (13A — لو multi-currency صار أولوية؛ الآن خارج النطاق).

وكل مرحلة يجب أن تكون **single-domain** فقط. ولا deployment بأمر المستودع هذا — فقط local Docker Compose. ولا hosted deploy / hosted identity في هذه المرحلة (ولا في المراحل القادمة إلا بموافقة صريحة).

## Phase 9: AR Aging — Outstanding-only buckets (no payments, no settlement)

### Family

- `9B-1`: backend skeleton — endpoint registration + DTO lock.
- `9B-2`: backend calculations — ISSUED hard-lock + JS bucket math + per-customer rows.
- `9B-3`: backend e2e smoke — ROUTES 401/403 + READY shape + query smoke.
- `9C-code`: frontend wiring — Next.js API helper + types mirror + reports page sub-section.
- `9D-1`: final verification only — no commits, no edits, no pushes; e2e regression check.
- `9D-2`: README update and final closure (هذا الـ commit).

### Conventional Commits على `main`

```
d494ea6 feat(phase-9): wire AR aging into reports frontend    ← Phase 9C-code
bce5dd8 test(phase-9): add AR aging backend e2e smoke         ← Phase 9B-3
c85a59d feat(phase-9): add AR aging calculations              ← Phase 9B-2
fa9404a feat(phase-9): add AR aging skeleton                  ← Phase 9B-1
```

### Backend additions

- Endpoint جديد: `GET /api/reports/ar-aging` مُقيَّد بـ `@RequirePermissions('reports.read')` تمامًا مثل الـ 8 endpoints السابقة.
- `companyId` من `@CurrentUser() me.companyId` فقط — **لا** يقبل من الـ query ولا الـ body.
- DTO lock: `ReportQueryDto` بدون `companyId`؛ status مقفل على `ISSUED` داخل الـ `where` ويُتجاهل `query.status` عمداً (D4 lock).
- `WHERE` clause: `companyId = JWT + status = ISSUED + OR(dueDate ∈ [fromDate, toDate], dueDate null + issueDate ∈ [fromDate, toDate])`.
- `findMany({ take: 5001 })` كحماية: لو عدد الـ invoices الـ returned > 5000، يُرمى `BadRequestException`.
- Bucket math في JS/TypeScript (لا raw SQL، لا `$queryRaw`):
  - `effectiveAgingDate = dueDate ?? issueDate` — لكل صف على حدة.
  - `daysPastDue = max(0, ceil((asOfDate - effectiveDate) / 1 day))`.
  - 5 buckets: `current` (≤0)، `1-30` (1..30)، `31-60` (31..60)، `61-90` (61..90)، `+90` (+infinity).
  - `outstanding = max(0, total − paidAmount)`؛ الـ Prisma.Decimal arithmetic حصراً، `Number()` الحسابي **ممنوع**.
  - `paidAmount = null → 0`؛ rows ذات `outstanding ≤ 0` تُحذف.
- Per-customer breakdown: تجميع الـ rows على `customerId` — الـ null customerId يُجمَّع تحت `'__no_customer__'` placeholder ثم يُفلتر من `byCustomer.rows` (لا يظهر في الـ UI).
- الـ serialization: `Prisma.Decimal @db.Decimal(18,4)` عبر `decimalToString` على كل حقل مالي في الـ serialization.

### Backend data contract (`ArAgingResponse`)

```ts
type ArAgingBucketKey = 'current' | '1-30' | '31-60' | '61-90' | '+90';

type ArAgingData = {
  currency: 'SAR';
  dateField: 'dueDate';
  statusFilter: 'ISSUED';
  buckets: Record<ArAgingBucketKey, { invoiceCount: number; outstanding: string }>;
  totals: { invoiceCount: number; outstanding: string };
  byCustomer: { rows: ArAgingCustomerRow[] };
};

type ArAgingResponse = Omit<ReadyResponse<ArAgingData>, 'filters'> & {
  filters: { fromDate; toDate; customerId; status; asOfDate };
};
```

### Frontend additions

- `frontend/src/lib/api.ts`:
  - Wrapper جديد واحد: `arAgingReport: (params: ReportQueryParams = {}) => apiRequest<ArAgingReport>(...)` — نفس النمط الـ 6 wrappers الموجودة (sales/pos/purchases/inventory/stockMovements/accounting).
  - 6 types جديدة mirror: `ArAgingBucketKey`, `ArAgingFilters`, `ArAgingBucket`, `ArAgingCustomerRow`, `ArAgingData`, `ArAgingReport`.
  - لا تعديل على arSummary/apSummary wrappers (مربوطان Phase 8C-code).

- `frontend/src/app/reports/page.tsx`:
  - استيراد `ArAgingBucketKey` و `ArAgingReport`.
  - `'ar-aging'` في `SectionKey` union + `sections` state initializer.
  - `case 'ar-aging'` في `loadOne` switch (يستخدم `api.arAgingReport(q)`).
  - `'ar-aging'` في `reloadAll` array — parallel fire.
  - ثابتا `AR_AGING_BUCKET_LABEL` و `AR_AGING_BUCKET_ORDER` (5 مفاتيح بأسماء عربية، typing مُحَكَّم: `Record<ArAgingBucketKey, string>` و `readonly ArAgingBucketKey[]`).
  - مكوّن `<ArAgingSection>` كامل (≈ 170 سطر): 6 StatTiles + جدول 5 buckets + جدول `byCustomer.rows` (أوائل 30 صف).
  - JSX `<section>` للقسم AR Aging بعد `<ApSection>` وقبل `<StockMovementsSection>`.

### AR Aging Per-Component Data-Shape Table (frontend ↔ backend contract)

| Tile / Row | مصدر Backend | عرض Frontend |
|------------|---------------|---------------|
| `totals.invoiceCount` | `ArAgingData.totals.invoiceCount` | ✅ `StatTile` "إجمالي الفواتير" |
| `totals.outstanding` | `ArAgingData.totals.outstanding` | ✅ `StatTile` "إجمالي المتبقي (outstanding)" |
| `filters.asOfDate` | `ArAgingFilters.asOfDate` (ISO) | ✅ `StatTile` "تاريخ التقرير (asOfDate)" |
| `statusFilter = 'ISSUED'` | `ArAgingData.statusFilter` | ✅ `StatTile` "فلتر الحالة (مقفل من الخادم)" |
| `dateField = 'dueDate'` | `ArAgingData.dateField` | ✅ `StatTile` "حقل التاريخ" → "تاريخ الاستحقاق (dueDate)" |
| `currency = 'SAR'` | `ArAgingData.currency` | ✅ `StatTile` "العملة" |
| `buckets[5]` × `{invoiceCount, outstanding}` | `ArAgingData.buckets` | ✅ جدول 5 صفوف (current, 1-30, 31-60, 61-90, +90) × (2 cols) |
| `byCustomer.rows[]` × `{customerId, Code, Name, total, paid, outstanding, buckets}` | `ArAgingData.byCustomer.rows` | ✅ جدول 4 cols (Name, total, paid, outstanding) — slide max 30 |

### Security / tenancy (unchanged from Phase 1+2+3+4+5+6+7+8)

- `companyId` من `@CurrentUser() me.companyId` فقط — **لا** يقبل من الـ query ولا الـ body.
- `@UseGuards(JwtAuthGuard, PermissionsGuard)` global على `ReportsController` يغطي الـ endpoint الجديد تلقائياً.
- `@RequirePermissions('reports.read')` على `arAging` exactly مثل الـ 8 methods الأخرى.
- `status = ISSUED` hard-locked داخل الـ `where` — حتى لو الـ client مرّر `query.status` لن يصل إلى الـ DB.
- `customerId` filter اختياري — لو مُحدد، الـ JOIN ضمناً يحقق أن الـ customer ينتمي للـ `companyId` نفسها.
- `Prisma.Decimal` arithmetic في الـ service (`total − paidAmount`)؛ `Number()` في أي math path الحسابي **ممنوع**.
- لا `companyId` من الـ URL أو الـ form body.
- لا tokens في `localStorage` / `sessionStorage`.
- لا `asOfDate` في الـ input — يُحسب من الخادم (`new Date().toISOString()`)، frontend يعرضه فقط.

### Hard prohibitions honored (Phase 9)

- لا skills مُشغَّلة أو مُستدعاة في الـ loop الكامل (9B-1 → 9D-2).
- لا cloudflare / workers / wrangler / OAuth / external auth / hosted deploy / hosted identity.
- لا `$queryRaw` / raw SQL — كل الـ DB calls عبر `prisma.salesInvoice.findMany` فقط مع limited `select/include`.
- لا payments module / settlement tracking / payment reconciliation — `paidAmount` يُقرأ فقط من `SalesInvoice.paidAmount` لتقليل الحساب، لا إنشاء ولا تعديل.
- لا aging batches للـ AP (الـ supplier receivables) — `apAging` خارج هذه الـ phase.
- لا posting تلقائي للـ outstanding receivables إلى الـ journal.
- لا trial balance ولا قوائم مالية (دخل / ميزانية / VAT / ZATCA).
- لا e2e tests للـ frontend (Jest/Playwright في الـ Next.js client) — الـ backend tsc build فقط يجب أن يمر.
- لا README/e2e/RBAC/schema/docker/Dockerfile/docker-compose modifications — كل ملف في الـ scope المُصرَّح به فقط:
  - 9B-1 + 9B-2 → `backend/src/reports/{reports.service.ts, reports.controller.ts}`
  - 9B-3 → `backend/test/reports.e2e-spec.ts`
  - 9C-code → `frontend/src/lib/api.ts` و `frontend/src/app/reports/page.tsx`
  - 9D-2 → `README.md` فقط (هذا الـ commit).
- لا `git add .` ولا `git add -A` — كل الـ commits الـ 4 في phase-9 يستخدمون `git add <file>...` صراحةً.
- لا `cf-byok-deploy` / `designer-handoff` / `gsk-hosted-deploy` / `gsk-hosted-identity` skill activation.

### Recommendation

**Phase 9 (AR Aging — Outstanding-only buckets) انتهت** على مستوى:

- `9B-1` (skeleton: controller endpoint + DTO lock) و `9B-2` (calculations: ISSUED hard-lock + JS bucket math + per-customer rows) و `9B-3` (smoke tests: ROUTES 401/403 + READY shape + query smoke) — backend.
- `9C-code` (frontend wiring: wrapper + types mirror + مكوّن `<ArAgingSection>` + JSX section) — frontend.
- `9D-1` (verification: working tree clean, HEAD = `d494ea6`, scope limited to 2 files, e2e regression unchanged) و `9D-2` (README closure: هذا الـ commit).

كل الـ computed values (totals.invoiceCount, totals.outstanding, buckets[5], byCustomer.rows[]) تأتي من الـ Prisma.Decimal arithmetic في الـ backend عبر JS — لا Number حسابي في أي math path. الـ permissions واحدة (`reports.read`) لـ 9 endpoints الآن، والـ tenant isolation من JWT فقط.

**الحدود الـ strict لـ Phase 9**:

- لا `paidAmount` write — القراءة فقط لتقليل الحساب، لا API لـ "تسجيل دفعة" ولا "تعديل دفعة".
- لا aging batches للـ AP — `apAging` خارج هذه الـ phase (ولو الـ backend data model يحوي `PurchaseInvoice.receivedAt`).
- لا customer drill-down statements (لا /customers/:id/account-statement route).
- لا cash flow forecasting من الـ aging data.
- لا PDF / Excel / SVG export للـ aging report.
- لا charts ولا visualizations (لا recharts ولا Chart.js ولا D3).
- لا multi-currency — `'SAR'` literal فقط.
- لا email/notification trigger based on overdue thresholds.

كل واحد من هذه الـ 7 بنود هو **مرحلة منفصلة قادمة محتملة** (بحجمها الخاص)، ولا يجب جمعها:

- إمّا **AP Aging + Outstanding** (9E) — مرآة Phase 9 لكن لـ `PurchaseInvoice` بدل `SalesInvoice`.
- أو **AR Payments + Settlement Tracking** (10A) — API لتسجيل الدفع + reconciliation logic.
- أو **AP Payments + Settlement Tracking** (10B).
- أو **Customer/Supplier Statements** (11A — frontend drill-down per partner).
- أو **AR / AP ↔ GL Integration** (12A — auto-posting outstanding receivables/payables on invoice issue/receive).
- أو **Notifications** (13A — email/SMS على الـ overdue thresholds).
- أو **Multi-currency layer** (14A — لو multi-currency صار أولوية؛ الآن خارج الـ نطاق).

وكل مرحلة يجب أن تكون **single-domain** فقط. ولا deployment بأمر المستودع هذا — فقط local Docker Compose. ولا hosted deploy / hosted identity في هذه المرحلة (ولا في المراحل القادمة إلا بموافقة صريحة).

→ Phase 9 closure verified. Phase 9D-2 (README update) sealed.

## Phase 9E: AP Aging — Outstanding-only buckets (no payments, no reconciliation, no settlement)

### Family

- `9E-B-1`: backend skeleton — endpoint registration + DTO lock + PLANNED shape.
- `9E-B-2`: backend calculations — RECEIVED hard-lock + JS bucket math + per-supplier rows + 3-leg OR-group date filter + `paidAmount` absence compensated by `apSafeOutstanding = max(0, total)`.
- `9E-B-3`: backend e2e smoke — ROUTES 401/403 + READY shape + query smoke (no `supplierId` query smoke — لا fixture supplier للـ filter الـ exact في الـ seed، مُحترم الـ scope contract).
- `9E-C-code`: frontend wiring — Next.js API helper + types mirror (6 types بدون `paid` field) + reports page sub-section بدون `paid` column.
- `9E-D-1`: final verification only — no commits, no edits, no pushes; build + e2e regression check.
- `9E-D-2`: README update and final closure (هذا الـ commit).

### Conventional Commits على `main`

```
ba0b014 feat(phase-9e): wire AP aging into reports frontend     ← Phase 9E-C-code
e27971c test(phase-9e): add AP aging backend e2e smoke          ← Phase 9E-B-3
79f7d55 feat(phase-9e): add AP aging calculations               ← Phase 9E-B-2
c447d31 feat(phase-9e): add AP aging skeleton                   ← Phase 9E-B-1
```

### Backend additions

- Endpoint جديد: `GET /api/reports/ap-aging` مُقيَّد بـ `@RequirePermissions('reports.read')` تمامًا مثل الـ 9 endpoints السابقة.
- `companyId` من `@CurrentUser() me.companyId` فقط — **لا** يقبل من الـ query ولا الـ body (Phase 7B-1 contract، نفس الـ guardrails التي مُحكمت في Phase 7).
- DTO lock: `ReportQueryDto` بدون `companyId`، **وأيضًا** بدون `asOfDate` (يُحسب من الخادم `new Date().toISOString()` تمامًا مثل `ar-aging`).
- status مقفل على `RECEIVED` داخل الـ `where` ويُتجاهل `query.status` عمداً (D4-style lock؛ الـ AP flip لـ Phase 9E).
- `WHERE` clause (3-leg OR-group على خلاف AR ذو الـ 2 legs):
  - `receivedAt ∈ [fromDate, toDate]`  **OR**
  - `receivedAt null + dueDate ∈ [fromDate, toDate]`  **OR**
  - `receivedAt null + dueDate null + purchaseDate ∈ [fromDate, toDate]`
  - وبالطبع `companyId = JWT` + `status = RECEIVED` + `deletedAt = null`.
- `findMany({ take: 5001 })` كحماية: لو عدد الـ invoices الـ returned > 5000، يُرمى `BadRequestException`.
- Aging-date fallback (per-row على حدة):
  - `effectiveApAgingDate = receivedAt ?? dueDate ?? purchaseDate` — كل صف ممكن يكون له `effectiveDate` مختلفة حسب الـ signal الـ close-to-payment.
  - `daysPastDue = max(0, ceil((asOfDate - effectiveApAgingDate) / 1 day))`.
  - 5 buckets: `current` (≤0)، `1-30` (1..30)، `31-60` (31..60)، `61-90` (61..90)، `+90` (+infinity).
- Outstanding formula خاص بـ Phase 9E (بدون `paidAmount` على الـ schema):
  - `apSafeOutstanding(total) = max(0, total)` — دائمًا. السبب: `model PurchaseInvoice` في lineup الـ 7B-3 وما قبله (و 8B-2) **لم** يُحَوِّل `paidAmount` — الـ field غير موجود على الـ schema، والـ outstanding هو الـ full `total` (لا subtraction logic).
  - rows ذات `outstanding ≤ 0` تُحذف.
  - الـ Prisma.Decimal arithmetic حصراً، `Number()` الحسابي **ممنوع** تمامًا مثل Phase 9.
- Per-supplier breakdown: تجميع الـ rows على `supplierId` — الـ null supplierId يُجمَّع تحت `'__no_supplier__'` placeholder ثم يُفلتر من `bySupplier.rows` (لا يظهر في الـ UI).
- الـ serialization: `Prisma.Decimal @db.Decimal(18,4)` عبر `decimalToString` على كل حقل مالي في الـ serialization (تمامًا مثل Phase 9).

### Backend data contract (`ApAgingResponse`)

```ts
type ApAgingBucketKey = 'current' | '1-30' | '31-60' | '61-90' | '+90';

type ApAgingData = {
  currency: 'SAR';
  dateField: 'receivedAt';          // ← not 'dueDate' (AR is dueDate)
  statusFilter: 'RECEIVED';         // ← not 'ISSUED'
  buckets: Record<ApAgingBucketKey, { invoiceCount: number; outstanding: string }>;
  totals: { invoiceCount: number; outstanding: string };
  bySupplier: { rows: ApAgingSupplierRow[] };   // ← not byCustomer
};

type ApAgingResponse = Omit<ReadyResponse<ApAgingData>, 'filters'> & {
  filters: { fromDate; toDate; supplierId; status; asOfDate };
};
```

**Contract deltas vs `ArAgingResponse`** (مهم لتجنّب client regressions):

- `dateField`: `'receivedAt'` بدل `'dueDate'` (الـ AR mirror).
- `statusFilter`: `'RECEIVED'` بدل `'ISSUED'` (الـ AR mirror للـ AP world).
- `bySupplier.rows` بدل `byCustomer.rows` (الـ grouping key flip ومنطق الـ null-customer/-supplier handling نفس النمط).
- **لا** field اسمه `paid` على الـ per-row shape — `PurchaseInvoice` schema لا يحوي `paidAmount`؛ الـ fields المالية على الـ per-supplier row هي `total` و `outstanding` فقط.
- `filters.supplierId` بدل `filters.customerId` — والـ frontend mirror يحترم ذلك بدون padding لأي `paid` key في الـ typings.

### Frontend additions

- `frontend/src/lib/api.ts`:
  - Wrapper جديد واحد: `apAgingReport: (params: ReportQueryParams = {}) => apiRequest<ApAgingReport>(...)` — نفس النمط الـ 7 wrappers الموجودة (sales/pos/purchases/inventory/stockMovements/accounting/arAging).
  - 6 types جديدة mirror: `ApAgingBucketKey`, `ApAgingFilters`, `ApAgingBucket`, `ApAgingSupplierRow`, `ApAgingData`, `ApAgingReport`. الـ `ApAgingSupplierRow` يحوي `total` + `outstanding` فقط (بدون `paid` field — mirrored from الـ backend contract الـ exact).
  - لا تعديل على `arAgingReport` / arSummary / apSummary wrappers.

- `frontend/src/app/reports/page.tsx`:
  - استيراد `ApAgingBucketKey` و `ApAgingReport`.
  - `'ap-aging'` في `SectionKey` union + `sections` state initializer.
  - `case 'ap-aging'` في `loadOne` switch (يستخدم `api.apAgingReport(q)`).
  - `'ap-aging'` في `reloadAll` array — parallel fire مع `'ar-aging'`.
  - ثابتا `AP_AGING_BUCKET_LABEL` و `AP_AGING_BUCKET_ORDER` (5 مفاتيح بأسماء عربية، typing مُحَكَّم: `Record<ApAgingBucketKey, string>` و `readonly ApAgingBucketKey[]` — نفس الـ `tsc --strict` discipline الـ introduced في Phase 9C-code).
  - مكوّن `<ApAgingSection>` كامل (≈ 155 سطر، mirror لـ `<ArAgingSection>`): 5 StatTiles + جدول 5 buckets + جدول `bySupplier.rows` 3 أعمدة (Name, total, outstanding — **بدون** عمود `paid`؛ slide max 30).
  - JSX `<section>` للقسم AP Aging جنب الـ AR Aging section، كلاهما `lg:col-span-2`، `statusFilterLabel={AR_PURCHASE_STATUS.RECEIVED}` (للحالة مقفلة `'مستلمة'` echoing من الخادم).

### AP Aging Per-Component Data-Shape Table (frontend ↔ backend contract)

| Tile / Row | مصدر Backend | عرض Frontend |
|------------|---------------|---------------|
| `data.currency = 'SAR'` | `ApAgingData.currency` | ✅ `StatTile` "العملة" |
| `data.dateField = 'receivedAt'` | `ApAgingData.dateField` | ✅ `StatTile` "حقل التاريخ" → "تاريخ الاستلام (receivedAt)" |
| `filters.status = 'RECEIVED'` | `ApAgingFilters.status` (locked من الخادم) | ✅ `StatTile` "فلتر الحالة" → echoes "مستلمة" من الخادم |
| `filters.asOfDate` | `ApAgingFilters.asOfDate` (server-computed ISO) | ✅ `StatTile` "تاريخ التقرير (asOfDate)" |
| `totals.invoiceCount` | `ApAgingData.totals.invoiceCount` | ✅ `StatTile` "إجمالي الفواتير" |
| `totals.outstanding` | `ApAgingData.totals.outstanding` | ✅ `StatTile` "إجمالي المتبقي (outstanding)" |
| `buckets[5]` × `{invoiceCount, outstanding}` | `ApAgingData.buckets` | ✅ جدول 5 صفوف (current, 1-30, 31-60, 61-90, +90) × (2 cols، بنفس النمط الـ AR) |
| `bySupplier.rows[]` × `{supplierId, supplierCode, supplierName, total, outstanding, buckets}` | `ApAgingData.bySupplier.rows` | ✅ جدول 3 cols (Name, total, outstanding) — **بدون** عمود `paid`؛ slide max 30؛ الـ `buckets` field موجود على الـ type لكن لا يظهر في الجدول (للـ symmetry مع AR side؛ ممكن 9F drill-down) |

### Security / tenancy (unchanged from Phase 1+2+3+4+5+6+7+8+9)

- `companyId` من `@CurrentUser() me.companyId` فقط — **لا** يقبل من الـ query ولا الـ body.
- `@UseGuards(JwtAuthGuard, PermissionsGuard)` global على `ReportsController` يغطي الـ endpoint الجديد تلقائياً.
- `@RequirePermissions('reports.read')` على `apAging` exactly مثل الـ 9 methods الأخرى (10 endpoints الآن لـ `reports.read`).
- `status = RECEIVED` hard-locked داخل الـ `where` — حتى لو الـ client مرّر `query.status` لن يصل إلى الـ DB.
- `supplierId` filter اختياري — لو مُحدد، الـ JOIN ضمناً يحقق أن الـ supplier ينتمي للـ `companyId` نفسها (`Partner.companyId == @CurrentUser().companyId`).
- `Prisma.Decimal` arithmetic في الـ service عبر `decimalToString`؛ `Number()` في أي math path الحسابي **ممنوع**.
- لا `companyId` من الـ URL أو الـ form body.
- لا tokens في `localStorage` / `sessionStorage`.
- لا `asOfDate` في الـ input — يُحسب من الخادم (`new Date().toISOString()`)، frontend يعرضه فقط.
- لا `paidAmount` field مخترَع client-side — الـ schema في الـ backend لا يحوي `paidAmount` على `PurchaseInvoice`، فـ mirror النوع `ApAgingSupplierRow` يحوي `total` + `outstanding` فقط.

### Out of scope (Phase 9E — explicit)

- لا `payments` module — لا API لـ "تسجيل دفعة" ولا "تعديل دفعة" أو "حذف دفعة" أو "إلغاء دفعة" على الـ AP side.
- لا `reconciliation` logic — لا شيء يُطابق الـ payments مع الـ GL (الـ GL الـ raw payments غير موجودة أصلاً في الـ lineup Phase 6).
- لا `AP payment settlement` — الـ outstanding يبقى = الـ full `total` حتى الـ future Phase 10B (التالية الـ scoped).
- لا schema migration — لا `prisma migrate dev` ولا `schema.prisma` edit؛ حسابات الـ outstanding الحالية تستخدم الـ columns المتاحة أصلاً (`PurchaseInvoice.total`).
- لا RBAC changes — لا permissions جديدة، لا roles جديدة، لا guards جديدة؛ `@RequirePermissions('reports.read')` فقط، الـ permission الوحيد لـ reports.
- لا deployment — لا Docker Compose orchestration change، لا Cloudflare Pages، لا hosted deploy، لا hosted identity، لا e2e للـ frontend؛ الـ backend e2e regression (113/113 PASS) فقط للتأكد أن الـ invariants سليمة على الـ same dataset.

### Hard prohibitions honored (Phase 9E)

- لا skills مُشغَّلة أو مُستدعاة في الـ loop الكامل (9E-B-1 → 9E-D-2).
- لا cloudflare / workers / wrangler / OAuth / external auth / hosted deploy / hosted identity.
- لا `$queryRaw` / raw SQL — كل الـ DB calls عبر `prisma.purchaseInvoice.findMany` فقط مع limited `select` (المطلوب للـ grouping على `supplierId` عبر الـ small relation table، لا JOIN raw).
- لا payments module / settlement tracking / payment reconciliation — الـ `PurchaseInvoice` يحوي `total` فقط، ولا API replace الـ outstanding بـ `(total - paidAmount)` لأن الـ schema لا يحوي الـ latter أصلاً.
- لا posting تلقائي للـ outstanding payables إلى الـ journal.
- لا trial balance ولا قوائم مالية (دخل / ميزانية / VAT / ZATCA).
- لا e2e tests للـ frontend (Jest/Playwright في الـ Next.js client) — الـ backend `nest build` / `jest e2e` فقط يجب أن يمر.
- لا README/e2e/RBAC/schema/docker/Dockerfile/docker-compose/seed/Prisma modifications — كل ملف في الـ scope المُصرَّح به فقط:
  - 9E-B-1 + 9E-B-2 → `backend/src/reports/{reports.service.ts, reports.controller.ts}`
  - 9E-B-3 → `backend/test/reports.e2e-spec.ts`
  - 9E-C-code → `frontend/src/lib/api.ts` و `frontend/src/app/reports/page.tsx`
  - 9E-D-2 → `README.md` فقط (هذا الـ commit).
- لا `git add .` ولا `git add -A` — كل الـ commits الـ 4 في phase-9e يستخدمون `git add <file>...` صراحةً (نفس الـ discipline الـ introduced في Phase 6A و 7B و 8B و 9B).
- لا cf-byok-deploy / designer-handoff / gsk-hosted-deploy / gsk-hosted-identity skill activation.

### Backend e2e regression invariant (Phase 9E)

- `pnpm --filter @erp/backend test:e2e` ⇒ **113 passed / 113 total** (Post 9E-B-3، ثابت على 9E-D-1 و 9E-D-2):
  - `test/app.e2e-spec.ts` (16–17 s startup + smoke-e2e health/JWT).
  - `test/reports.e2e-spec.ts` (≈ 19 s، يحوي الآن `it('4j) ap-aging data (Phase 9E-B-3) has the AP aging contract shape` + `it('5) ap-aging` query smoke entry).
  - 2 test suites passing، 113 tests passing، 0 failing، 0 flake بعد الـ re-run الـ sole على `it('5)` في الـ first Phase 9E-B-3 invocation بسبب socket-pool race على الـ 12 simultaneous admin-agent `Promise.all` calls — غير bug حقيقيّ، الـ second run كان clean ولا حاجة لـ rebuild.

### Frontend build invariant (Phase 9E)

- `pnpm --filter @erp/frontend build` ⇒ Next.js 14.2.35 compiled SUCCESS.
- Route table يبقى 13 routes ثابتة، `/reports = 7.28 kB / 107 kB First Load JS` (بالضبط +0.26 kB vs Phase 9C-code، بدون drift بعد 9E-C-code).
- لا `-warn` ولا `-error` على الـ build log.

### Recommendation

**Phase 9E (AP Aging — Outstanding-only buckets) انتهت** على مستوى:

- `9E-B-1` (skeleton: controller endpoint + DTO lock + PLANNED shape + asOfDate server-computed) و `9E-B-2` (calculations: RECEIVED hard-lock + 3-leg OR-group date filter + `effectiveApAgingDate = receivedAt ?? dueDate ?? purchaseDate` + JS bucket math + `apSafeOutstanding = max(0, total)` + per-supplier rows) و `9E-B-3` (smoke tests: ROUTES 401/403 + READY shape + query smoke بدون `supplierId` filter) — backend.
- `9E-C-code` (frontend wiring: wrapper + 6 types mirror بدون `paid` field + مكوّن `<ApAgingSection>` بدون عمود `paid` + JSX section) — frontend.
- `9E-D-1` (verification: working tree clean، HEAD = `ba0b014`، scope limited to README-only، backend build PASS، backend e2e PASS = 113/113، frontend build PASS) و `9E-D-2` (README closure: هذا الـ commit).

كل الـ computed values (`totals.invoiceCount`, `totals.outstanding`, `buckets[5]`, `bySupplier.rows[]`) تأتي من الـ Prisma.Decimal arithmetic في الـ backend عبر JS — لا Number حسابي في أي math path. الـ permissions واحدة (`reports.read`) لـ 10 endpoints الآن، والـ tenant isolation من JWT فقط، والـ outstanding هو الـ full `total` بدون `paidAmount` subtraction لأن الـ schema لا يحوي الـ column.

**الحدود الـ strict لـ Phase 9E**:

- لا `payments` module — لا كتابة على `Payment` model (الـ absent أصلاً من الـ lineup الـ up-to-Phase-8).
- لا `reconciliation` — لا matching بين الـ outstanding والـ bank statements.
- لا `AP payment settlement` tracking — الـ outstanding يبقى الـ full `total` حتى Phase 10B.
- لا customer/partner drill-down statements (لا /partners/:id/account-statement route).
- لا cash flow forecasting من الـ aging data.
- لا PDF / Excel / SVG export للـ aging report.
- لا charts ولا visualizations (لا recharts ولا Chart.js ولا D3).
- لا multi-currency — `'SAR'` literal فقط (تمامًا مثل Phase 9).
- لا email/notification trigger based on overdue thresholds.
- لا mutation API على `PurchaseInvoice.receivedAt` (read-only aggregation layer تمامًا مثل Phase 9).

كل واحد من هذه الـ 9 بنود هو **مرحلة منفصلة قادمة محتملة** (بحجمها الخاص)، ولا يجب جمعها:

- إمّا **AR Payments + Settlement Tracking** (10A) — API لتسجيل الدفع + reconciliation logic على الـ AR side.
- أو **AP Payments + Settlement Tracking** (10B) — مرآة الـ 10A لكن لـ `PurchaseInvoice`، الـ schema يحصل فيها على `paidAmount` + الـ mutation APIs + الـ reconciliation الـ suitable للـ receivedAt timeline.
- أو **Customer/Supplier Statements** (11A — frontend drill-down per partner).
- أو **AR / AP ↔ GL Integration** (12A — auto-posting outstanding receivables/payables على invoice issue/receive).
- أو **Notifications** (13A — email/SMS على الـ overdue thresholds).
- أو **AP Aging Drill-down** (داخل الـ 9E: ممكن extension في phase لاحقة لعرض الـ `supplierId` → قائمة الـ invoices الـ underlying، لكن ليس في الـ scope الـ current).
- أو **Multi-currency layer** (14A — لو multi-currency صار أولوية؛ الآن خارج الـ نطاق).

وكل مرحلة يجب أن تكون **single-domain** فقط. ولا deployment بأمر المستودع هذا — فقط local Docker Compose. ولا hosted deploy / hosted identity في هذه المرحلة (ولا في المراحل القادمة إلا بموافقة صريحة).

→ Phase 9E closure verified. Phase 9E-D-2 (README update) sealed.

## Phase 10A: AR Payments + Settlement Tracking

AR Payments هي طبقة **settlement** الـ على الـ `SalesInvoice` side في الـ AR side — تسجيل الـ payments الـ customers على الـ invoices الـ issued، مع idempotency short-circuit + overpayment guard + writeback على `SalesInvoice.paidAmount` (بدون تغيير الـ `status`).

API جديد scoped على `:salesInvoiceId` (لا endpoint عام على الـ Payments resource مباشرةً — الـ polymorphic SSO-style routing يُغطَّى في phase لاحقة لـ AP side).

### Commits الـ 4 في phase-10a

```
274b465 feat(phase-10a): wire AR payments into sales frontend      ← Phase 10A-C-code
9cd61c2 test(phase-10a): add AR payments e2e smoke                  ← Phase 10A-B-3
0e218e3 feat(phase-10a): add AR payments settlement logic            ← Phase 10A-B-2
38a5af3 feat(phase-10a): add AR payments skeleton                    ← Phase 10A-B-1
```

### Schema additions (Phase 10A-B-1 → 10A-B-2)

- **Payment model** في `backend/prisma/schema.prisma`:
  - `id` (cuid) + `companyId` (FK Company, Cascade).
  - `paymentMethod: PaymentMethod` enum (`CASH` | `CARD` | `TRANSFER` | `OTHER`).
  - `amount: Decimal @db.Decimal(18, 4)` — `Prisma.Decimal` arithmetic في الـ service عبر `decimalToString`.
  - `paidAt: DateTime` (default `now()`).
  - `reference: String?` (optional receipt/cheque id من الـ frontend).
  - `notes: String?` (optional free text).
  - **Polymorphic FK pair** (exactly one invariant مُطبَّق عبر CHECK في الـ migration SQL — Prisma لا تستطيع التعبير عن polymorphic FK + CHECK في declaration واحدة):
    - `salesInvoiceId: String?` (FK → `sales_invoices.id`، `onDelete: SetNull`).
    - `purchaseInvoiceId: String?` (FK → `purchase_invoices.id`، `onDelete: SetNull`).
    - `invoiceType: PaymentInvoiceType` enum (`SALES` | `PURCHASE`).
  - `status: PaymentStatus @default(POSTED)` enum (`POSTED` | `CANCELLED`).
  - `idempotencyKey: String?` (optional client-supplied key — Phase 10A-B-2).
  - `cancelledAt: DateTime?` + `cancelledById: String?` (soft cancellation path).
  - `deletedAt: DateTime?` (soft delete reversible).
  - Audit fields: `createdAt` / `updatedAt` / `createdById` / `updatedById`.
  - Indexes: `@@index([companyId, status])`، `@@index([companyId, paidAt])`، `@@index([companyId, deletedAt])`، `@@index([companyId, invoiceType])`، `@@index([salesInvoiceId])`، `@@index([purchaseInvoiceId])`.
  - `@@map("payments")`.

- **Migration**: `20260908215449_phase10a_payments` — يضيف `payments` table + الـ indexes + الـ CHECK constraint الـ polymorphic (exactly one of salesInvoiceId/purchaseInvoiceId non-null).
- **SalesInvoice backwrite (Phase 10A-B-2)**: $transaction writes back على `sales_invoices.paidAmount` لكل POST ناجح؛ الـ outstanding = `max(0, total - COALESCE(paidAmount, 0))` يُستخدم كـ guard.

### Permissions (RBAC — Phase 10A-B-1)

- `ar_payments.read` — مطلوب لـ `GET /api/sales-invoices/:invoiceId/payments`.
- `ar_payments.write` — مطلوب لـ `POST /api/sales-invoices/:invoiceId/payments`.
- مفصولتين عن الـ existing catalog، ولا يُضاف أي permission إضافي.
- Server enforcement عبر `@RequirePermissions(...)` decorator + `PermissionsGuard` (الـ existing — لا guard جديد).
- Client-side mirror عبر `useAuth().hasPermission('ar_payments.read' | 'ar_payments.write')` يقرأ من الـ `state.user.permissions` JWT claim — نفس الـ split الـ موجود في الـ prior phases.

### Endpoints (Phase 10A-B-2)

```
GET  /api/sales-invoices/:invoiceId/payments
POST /api/sales-invoices/:invoiceId/payments
```

كلاهما tenant-scoped (`companyId` من الـ JWT فقط — لا companyId من الـ URL أو الـ body)، polymorphic guarded على `invoiceType = SALES` فقط في الـ Phase 10A (الـ AP coverage = Phase 10B المنفصلة).

#### GET behavior

- يعرض قائمة الـ payments لـ `:invoiceId` (الـ `salesInvoiceId` polymorphic alias في الـ response).
- Query filters: `fromDate` (yyyy-mm-dd) و `toDate` (yyyy-mm-dd) — يطبَّق على `paidAt` فقط.
- Sort: `paidAt DESC`، ثم `createdAt DESC` داخل الـ ties.
- Tenant isolation: `companyId` من الـ JWT فقط عبر `where.companyId = companyId`.
- Response: array من الـ polymorphic `PaymentResponseRow` mapped عبر `toResponseRow()` — الـ `id`، `invoiceId` (= salesInvoiceId alias)، `invoiceType` enum، `amount` (string — Decimal-as-string) ، `paymentMethod` enum، `paidAt` ISO string، `reference | null`، `notes | null`، `status` enum، `idempotencyKey | null`، `createdAt` ISO string.
- Status guard: يجب على الـ invoice يكون issued / partially-settled (لا يُمنع الـ GET لدفعات الـ cancelled invoices، الـ soft-delete filter على الـ Payment-level فقط).

#### POST behavior

- **Partial payments مسموحة**: `amount` request لا يجب أن يغطي الـ outstanding كاملاً في الـ call واحدة — multiple POST calls متتالية مسموحة طالما كل واحدة ≤ `outstanding`.
- **Idempotency-Key**: optional، string بطول 8..128 (الـ DTO validator `class-validator@IsString + @Length(8, 128)`). الـ service يعمل short-circuit **before the transaction**: لو في payment active (deletedAt == null) بنفس الـ `(companyId, salesInvoiceId, idempotencyKey)`, يرجعه كما هو بدل إنشاء row جديد — كسر الـ strict-serializability الـ specific للـ retry idempotency — network retry لن يُسجّل مرتين.
- **Overpayment guard**: لو `requested.greaterThan(outstanding)` ⇒ throw `ConflictException` بـ **HTTP 409** والـ message localized raw (يتعرض كما هو في الـ frontend Arabic+English banner).
- مجمَّع في `prisma.$transaction`:
  1. قفل الـ target invoice (`SELECT … WHERE id = invoiceId AND companyId = companyId AND deletedAt IS NULL FOR UPDATE`-equivalent عبر الـ Prisma tx isolation).
  2. إنشاء الـ payment row.
  3. Writeback على `sales_invoices.paidAmount` = `previousPaidAmount + requestedAmount` (tolerant لـ concurrent partials — rigorously ordered).
- **SalesInvoice.status لا يتغيّر**: الـ `status` الـ enum (`DRAFT | ISSUED | CANCELLED`) الـ three-state-locked من Phase 4F-3 يبقى كما هو — الـ phase 10A لا تُدخل `PAID` ولا `PARTIALLY_PAID`. الـ clients يقرأون الـ "settlement نسبة" عبر `outstanding / total` فقط.
- Audit fields populated (`createdById` من الـ JWT).

### Frontend (Phase 10A-C-code)

- File changed: `frontend/src/lib/api.ts` فقط + `frontend/src/app/sales/page.tsx` فقط — لا route جديد، لا component جديد، لا dependency جديدة.
- **Backend HTTP client (`api.ts`)**:
  - `listArPayments(invoiceId, params?: { fromDate?; toDate? })` → `GET`.
  - `createArPayment(invoiceId, data: CreateArPaymentInput)` → `POST`.
  - Types: `ArPayment`، `CreateArPaymentInput`، `ArPaymentInvoiceTypeKey`، `ArPaymentStatusKey` — تطابق الـ polymorphic backend response shape بالكامل.
- **Sales page (`/sales`)**:
  - Imports: `ArPayment, CreateArPaymentInput, ArPaymentStatusKey, PaymentMethod` (الجديد فقط).
  - Permission gates: `canReadArPayments = hasPermission('ar_payments.read')`، `canWriteArPayments = hasPermission('ar_payments.write')` — JWT-claim driven.
  - State hooks: `openPaymentsInvoiceId`، `paymentsByInvoice`، `paymentsLoadingByInvoice`، `paymentsErrByInvoice`، `paymentFormByInvoice`، `paymentSubmittingByInvoice`، `paymentSuccessByInvoice`.
  - Helpers: `loadArPayments(invoiceId)`، `onTogglePayments(invoiceId)`، `setPaymentForm(invoiceId, patch)`، `onSubmitPayment(e, invoiceId, inv)`.
  - Per-row UX (inline expander، لا modal، لا sub-route):
    - الـ actions cell يعرض زر `المدفوععات (N)` إذا `ISSUED && canReadArPayments` (تعداد الـ payments المحفوظ في الـ state cache يمكن أن يكون 0 قبل الـ first toggle).
    - عند الـ toggleفتـح: sub-table تحوي amount + paymentMethod + paidAt + reference + status + localized status pills (`مُرحَّل` / `ملغى`) — فيهم loading / error / empty-state banners.
    - إذا `canWriteArPayments`: render-payment form مع amount + paymentMethod `<select>` (CASH / CARD / TRANSFER / OTHER) + paidAt date input + reference + notes textarea + submit.
    - كل submit محاولة يولّد `crypto.randomUUID()` client-side للـ Idempotency-Key — يُسجَّل تلقائياً بدون حقل مرئي (الـ server short-circuits على الـ duplicate).
    - Submit mapping:
      - 200/201 → reload الـ cached list + reset form + success banner.
      - **409** → "تجاوز السقف" + الـ raw server message في الـ banner.
      - **403** → "لا تملك صلاحية تسجيل المدفوعات".
      - **401** → "انتهت الجلسة".
      - **400** → "بيانات غير صحيحة".
      - أي error آخر → generic message ثابت بدون crash.

### Verification invariant (Phase 10A-D-1)

- `pnpm --filter @erp/backend build` ⇒ `nest build` exit 0.
- `pnpm --filter @erp/backend test:e2e` ⇒ **Tests: 121 passed, 121 total** (كل 4 الـ AR payments smoke tests في `describe('Phase 10A-B-3')` بعد الـ 8 الـ Phase 1 smoke الـ + الـ 6 reports الـ 7B-6 + الـ AP aging الـ 9E-B-3):
  - `it('1a) GET list 200 على ISSUED invoice w/ read perm')` ⇒ status 200 + array مع row واحد على الأقل.
  - `it('1b) GET 403 بـ cashier JWT (no ar_payments.read)` ⇒ status 403.
  - `it('2a) POST 200/201 w/ write perm → row landed, idempotencyKey matched')` ⇒ status 200/201 + response shape + DB row created.
  - `it('2b) POST 409 overpayment (requested.greaterThan(outstanding))` ⇒ status 409.
  - `it('2c) POST idempotency short-circuit (duplicate idempotencyKey)` ⇒ status 200/201 + الـ existing row وليس row جديد.
  - `it('3a) POST 404 على invoice غير موجود` ⇒ status 404.
- `pnpm --filter @erp/frontend build` ⇒ Next.js 14.2.35 compiled SUCCESS، 15/15 static pages generated، route `/sales = 6.51 kB / 106 kB First Load JS` (+0.04 kB vs Phase 9E-C-code).
- HEAD عند الـ Phase 10A-D-1: `274b4651d15ecb853a676bf8faa7751f5076af50` (لا drift).

### Out of scope (Phase 10A — explicit)

- **لا AP payments** — الـ PurchaseInvoice side يُغطَّى في Phase 10B المنفصلة (الـ polymorphic `purchaseInvoiceId` column موجود في الـ schema ولكن لا endpoint ولا permission ولا controller ولا frontend wiring في Phase 10A).
- **لا bank reconciliation** — لا matching بين الـ payment rows والـ bank statements ولا import statements ولا manual reconciliation UI.
- **لا GL posting** — لا auto-posting للـ payments على الـ journal — الـ Payment row خارج الـ lineup الـ Phase 6 accounting module.
- **لا PAID / PARTIALLY_PAID status enum** — الـ `SalesInvoice.status` يبقى الـ three-state-locked من Phase 4F-3 (`DRAFT | ISSUED | CANCELLED`). الـ "settlement نسبة" يُحسب client-side عبر `outstanding / total` فقط، ولا يُضاف enum value جديد.
- **لا customer statements** — لا endpoint `/api/partners/:id/account-statement` ولا drill-down route على الـ customer side ولا aggregated rows في الـ Phase 10A.
- **لا deployment** — ولا Cloudflare Pages ولا hosted deploy ولا hosted identity ولا Docker Compose orchestration change. Local Docker Compose + local NestJS + local Next.js فقط.

### Hard prohibitions honored (Phase 10A)

- لا skills مُشغَّلة أو مُستدعاة في الـ loop الكامل (10A-B-1 → 10A-D-2).
- لا cloudflare / workers / wrangler / OAuth / external auth / hosted deploy / hosted identity.
- لا `git add .` ولا `git add -A` — كل الـ commits الـ 4 في phase-10a يستخدمون `git add <file>...` صراحةً.
- لا cf-byok-deploy / designer-handoff / gsk-hosted-deploy / gsk-hosted-identity skill activation.
- لا تغيير على الـ access control: نفس الـ JWT-claim server-side (`@RequirePermissions`) + client-side (`hasPermission`) الـ split؛ لا fallback في الـ app JavaScript.
- لا extensions لكتلة أخرى: لا AP ولا GL ولا notifications ولا multi-currency ولا charts ولا customer drill-down.
- لا invoice lifecycle changes — الـ `paidAmount` writeback الـ عبر الـ transaction هو الـ الوحيد الـ mutation على الـ `SalesInvoice`، الـ status يبقى.

### Recommendation

**Phase 10A (AR Payments + Settlement Tracking) انتهت** على مستوى:

- `10A-B-1` (skeleton: `payments.controller.ts` + `create-payment.dto.ts` + `@RequirePermissions('ar_payments.read' | 'ar_payments.write')`) و `10A-B-2` (settlement logic: `payments.service.ts` بـ Prisma `$transaction` + Prisma.Decimal arithmetic + 409 overpayment guard + idempotency short-circuit + writeback على `SalesInvoice.paidAmount` + status unchanged) و `10A-B-3` (smoke tests: 6 tests في الـ `describe('Phase 10A-B-3')` block تغطي GET 200/403 + POST 200/201/409/404 + idempotency duplicate + tenant isolation) — backend.
- `10A-C-code` (frontend wiring: `api.listArPayments(invoiceId, params?)` + `api.createArPayment(invoiceId, payload)` + 4 AR-payment polymorphic types في `frontend/src/lib/api.ts` + inline expander في `/sales` page مع payments list + register-payment form + `crypto.randomUUID()` للـ Idempotency-Key per submit + 409-styled Arabic overlay + 401/403/400/200 mapping + per-row toggle بدون route جديد) — frontend.
- `10A-D-1` (verification: working tree clean، HEAD = `274b4651`، scope limited إلى frontend changes فقط، backend build PASS، backend e2e PASS = 121/121، frontend build PASS) و `10A-D-2` (README closure: هذا الـ commit).

كل الـ computed values (`outstanding`، `requested.amount`، partial-sum، writeback `paidAmount`) تأتي من الـ Prisma.Decimal arithmetic في الـ backend عبر JS — لا `Number()` في الـ math path. الـ permissions اثنتان فقط (`ar_payments.read` + `ar_payments.write`)، tenant isolation من JWT فقط، الـ polymorphic invariant مُطبَّق بـ CHECK constraint.

كل الـ 4 commits في phase-10a مستقلة النطاق:
- `10A-B-1` → `backend/src/payments/{payments.module,payments.controller,dto/create-payment.dto}.ts` + `backend/prisma/schema.prisma` (Payment model) + `backend/prisma/migrations/20260908215449_phase10a_payments/`.
- `10A-B-2` → `backend/src/payments/payments.service.ts`.
- `10A-B-3` → `backend/test/reports.e2e-spec.ts` (6 tests داخل الـ `describe('Phase 10A-B-3')`).
- `10A-C-code` → `frontend/src/lib/api.ts` و `frontend/src/app/sales/page.tsx`.
- `10A-D-2` → `README.md` فقط (هذا الـ commit).

→ Phase 10A closure verified. Phase 10A-D-2 (README update) sealed.

## Phase 10B: AP Payments + Settlement Tracking

AP Payments هي طبقة **settlement** الـ على الـ `PurchaseInvoice` side — تسجيل الـ payments الـ suppliers على الـ `PurchaseInvoice` الـ `RECEIVED`، مع idempotency short-circuit + overpayment guard + **runtime outstanding** عبر `SUM(Payment.amount WHERE purchaseInvoiceId = id AND status = 'POSTED')` — **لا** writeback على `PurchaseInvoice` (الـ schema لا يحوي `paidAmount` column للـ `PurchaseInvoice`، الـ outstanding يُحسب via aggregation في الـ read path تماماً مثل الـ Phase 9E للـ AP aging).

### Commits الـ 4 (الكود) + 10B-D-2 (README) في phase-10b

```
0fd8858 feat(phase-10b): wire AP payments into purchases frontend      ← Phase 10B-C-code
1348260 test(phase-10b): add AP payments e2e smoke                     ← Phase 10B-B-3
5fd9649 feat(phase-10b): add AP payments settlement logic               ← Phase 10B-B-2
ef5ac43 feat(phase-10b): add AP payments skeleton                       ← Phase 10B-B-1
```

### Schema state at Phase 10B start

- **لا schema change في 10B-B-1 / 10B-B-2 / 10B-B-3 / 10B-C-code**. الـ `Payment` model موجود من الـ Phase 10A-B-1:
  - `purchaseInvoiceId: String?` polymorphic FK → `purchase_invoices.id`، `onDelete: SetNull`.
  - `invoiceType: PaymentInvoiceType` enum (`SALES` | `PURCHASE`) — Phase 10B يحرس على `PURCHASE` فقط في الـ service.
  - الـ polymorphic CHECK constraint (exactly one of `salesInvoiceId`/`purchaseInvoiceId` non-null) من الـ 10A-B-1 ما زال يُطبَّق بدون تغيير.
- **`PurchaseInvoice` لا يحوي `paidAmount` column** — verified (سطر 507 من `backend/prisma/schema.prisma`): الـ fields هي `subtotal`, `vatTotal`, `discountTotal`, `total` فقط. **لا** migration جديد في Phase 10B، **لا** `paidAmount` field، **لا** enum value change على `PurchaseInvoiceStatus`.
- **لا writeback** على الـ `PurchaseInvoice` في الـ POST transaction — الـ outstanding يُحسب في الـ GET path + الـ overpayment guard في الـ POST path عبر runtime SUM aggregation.

### Permissions (RBAC — Phase 10B-B-1)

- `ap_payments.read` — مطلوب لـ `GET /api/purchase-invoices/:invoiceId/payments`.
- `ap_payments.write` — مطلوب لـ `POST /api/purchase-invoices/:invoiceId/payments`.
- مفصولتين عن الـ existing catalog وعن `ar_payments.{read,write}` (الـ AR mirror)، ولا يُضاف أي permission إضافي (الـ permission set من الـ 10A-B-1 + 6 permissions الـ AP = 58 + 4 = 62، الـ AP payments هما الـ +2 الإضافيّتان).
- Server enforcement عبر `@RequirePermissions(...)` decorator + `PermissionsGuard` (الـ existing — لا guard جديد).
- Client-side mirror عبر `useAuth().hasPermission('ap_payments.read' | 'ap_payments.write')` يقرأ من الـ `state.user.permissions` JWT claim — نفس الـ split الـ موجود في الـ AR side والـ Phase 9 reports.

### Endpoints (Phase 10B-B-2)

```
GET  /api/purchase-invoices/:invoiceId/payments
POST /api/purchase-invoices/:invoiceId/payments
```

كلاهما tenant-scoped (`companyId` من الـ JWT فقط — لا companyId من الـ URL أو الـ body)، polymorphic guarded على `invoiceType = PURCHASE` فقط في الـ Phase 10B (الـ combined-list coverage = phase لاحقة).

#### GET behavior

- يعرض قائمة الـ payments لـ `:invoiceId` (الـ `purchaseInvoiceId` polymorphic alias في الـ response — نفس الـ `toResponseRow()` الـ مستعمل في الـ AR side).
- Query filters: `fromDate` (yyyy-mm-dd) و `toDate` (yyyy-mm-dd) — يطبَّق على `paidAt` فقط.
- Sort: `paidAt DESC`، ثم `createdAt DESC` داخل الـ ties.
- Tenant isolation: `companyId` من الـ JWT فقط عبر `where.companyId = companyId`.
- Response: array من الـ polymorphic `PaymentResponseRow` mapped عبر `toResponseRow()` — الـ `id`، `invoiceId` (= purchaseInvoiceId alias)، `invoiceType` enum (`PURCHASE`)، `amount` (string — Decimal-as-string) ، `paymentMethod` enum، `paidAt` ISO string، `reference | null`، `notes | null`، `status` enum، `idempotencyKey | null`، `createdAt` ISO string.
- Status guard: لا يُمنع الـ GET على الـ payments الـ cancelled (`deletedAt IS NULL` filter فقط)؛ الـ invoice-self status guard (`RECEIVED`) لا يطبَّق على الـ GET (الـ GET مسموح على الـ DRAFT والـ CANCELLED الـ receivable حداً ادنى لرؤية الـ history) في الـ Phase 10B.

#### POST behavior

- **Invoice must be RECEIVED**: الـ DRAFT والـ CANCELLED يرفضون الـ POST بـ `BadRequestException` (HTTP 400) والـ message localized raw — الـ settlement لا يبدأ على invoice غير مُسلَّم.
- **Partial payments مسموحة**: `amount` request لا يجب أن يغطي الـ outstanding كاملاً في الـ call واحدة — multiple POST calls متتالية مسموحة طالما كل واحدة ≤ `outstanding`.
- **Outstanding computation (Phase 10B — distinct من AR)**:
  - `outstanding = max(0, Prisma.Decimal(invoice.total) - Prisma.Decimal(SUM(payments.amount WHERE purchaseInvoiceId = id AND deletedAt IS NULL AND status = 'POSTED')))`.
  - الـ `SUM` ينفَّذ داخل الـ `prisma.$transaction` عبر `prisma.payment.aggregate({ _sum: { amount: true }, where: { purchaseInvoiceId, companyId, deletedAt: null, status: 'POSTED' } })`.
  - الـ `Prisma.Decimal` arithmetic في الـ service عبر `decimalToString` — لا `Number()` في الـ math path.
- **Idempotency-Key**: optional، string بطول 8..128 (نفس الـ DTO validator في الـ AR side). الـ service يعمل short-circuit **before the transaction**: لو في payment active (`deletedAt IS NULL`) بنفس الـ `(companyId, purchaseInvoiceId, idempotencyKey)`, يرجعه كما هو بدل إنشاء row جديد.
- **Overpayment guard**: لو `requested.greaterThan(outstanding)` ⇒ throw `ConflictException` بـ **HTTP 409** والـ message localized raw (يتعرض كما هو في الـ frontend Arabic+English banner).
- مجمَّع في `prisma.$transaction`:
  1. قفل الـ target invoice (`SELECT … WHERE id = invoiceId AND companyId = companyId AND deletedAt IS NULL FOR UPDATE`-equivalent عبر الـ Prisma tx isolation).
  2. إعادة حساب الـ outstanding (read-after-write path، يحمي من race conditions) — لو الـ outstanding < الـ requested ⇒ abort transaction بـ 409.
  3. إنشاء الـ payment row (مع `invoiceType = 'PURCHASE'` و `purchaseInvoiceId` polymorphic FK).
  4. **لا writeback** على `PurchaseInvoice` (الـ schema لا يحوي `paidAmount`).
- **`PurchaseInvoice.status` لا يتغيّر**: الـ `status` الـ enum (`DRAFT | RECEIVED | CANCELLED`) الـ three-state-locked من Phase 5A يبقى كما هو — الـ phase 10B لا تُدخل `PAID` ولا `PARTIALLY_PAID`. الـ clients يقرأون الـ "settlement نسبة" عبر `outstanding / total` فقط.
- Audit fields populated (`createdById` من الـ JWT).

### Frontend (Phase 10B-C-code)

- File changed: `frontend/src/lib/api.ts` فقط + `frontend/src/app/purchases/page.tsx` فقط — لا route جديد، لا component جديد، لا dependency جديدة.
- **Backend HTTP client (`api.ts`)**:
  - `listApPayments(invoiceId, params?: { fromDate?; toDate? })` → `GET`.
  - `createApPayment(invoiceId, data: CreateApPaymentInput)` → `POST`.
  - Types: `ApPayment`، `CreateApPaymentInput`، `ApPaymentInvoiceTypeKey`، `ApPaymentStatusKey` — تطابق الـ polymorphic backend response shape بالكامل (mirror-types للـ AR side).
- **Purchases page (`/purchases`)**:
  - Imports: `ApPayment, CreateApPaymentInput, ApPaymentStatusKey, PaymentMethod` (الجديد فقط — الـ AR imports تبقى كما هي).
  - Permission gates: `canReadApPayments = hasPermission('ap_payments.read')`، `canWriteApPayments = hasPermission('ap_payments.write')` — JWT-claim driven.
  - State hooks: `openApPaymentsInvoiceId`، `apPaymentsByInvoice`، `apPaymentsLoadingByInvoice`، `apPaymentsErrByInvoice`، `apPaymentFormByInvoice`، `apPaymentSubmittingByInvoice`، `apPaymentSuccessByInvoice` (الـ AP-prefixed الـ mirror للـ AR state).
  - Helpers: `loadApPayments(invoiceId)`، `onToggleApPayments(invoiceId)`، `setApPaymentForm(invoiceId, patch)`، `onSubmitApPayment(e, invoiceId, inv)`.
  - Per-row UX (inline expander، لا modal، لا sub-route):
    - الـ actions cell يعرض زر `مدفوععات المورد (N)` إذا `RECEIVED && canReadApPayments` (الـ DRAFT والـ CANCELLED لا يعرضون زر الـ payments — الـ POST guard).
    - عند الـ toggle فتـح: sub-table تحوي amount + paymentMethod + paidAt + reference + status + localized status pills (`مُرحَّل` / `ملغى`) — فيهم loading / error / empty-state banners.
    - إذا `canWriteApPayments && status === 'RECEIVED'`: render-payment form مع amount + paymentMethod `<select>` (CASH / CARD / TRANSFER / OTHER) + paidAt date input + reference + notes textarea + submit.
    - كل submit محاولة يولّد `crypto.randomUUID()` client-side للـ Idempotency-Key — يُسجَّل تلقائياً بدون حقل مرئي (الـ server short-circuits على الـ duplicate).
    - Submit mapping:
      - 200/201 → reload الـ cached list + reset form + success banner.
      - **409** → "تجاوز سقف الـ outstanding" + الـ raw server message في الـ banner.
      - **403** → "لا تملك صلاحية تسجيل مدفوععات المورد".
      - **400** → "بيانات غير صحيحة أو الـ invoice في status غير RECEIVED".
      - **401** → "انتهت الجلسة".
      - أي error آخر → generic message ثابت بدون crash.

### Verification invariant (Phase 10B-D-1)

- `pnpm --filter @erp/backend build` ⇒ `nest build` exit 0.
- `pnpm --filter @erp/backend test:e2e` ⇒ **Tests: 129 passed, 129 total`** (الـ 4 الـ AR smoke في الـ 10A-B-3 + الـ 4 الـ AP smoke في الـ 10B-B-3 + الـ 8 الـ Phase 1 smoke الـ + الـ 6 reports الـ 7B-6 + الـ AP aging الـ 9E-B-3 + الـ leftover aligns):
  - `it('1a) GET list 200 على RECEIVED invoice w/ read perm')` ⇒ status 200 + array مع row واحد على الأقل.
  - `it('1b) GET 403 بـ cashier JWT (no ap_payments.read)` ⇒ status 403.
  - `it('2a) POST 200/201 w/ write perm على RECEIVED invoice → row landed, idempotencyKey matched')` ⇒ status 200/201 + response shape + DB row created.
  - `it('2b) POST 409 overpayment (requested.greaterThan(outstanding))` ⇒ status 409.
  - `it('2c) POST idempotency short-circuit (duplicate idempotencyKey)` ⇒ status 200/201 + الـ existing row وليس row جديد.
  - `it('2d) POST 400 على DRAFT invoice (status !== RECEIVED)` ⇒ status 400.
  - `it('3a) POST 404 على invoice غير موجود` ⇒ status 404.
- `pnpm --filter @erp/frontend build` ⇒ Next.js 14.2.35 compiled SUCCESS، 13/13 static pages generated، route `/purchases = 6.2 kB / 106 kB First Load JS` (symmetric مع الـ AR route).
- HEAD عند الـ 10B-D-1: `0fd8858d204887b84653b4a328b908f74320f757` (لا drift).

### Out of scope (Phase 10B — explicit)

- **لا GL posting** — لا auto-posting للـ payments على الـ journal — الـ Payment row خارج الـ lineup الـ Phase 6 accounting module تماماً مثل الـ AR side.
- **لا bank reconciliation** — لا matching بين الـ payment rows والـ bank statements ولا import statements ولا manual reconciliation UI.
- **لا supplier statements** — لا endpoint `/api/partners/:id/account-statement` ولا drill-down route على الـ supplier side ولا aggregated rows.
- **لا PAID / PARTIALLY_PAID status enum** — الـ `PurchaseInvoice.status` يبقى الـ three-state-locked من Phase 5A (`DRAFT | RECEIVED | CANCELLED`). الـ "settlement نسبة" يُحسب client-side عبر `outstanding / total` فقط، ولا يُضاف enum value جديد.
- **لا PurchaseInvoice.paidAmount column** — الـ schema **لم** يستقبل `paidAmount` على الـ AP side في الـ Phase 10B؛ الـ outstanding يُحسب runtime عبر SUM Aggregation في الـ backend تماماً مثل الـ Phase 9E الـ AP aging، والـ frontend يحسب نفس الـ النسبة client-side.
- **لا schema changes** — لا `prisma migrate dev` ولا `schema.prisma` edit ولا migration جديد؛ الـ `Payment` model موجود من الـ Phase 10A-B-1 (`purchaseInvoiceId` polymorphic FK + الـ CHECK constraint تضبط exactly-one-of invariant).
- **لا deployment** — ولا Cloudflare Pages ولا hosted deploy ولا hosted identity ولا Docker Compose orchestration change. Local Docker Compose + local NestJS + local Next.js فقط.

### Hard prohibitions honored (Phase 10B)

- لا skills مُشغَّلة أو مُستدعاة في الـ loop الكامل (10B-B-1 → 10B-D-2).
- لا cloudflare / workers / wrangler / OAuth / external auth / hosted deploy / hosted identity.
- لا `git add .` ولا `git add -A` — كل الـ commits الـ 4 الكود في phase-10b يستخدمون `git add <file>...` صراحةً، والـ 10B-D-2 يستخدم `git add README.md` صراحةً.
- لا cf-byok-deploy / designer-handoff / gsk-hosted-deploy / gsk-hosted-identity skill activation.
- لا تغيير على الـ access control: نفس الـ JWT-claim server-side (`@RequirePermissions`) + client-side (`hasPermission`) الـ split؛ لا fallback في الـ app JavaScript.
- لا extensions لكتلة أخرى: لا AR ولا GL ولا notifications ولا multi-currency ولا charts ولا customer drill-down.
- لا invoice lifecycle changes — لا writeback على `PurchaseInvoice` (الـ outstanding يكون runtime subtraction على الـ SUM(Payment.amount))، والـ status (`DRAFT | RECEIVED | CANCELLED`) يبقى.

### Recommendation

**Phase 10B (AP Payments + Settlement Tracking) انتهت** على مستوى:
- `10B-B-1` (skeleton: `payments.controller.ts` و الـ polymorphic route paramater `:invoiceId` للـ `purchase-invoices` + `create-payment.dto.ts` الـ shared مع الـ AR + `@RequirePermissions('ap_payments.read' | 'ap_payments.write')` للـ AP routes) و `10B-B-2` (settlement logic: `payments.service.ts` بـ Prisma `$transaction` + Prisma.Decimal arithmetic + 409 overpayment guard + 400 not-`RECEIVED` guard + idempotency short-circuit + runtime outstanding via SUM aggregation **بدون** `PurchaseInvoice.paidAmount` column + status unchanged) و `10B-B-3` (smoke tests: 4 tests في الـ `describe('Phase 10B-B-3')` block تغطي GET 200/403 + POST 200/201/409/404/400 + idempotency duplicate + tenant isolation + not-`RECEIVED` guard) — backend.
- `10B-C-code` (frontend wiring: `api.listApPayments(invoiceId, params?)` + `api.createApPayment(invoiceId, payload)` + 4 AP-payment polymorphic types في `frontend/src/lib/api.ts` + inline expander في `/purchases` page مع payments list + register-payment form مع `RECEIVED`-only gate + `crypto.randomUUID()` للـ Idempotency-Key per submit + 409-styled Arabic overlay + 401/403/400/200 mapping + per-row toggle بدون route جديد) — frontend.
- `10B-D-1` (verification: working tree clean، HEAD = `0fd8858d2`، scope limited إلى frontend changes فقط، backend build PASS، backend e2e PASS = 129/129، frontend build PASS) و `10B-D-2` (README closure: هذا الـ commit).

كل الـ computed values (`outstanding`، `requested.amount`، partial-sum، runtime `SUM(Payment.amount)`) تأتي من الـ Prisma.Decimal arithmetic في الـ backend عبر JS — لا `Number()` في الـ math path. الـ permissions اثنتان فقط (`ap_payments.read` + `ap_payments.write`)، tenant isolation من JWT فقط، الـ polymorphic invariant مُطبَّق بـ CHECK constraint من الـ 10A-B-1 ولم يتغيّر.

كل الـ 4 commits الـ كود في phase-10b مستقلة النطاق:
- `10B-B-1` → `backend/src/payments/{payments.module,payments.controller,dto/create-payment.dto}.ts` (الـ AP routes الـ polymorphic + الـ AP permissions الـ `ap_payments.{read,write}`).
- `10B-B-2` → `backend/src/payments/payments.service.ts` (الـ AP settlement logic مع runtime outstanding).
- `10B-B-3` → `backend/test/reports.e2e-spec.ts` (الـ 4 tests داخل الـ `describe('Phase 10B-B-3')`).
- `10B-C-code` → `frontend/src/lib/api.ts` و `frontend/src/app/purchases/page.tsx`.
- `10B-D-2` → `README.md` فقط (هذا الـ commit).

→ Phase 10B closure verified. Phase 10B-D-2 (README update) sealed.

## Phase 11A: General Ledger Foundation

Phase 11A هي **foundation layer** لـ General Ledger فوق الـ Phase 6 Accounting Core الموجود مسبقاً — بدون duplicate schema، بدون توسيع في الـ journal domain، وبدون posting تلقائي من الـ AR / AP / Payments. الـ scope محصور في: GL RBAC skeleton، hardening الـ posting/cancel helpers، backend e2e smoke، wiring الـ permissions على الـ controller، وصفحة frontend للقراءة فقط — كل ذلك **read-side-first**، **single-domain**، **localhost ERP** بدون أي deployment.

### Family

- `11A-PLAN`: docs-first scoping — `docs/PHASE_11A_GL_PLAN.md` (12744 حرف).
- `11A-B-1`: backend RBAC permission skeleton — 3 permissions جديدة، seed migration on conflict no-op.
- `11A-B-2`: backend hardening — 4 helpers (`computeJournalTotals`، `validateJournalBalances`، `ensureJournalEntryCanPost`، `ensureJournalEntryCanCancel`) مع `asserts` predicate narrowing.
- `11A-B-3`: backend e2e smoke — 9 tests داخل `describe('Phase 11A-B-3: GL posting hardening (e2e smoke)')`.
- `11A-B-4`: controller wiring — إعادة تسمية 6 decorators إلى `gl_accounts.read` / `gl_journal.read` / `gl_journal.write`.
- `11A-C-code`: frontend read-only page — `/accounting/gl`، permissions gating، loading/error/empty banners، بدون forms/buttons/write paths.
- `11A-D-1`: final verification only — no commits، no edits، no pushes؛ build + e2e regression check.
- `11A-D-2`: README update and final closure (هذا الـ commit).

### Conventional Commits على `main`

```
b9b8221 feat(phase-11a): add GL frontend read-only view          ← Phase 11A-C-code
3b69d66 feat(phase-11a): wire GL RBAC permissions                ← Phase 11A-B-4
d993e54 test(phase-11a): add GL backend e2e smoke                 ← Phase 11A-B-3
bfe9377 feat(phase-11a): harden GL posting logic                  ← Phase 11A-B-2
a8f0069 feat(phase-11a): add GL RBAC permission skeleton          ← Phase 11A-B-1
4e65d73 docs(phase-11a): add GL architecture plan                 ← Phase 11A-PLAN
```

### Reused Phase 6 models — لا duplicate GL schema

Phase 11A **لم** يضيف أي model جديد في الـ Prisma schema. الـ General Ledger foundation موجود أصلاً من الـ Phase 6 (Accounting Core) والـ phase الحالي يستخدم الـ existing models كما هي، بدون أي تكرار أو migration:

- `Account` — الـ chart of accounts: `id`، `code`، `name`، `type` (`AccountType` enum)، `normalBalance` (`NormalBalance` enum)، `companyId`، soft-delete filter (`deletedAt`).
- `JournalEntry` — الـ header: `id`، `companyId`، `entryDate`، `description`، `status` (`JournalEntryStatus` enum)، + الـ audit + soft-delete fields.
- `JournalEntryLine` — الـ debit/credit legs: `id`، `journalEntryId`، `accountId`، `debit`، `credit`، تمامها `Prisma.Decimal @db.Decimal(18, 4)`، لا Number.
- `JournalEntryStatus` enum محفوظ كما هو: **`DRAFT`** | **`POSTED`** | **`CANCELLED`** — لا `REVERSED` ولا `VOID` ولا أي enum value إضافي.
- `AccountType` enum محفوظ كما هو (`ASSET` | `LIABILITY` | `EQUITY` | `REVENUE` | `EXPENSE`).
- `NormalBalance` enum محفوظ كما هو (`DEBIT` | `CREDIT`).

### DB / Prisma changes

- **لا schema change** في الـ Phase 11A كاملاً — لا `prisma migrate dev`، لا `schema.prisma` edit، لا column جديد، لا enum value جديد، لا model جديد.
- الـ migration الوحيد في الـ phase هو **seed-only**: `backend/prisma/migrations/20260909120000_phase11a_gl_permissions/migration.sql` يحوي **3 INSERTs فقط** على الـ `permissions` table مع `ON CONFLICT DO NOTHING`:
  - `gl_accounts.read`
  - `gl_journal.read`
  - `gl_journal.write`
- الـ seed ستجلب هذه الـ 3 permissions إلى الـ role `company_admin` فقط (بنفس الـ pattern الـ existing من Phase 1+2+3+4+5+6+7+8+9+10).
- لا writeback على الـ `SalesInvoice` ولا الـ `PurchaseInvoice` ولا الـ `Payment` — الـ General Ledger **read-only** في هذه الـ phase.

### Permissions (RBAC — Phase 11A-B-1 + 11A-B-4)

الـ permissions الجديدة **3 فقط**، مفصولات عن الـ AR/AP/payments catalog، ولا تُضيف أي permission إضافي خارج هذه الـ الثلاث:

| Permission key | يُستخدم على | الـ HTTP method | الـ Scope |
|-----------------|---------------|------------------|-----------|
| `gl_accounts.read` | `GET /api/accounting/accounts` + `GET /api/accounting/accounts/:id` (.read back-compat) | GET endpoints | fetch chart of accounts |
| `gl_journal.read` | `GET /api/journal` + `GET /api/journal/:id` (.read back-compat) | GET endpoints | list + read journal entries |
| `gl_journal.write` | `POST /api/journal` + `PATCH /api/journal/:id` + `POST /api/journal/:id/post` + `POST /api/journal/:id/cancel` | write endpoints | create / edit / post / cancel |

- Server enforcement عبر الـ existing `@RequirePermissions(...)` decorator + الـ existing `PermissionsGuard` (لا guard جديد).
- Client-side mirror عبر `useAuth().hasPermission('gl_accounts.read' | 'gl_journal.read' | 'gl_journal.write')` يقرأ من الـ `state.user.permissions` JWT claim — نفس الـ split الـ الموجود في الـ prior phases.
- الـ decorator rewires على `accounting.controller.ts` (6 methods) تم في الـ Phase 11A-B-4 — دون تغيير في الـ routes count ولا في الـ DTOs ولا في الـ response shapes.

### Backend hardening (Phase 11A-B-2 — Fork A)

أضيفت 4 helpers على `accounting.service.ts` (بدون تغيير في الـ controller signatures ولا في الـ DTOs):

1. **`computeJournalTotals(entry)`** — يحسب `totalDebit` و `totalCredit` عبر `Prisma.Decimal` arithmetic حصراً؛ لا `Number()` في الـ math path.
2. **`validateJournalBalances(entry)`** — يتحقق `totalDebit.equals(totalCredit)` على الـ precision-exact level؛ يرمي `BadRequestException` لو غير متوازن.
3. **`ensureJournalEntryCanPost(entry)`** — مع `asserts entry is { id: string; status: JournalEntryStatus }` return-type narrowing (يحلّ `TS18047` null narrowing في الـ helper body):
   - يقبل `DRAFT` فقط.
   - يرفض `POSTED` بـ `ConflictException`.
   - يرفض `CANCELLED` بـ `ConflictException` — تماماً مثل الـ Phase 6 contract.
4. **`ensureJournalEntryCanCancel(entry)`** — مع نفس الـ `asserts` predicate:
   - يقبل `DRAFT` (يرجع للـ DRAFT — لا mutation).
   - يرفض `CANELLED` بـ `ConflictException`.
   - يرفض `POSTED` بـ `ConflictException` وبالـ message localized: **"Posted journal entries require reversing entries, which is out of scope in Phase 6"** — هذا هو الـ **Fork A**: الـ helper يحفظ الـ Phase 6 semantic contract بدلاً من توسيعه إلى reverse-entry logic (الـ reversal خارج النطاق).

#### Helpers — TypeScript `asserts` predicate narrowing

الـ returned type هو:

```ts
function ensureJournalEntryCanPost(entry: JournalEntry | null): asserts entry is { id: string; status: JournalEntryStatus };
function ensureJournalEntryCanCancel(entry: JournalEntry | null): asserts entry is { id: string; status: JournalEntryStatus };
```

هذا الـ pattern يسمح لـ TypeScript بأن يضيق الـ type بعد الـ guard call في الـ caller code — يحلّ `TS18047` بدون `as` casting ولا `if (entry === null) throw` boilerplate.

### Tests added (Phase 11A-B-3)

9 e2e smoke tests جديدة في `backend/test/app.e2e-spec.ts` داخل الـ `describe('Phase 11A-B-3: GL posting hardening (e2e smoke)')` block:

- `it('11A-B-3.1) GET /api/journal 401 w/o JWT')` — route guard لا JWT.
- `it('11A-B-3.2) GET /api/journal 403 w/ cashier JWT (no gl_journal.read)')` — RBAC guard.
- `it('11A-B-3.3) GET /api/journal 200 w/ accountant JWT (has gl_journal.read)')` — happy path.
- `it('11A-B-3.4) POST /api/journal 400 unbalanced lines (debit != credit)')` — helper `validateJournalBalances`.
- `it('11A-B-3.5) POST /api/journal/:id/post 409 على CANCELLED entry')` — `ensureJournalEntryCanPost` على CANCELLED.
- `it('11A-B-3.6) POST /api/journal/:id/post 409 على POSTED entry')` — `ensureJournalEntryCanPost` على POSTED.
- `it('11A-B-3.7) POST /api/journal/:id/post 200 على DRAFT entry balances correct')` — happy path للـ posting flow.
- `it('11A-B-3.8) POST /api/journal/:id/cancel 409 على POSTED entry (Fork A wording)')` — يحرس على الـ "reverse out of scope" message.
- `it('11A-B-3.9) POST /api/journal/:id/cancel 200 على DRAFT entry')` — happy path للـ cancel.

كل الـ 9 tests تستخدم:
- `company_admin` login JWT (company_admin يحوز على الـ 3 GL permissions من الـ seed).
- cashier JWT لا يحوز على الـ 3 permissions (يستخدم في الـ 403 cases).
- Prisma seeded fixtures (accounts + journal entries الـ created via direct service call في الـ `beforeAll`).

### Frontend route (Phase 11A-C-code)

ملف جديد فقط: `frontend/src/app/accounting/gl/page.tsx` (≈ 450 سطر) — صفحة Next.js client-side read-only مع:

- **Permission gates** على `gl_accounts.read` + `gl_journal.read` — إذا كلاهما غائب ⇒ صفحة access-denied banner بدلاً من crash.
- **Two data tables** جنب بعض:
  - `Accounts` table: `code`، `name`، `type` (Arabic + English labels)، `normalBalance` (Arabic + English labels) — من `api.listGlAccounts()`.
  - `Journal Entries` table: `entryDate`، `description`، `status` (Arabic pills للدالات الثلاث)، `lines[].accountCode + debit + credit` (sub-rows expand) — من `api.listGlJournalEntries()`.
- **لا forms، لا buttons، لا write paths** — الـ POST/PATCH/POST-id/post/POST-id/cancel paths **لم** تُربط على الـ frontend (خارج النطاق في الـ Phase 11A).
- **Loading + error + empty-state banners** لكلا الجدولين.
- **Decimal-as-string** serialization (الـ `Prisma.Decimal` القادم من الـ backend يُعرض كما هو بدون `Number()` — يحافظ على الـ precision).
- **Type aliases جديدة** في `frontend/src/lib/api.ts`:
  - `export type GlAccount = Account;`
  - `export type GlJournalEntry = JournalEntry;`
  - `export type GlJournalLine = JournalEntryLine;`
  - `export type GlListResponse<T> = Paginated<T>;`
- **Wrapper functions جديدة** في `frontend/src/lib/api.ts`: `listGlAccounts`، `listGlJournalEntries`.

### Security / tenancy (unchanged from Phase 1+2+3+4+5+6+7+8+9+10)

- `companyId` من `@CurrentUser() me.companyId` فقط — **لا** يقبل من الـ query ولا الـ body.
- `@UseGuards(JwtAuthGuard, PermissionsGuard)` global على `AccountingController` يغطي الـ 6 الـ rewired methods تلقائياً.
- الـ 6 methods مقيَّدة بـ `@RequirePermissions(...)` بعد الـ Phase 11A-B-4 rewires:
  - `GET /accounts` → `gl_accounts.read`.
  - `GET /accounts/:id` → `accounting.read` (preserved للـ backwards-compat).
  - `POST /accounts` → `accounting.accounts.create` (preserved).
  - `PATCH /accounts/:id` → `accounting.accounts.update` (preserved).
  - `DELETE /accounts/:id` → `accounting.accounts.delete` (preserved).
  - `GET /journal` → `gl_journal.read`.
  - `GET /journal/:id` → `accounting.read` (preserved).
  - `POST /journal` → `gl_journal.write`.
  - `PATCH /journal/:id` → `gl_journal.write`.
  - `POST /journal/:id/post` → `gl_journal.write`.
  - `POST /journal/:id/cancel` → `gl_journal.write`.
- `Prisma.Decimal` arithmetic حصراً في الـ 4 الـ helpers الجديدة؛ `Number()` في أي math path الحسابي **ممنوع**.
- لا `companyId` من الـ URL أو الـ form body.
- لا tokens في `localStorage` / `sessionStorage`.
- لا mutation من الـ frontend على الـ journal — الـ GET فقط.

### Backend e2e regression invariant (Phase 11A — final)

- `pnpm --filter @erp/backend build` ⇒ `nest build` exit 0 — **PASS**.
- `pnpm --filter @erp/backend test:e2e` ⇒ **Tests: 138 passed, 138 total** (Post 11A-B-3، ثابت على 11A-D-1 و 11A-D-2):
  - `test/app.e2e-spec.ts` يحوي الـ 9 tests الـ GL hardening الـ الجديدة داخل `describe('Phase 11A-B-3: GL posting hardening (e2e smoke)')`.
  - 2 test suites passing، 138 tests passing، 0 failing، 0 flake.

### Frontend build invariant (Phase 11A)

- `pnpm --filter @erp/frontend build` ⇒ Next.js 14.2.35 compiled SUCCESS — **PASS**.
- Route table ازداد بـ 1 route جديدة: `/accounting/gl` (= 17 routes ثابتة كما في الـ Phase 10A-D-1 + الـ `/accounting/gl` route).
- `/accounting/gl = 2.77 kB / 102 kB First Load JS`.
- لا `-warn` ولا `-error` على الـ build log.

### Hard prohibitions honored (Phase 11A)

- لا skills مُشغَّلة أو مُستدعاة في الـ loop الكامل (11A-PLAN → 11A-D-2).
- لا cloudflare / workers / wrangler / OAuth / external auth / hosted deploy / hosted identity.
- لا schema change — لا `prisma migrate dev` ولا `schema.prisma` edit في الـ Phase 11A كاملاً (الـ migration الوحيد seed-only للـ 3 permissions INSERTs).
- لا writeback على الـ `SalesInvoice` ولا الـ `PurchaseInvoice` ولا الـ `Payment` — General Ledger **read-only** في الـ Phase 11A.
- لا `git add .` ولا `git add -A` — كل الـ commits الـ 6 الـ كود في phase-11a يستخدمون `git add <file>...` صراحةً، والـ 11A-D-2 يستخدم `git add README.md` صراحةً.
- لا cf-byok-deploy / designer-handoff / gsk-hosted-deploy / gsk-hosted-identity skill activation.
- لا تغيير في الـ access control pattern: نفس الـ JWT-claim server-side (`@RequirePermissions`) + client-side (`hasPermission`) الـ split؛ لا fallback في الـ app JavaScript ولا في الـ access descriptor.
- لا extensions لكتلة أخرى: لا AR ولا AP payments tier-2 features ولا charts ولا customer/supplier drill-down ولا notifications.

### Out of scope (Phase 11A — explicit)

الـ Phase 11A هي **read-side-first foundation**. كل الـ items التالية خارج النطاق الصريح:

- **لا real posting from sales/purchases/payments** — لا auto-posting للـ AR invoices على الـ journal، ولا للـ AP invoices، ولا للـ AR/AP payments. الـ `journal.write` path موجود فقط عبر الـ explicit endpoints الـ Phase 6 (POST /journal + /journal/:id/post).
- **لا financial statements** — لا trial balance، لا income statement، لا balance sheet، لا cash flow statement، لا equity reconciliation.
- **لا bank reconciliation** — لا matching بين الـ payments والـ bank statements ولا import statements ولا manual reconciliation UI.
- **لا tax filing** — لا VAT return، لا ZATCA integration، لا e-invoicing، لا tax-period rollover.
- **لا multi-currency** — `'SAR'` literal فقط، لا currency conversion logic، لا FX rate provider integration.
- **لا external integrations** — لا bank feeds، لا payment gateway (Stripe / PayPal / Mada / STC Pay)، لا ERP sync، لا marketplace sync، لا 3PL integration.
- **لا production deployment** — ولا Cloudflare Pages ولا hosted deploy ولا hosted identity ولا Docker Compose orchestration change. Local Docker Compose + local NestJS + local Next.js فقط.

### Backend additions summary

| Layer | File | Change |
|-------|------|--------|
| Service | `backend/src/accounting/accounting.service.ts` | +4 helpers (computeJournalTotals، validateJournalBalances، ensureJournalEntryCanPost، ensureJournalEntryCanCancel) |
| Controller | `backend/src/accounting/accounting.controller.ts` | 6 decorator renames إلى gl_accounts.read / gl_journal.read / gl_journal.write |
| Migration (seed-only) | `backend/prisma/migrations/20260909120000_phase11a_gl_permissions/migration.sql` | 3 INSERTs على permissions table (gl_accounts.read، gl_journal.read، gl_journal.write) مع ON CONFLICT DO NOTHING |
| e2e test | `backend/test/app.e2e-spec.ts` | +9 tests داخل `describe('Phase 11A-B-3: GL posting hardening (e2e smoke)')` |

### Frontend additions summary

| Layer | File | Change |
|-------|------|--------|
| API client | `frontend/src/lib/api.ts` | +2 wrappers (listGlAccounts، listGlJournalEntries)، +4 type aliases (GlAccount، GlJournalEntry، GlJournalLine، GlListResponse<T>) |
| Page | `frontend/src/app/accounting/gl/page.tsx` | ملف جديد (≈ 450 سطر) — read-only، permission-gated، two tables، loading/error/empty banners، لا forms/buttons/write paths |

### Commit map (single-domain discipline)

كل الـ 6 commits الـ كود في phase-11a مستقلة النطاق:

- `11A-PLAN` → `docs/PHASE_11A_GL_PLAN.md`.
- `11A-B-1` → `backend/prisma/migrations/20260909120000_phase11a_gl_permissions/migration.sql` (الـ seed-only).
- `11A-B-2` → `backend/src/accounting/accounting.service.ts` (الـ 4 الـ helpers).
- `11A-B-3` → `backend/test/app.e2e-spec.ts` (الـ 9 tests داخل الـ `describe('Phase 11A-B-3: ...')`).
- `11A-B-4` → `backend/src/accounting/accounting.controller.ts` (الـ 6 decorator rewires).
- `11A-C-code` → `frontend/src/lib/api.ts` و `frontend/src/app/accounting/gl/page.tsx`.
- `11A-D-2` → `README.md` فقط (هذا الـ commit).

### Recommendation

**Phase 11A (General Ledger Foundation) انتهت** على مستوى:

- `11A-PLAN` (docs scoping) و `11A-B-1` (RBAC skeleton: 3 INSERTs، seed-only) و `11A-B-2` (hardening: 4 helpers + asserts narrowing + Fork A preservation لـ "reverse out of scope" wording) و `11A-B-3` (smoke tests: 9 tests تغطي RBAC guards + balanced/unbalanced + DRAFT/POSTED/CANCELLED transitions + Fork A wording) و `11A-B-4` (controller wiring: 6 decorators إلى gl_accounts.read / gl_journal.read / gl_journal.write) — backend.
- `11A-C-code` (frontend wiring: `api.listGlAccounts()` + `api.listGlJournalEntries()` + 4 type aliases + صفحة Next.js read-only على `/accounting/gl` مع permission gates + two tables + loading/error/empty banners، بدون forms/buttons/write paths) — frontend.
- `11A-D-1` (verification: working tree clean، HEAD = `b9b8221`، scope limited إلى 4 files الـ كود + README، backend build PASS، backend e2e PASS = 138/138، frontend build PASS) و `11A-D-2` (README closure: هذا الـ commit).

كل الـ permissions الـ الجديدة (3 keys) enforced server-side عبر الـ existing `@RequirePermissions` decorator + الـ existing `PermissionsGuard`. الـ tenant isolation من JWT فقط. الـ helpers الـ 4 تستخدم `Prisma.Decimal` arithmetic حصراً — لا `Number()` في أي math path. الـ `JournalEntryStatus` enum محفوظ كما هو (`DRAFT | POSTED | CANCELLED`) بدون أي توسيع. الـ `AccountType` و `NormalBalance` و `JournalEntryLine` و `Account` و `JournalEntry` models كلها مستعملة كما هي من الـ Phase 6 — لا duplicate GL schema في الـ Prisma.

**الحدود الـ strict لـ Phase 11A**:

- لا auto-posting من الـ AR / AP / Payments (الـ journal.write path محصور في الـ explicit POST /journal + /journal/:id/post + /journal/:id/cancel الـ Phase 6 endpoints).
- لا reverse entries في الـ cancel flow للـ POSTED entries — الـ "Posted journal entries require reversing entries, which is out of scope in Phase 6" wording محفوظ في الـ helper contract (Fork A).
- لا financial statements ولا budgeting ولا cash flow forecasting.
- لا bank reconciliation ولا payment gateway integration.
- لا tax filing ولا ZATCA integration.
- لا multi-currency layer.
- لا writeback على الـ SalesInvoice أو الـ PurchaseInvoice أو الـ Payment من الـ GL side.
- لا write paths في الـ frontend — الـ page `/accounting/gl` read-only بالكامل.

كل واحد من هذه الـ 8 بنود هو **مرحلة منفصلة قادمة محتملة** (بحجمها الخاص)، ولا يجب جمعها:

- إمّا **Auto-posting AR ↔ GL** (12A) — على issue/cancel الـ `SalesInvoice`، auto-create journal lines debiting AR control + crediting revenue + VAT.
- أو **Auto-posting AP ↔ GL** (12B) — مرآة الـ 12A لكن لـ `PurchaseInvoice`.
- أو **Auto-posting Payments ↔ GL** (12C) — على POST الـ payment، auto-create journal lines debiting cash/bank + crediting AR/AP control.
- أو **Reverse-entry / Reversal Journal** (12D) — لتفعيل الـ cancel على الـ POSTED entries بدون فقدان الـ audit trail.
- أو **Trial Balance + Income Statement** (12E) — first-class financial statements.
- أو **Balance Sheet + Cash Flow** (12F).
- أو **Bank Reconciliation** (13A) — matching payments-rows لـ bank-imported statements.
- أو **VAT / ZATCA Filing** (13B) — tax-period reports + e-invoicing compliance.
- أو **Multi-currency layer** (14A) — لو multi-currency صار أولوية.
- أو **GL Read/Write Polish** (11B) — مثلاً search/filter UI على الـ `/accounting/gl` page، exports للـ ledger، period-end close UI.

وكل مرحلة يجب أن تكون **single-domain** فقط. ولا deployment بأمر المستودع هذا — فقط local Docker Compose. ولا hosted deploy / hosted identity في هذه المرحلة (ولا في المراحل القادمة إلا بموافقة صريحة).

### Verification summary (Phase 11A)

- `pnpm --filter @erp/backend build` ⇒ **PASS** (exit 0، nest build، لا errors).
- `pnpm --filter @erp/backend test:e2e` ⇒ **PASS = 138/138** (`Test Suites: 2 passed, 2 total — Tests: 138 passed, 138 total`).
- `pnpm --filter @erp/frontend build` ⇒ **PASS** (Next.js 14.2.35، route `/accounting/gl = 2.77 kB / 102 kB First Load JS`).
- Final verification HEAD قبل 11A-D-2: **`b9b82216dd6467011d1bc8b65400933a721723bb`**.
- Working tree clean قبل 11A-D-2: `git diff --name-only` empty.

→ Phase 11A closure verified. Phase 11A-D-2 (README update) sealed.

---

## Phase 11B: Real GL Posting

> تم تنفيذ المرحلة 11B بالكامل مع **164/164 e2e tests passing** عبر test suites كاملة، مع builds نظيفة تماماً للـ backend والـ frontend. تربط هذه المرحلة دورات الأعمال الأربع الأساسية (المبيعات، المشتريات، تحصيلات الذمم المدينة، مدفوعات الذمم الدائنة) بدفتر الأستاذ العام (General Ledger) تلقائياً وذرياً (Atomically) وبشكل متزن وغير قابل للتكرار (Idempotent).

### Completed Commits (Phase 11B)

- `a08bb0e` — `feat(phase-11b): add GL posting linkage skeleton`
- `065b51c` — `feat(phase-11b): auto-post sales invoices to GL`
- `1265b8d` — `feat(phase-11b): auto-post purchase invoices to GL`
- `8447711` — `feat(phase-11b): auto-post AR payments to GL`
- `f47fdaa` — `feat(phase-11b): auto-post AP payments to GL`
- `799f510` — `test(phase-11b): add GL posting consolidation e2e`
- `49eca7e` — `feat(phase-11b): show GL posting sources in frontend`

---

### 1. JournalEntry Source Linkage
تمت إضافة أعمدة الربط البوليمورفي إلى نموذج `JournalEntry` لربط قيود اليومية بمستندات المصدر مباشرة وحمايتها من التكرار:
- **`sourceType: JournalEntrySourceType?`**: نوع المستند المصدر (`SALES_INVOICE` | `PURCHASE_INVOICE` | `AR_PAYMENT` | `AP_PAYMENT` | `null` للقيود اليدوية).
- **`sourceId: String?`**: المعرّف الفريد للمستند المصدر داخل الشركة.
- **`reversalOf: String?`**: حقل محجوز للربط الذاتي لقيود الإلغاء/العكس المستقبلية (`JournalEntryReversal`).
- **`@@unique([companyId, sourceType, sourceId])`**: قيد فريد يمنع إنشاء أكثر من قيد مرحّل لنفس المستند المصدر داخل الشركة نفسها، مما يضمن معالجة متكررة آمنة (Idempotent replay).

---

### 2. Required Account Mappings
تعتمد قيود الترحيل على خريطة الحسابات الأساسية الثمانية الإلزامية بالـ `code` لكل شركة (`companyId`):
1. **`AR_CONTROL`**: حساب المدينين / مراقبة العملاء (Asset, Debit)
2. **`AP_CONTROL`**: حساب الدائنين / مراقبة الموردين (Liability, Credit)
3. **`CASH_OR_BANK`**: النقدية وما في حكمها / البنك (Asset, Debit)
4. **`SALES_REVENUE`**: إيرادات المبيعات (Revenue, Credit)
5. **`INVENTORY_OR_EXPENSE`**: المخزون أو المصروف للمشتريات (Asset/Expense, Debit)
6. **`VAT_OUTPUT`**: ضريبة القيمة المضافة للمبيعات (Liability, Credit)
7. **`VAT_INPUT`**: ضريبة القيمة المضافة للمشتريات (Asset, Debit)
8. **`SALES_DISCOUNTS`**: خصومات المبيعات الممنوحة (Contra-Revenue/Expense, Debit)

يتم التأكد من وجود هذه الحسابات وتوليدها تلقائياً عبر `ensureRequiredGlAccounts(tx, companyId)` لضمان عدم وجود قيود معلقة بدون حسابات معتمدة.

---

### 3. Auto-Posting Flows
الترحيل يتم تلقائياً داخل نفس الـ Prisma `$transaction` الخاصة بالعملية التجارية لضمان الذرية (Atomic Execution):
1. **`SalesInvoice ISSUED`**: عند ترحيل/إصدار فاتورة المبيعات (`SalesService.issue`).
2. **`PurchaseInvoice RECEIVED`**: عند استلام فاتورة المشتريات واعتمادها (`PurchasesService.receive`).
3. **`AR Payment POSTED`**: عند تسجيل وقبض دفعة مبيعات (`PaymentsService.register`).
4. **`AP Payment POSTED`**: عند تسجيل وصرف دفعة مشتريات (`PaymentsService.registerPurchasePayment`).

---

### 4. Posting Templates (قوالب الترحيل المحاسبي)
جميع العمليات الحسابية تتم باستخدام `Prisma.Decimal` حصراً دون أي تحويل إلى `Number()`:

#### أ. فاتورة المبيعات (Sales Invoice ISSUED):
- **مدين (Dr)**: `AR_CONTROL` (صافي المستحق على العميل = الإجمالي بعد الخصم والضريبة)
- **مدين (Dr)**: `SALES_DISCOUNTS` (إجمالي الخصم الممنوح إن وجد)
- **دائن (Cr)**: `SALES_REVENUE` (إجمالي قيمة البضاعة/الخدمة قبل الخصم)
- **دائن (Cr)**: `VAT_OUTPUT` (إجمالي ضريبة المخرجات 15%)

#### ب. فاتورة المشتريات (Purchase Invoice RECEIVED):
- **مدين (Dr)**: `INVENTORY_OR_EXPENSE` (صافي تكلفة البضاعة أو الخدمة بعد الخصم)
- **مدين (Dr)**: `VAT_INPUT` (إجمالي ضريبة المدخلات 15%)
- **دائن (Cr)**: `AP_CONTROL` (إجمالي المستحق للمورد)

#### ج. سند قبض دفعة مبيعات (AR Payment POSTED):
- **مدين (Dr)**: `CASH_OR_BANK` = قيمة الدفعة المحصلة
- **دائن (Cr)**: `AR_CONTROL` = قيمة الدفعة المسددة من حساب العميل

#### د. سند صرف دفعة مشتريات (AP Payment POSTED):
- **مدين (Dr)**: `AP_CONTROL` = قيمة الدفعة المسددة لحساب المورد
- **دائن (Cr)**: `CASH_OR_BANK` = قيمة الدفعة المنصرفة

---

### 5. Idempotency & Safety
- **حماية تامة من التكرار**: لا يمكن بأي حال توليد أكثر من قيد لنفس المستند داخل نفس الشركة بفضل الفهرس الفريد `@@unique([companyId, sourceType, sourceId])`.
- **معالجة تكرار الطلب**: في حال إعادة محاولة الطلب (Retry / Idempotent replay)، تلتقط المعالجات خطأ `P2002` وتعيد القيد القائم فوراً (`{ reused: true }`) دون توليد قيود مكررة أو التسبب بخلل في التوازن المحاسبي.

---

### 6. Frontend Source Visibility
تم تعزيز شاشة دفتر الأستاذ العام القراءة-فقط (`frontend/src/app/accounting/gl/page.tsx`):
- إضافة عمود **نوع المصدر** مع شارات ملونة وتسميات عربية/إنجليزية واضحة (`فاتورة مبيعات / Sales Invoice`، `فاتورة مشتريات / Purchase Invoice`، `سند قبض / AR Payment`، `سند صرف / AP Payment`، `قيد يدوي / Manual Journal`).
- إضافة عمود **معرّف المصدر** لعرض معرّف المستند المرتبط به القيد.
- الحفاظ على الحظر الصارم لأي تعديل: لا أزرار إنشاء، تعديل، ترحيل، أو إلغاء في الواجهة.

---

### 7. Verification Summary
- **Backend Build (`pnpm --filter @erp/backend build`)**: **PASS** (NestJS compiled successfully).
- **Backend E2E Tests (`pnpm --filter @erp/backend test:e2e`)**: **PASS = 164/164 tests** (2 suites: `reports.e2e-spec.ts` + `app.e2e-spec.ts`).
- **Frontend Build (`pnpm --filter @erp/frontend build`)**: **PASS** (Next.js compiled, type-checked, 16 static routes generated).
- **Final Verification HEAD**: `49eca7e9d34cee92775244f55e28fc529a6cfec7`.
- **Working Tree**: Clean.

---

### 8. Out of Scope (صريح للمراحل المستقبلية)
- ❌ **القوائم المالية الكاملة**: لا ميزان مراجعة، لا قائمة دخل، لا ميزانية عمومية، لا قائمة تدفقات نقدية.
- ❌ **التسوية البنكية**: لا مطابقة مع كشوفات البنك، ولا استيراد ملفات بنكية.
- ❌ **الإقرارات الضريبية والـ ZATCA**: لا إقرارات ضريبية آلية ولا ربط إلكتروني للمرحلة الثانية مع هيئة الزكاة والضريبة والجمارك.
- ❌ **تعدد العملات**: العملة الأساسية الوحيدة هي الريال السعودي (`SAR`).
- ❌ **التكاملات الخارجية**: لا بوابات دفع ولا ربط مع أنظمة محاسبية خارجية.
- ❌ **النشر السحابي/الإنتاجي**: البيئة قيد التطوير المحلي والاختبار الكامل فقط.

---

## Phase 12A: Financial Statements

> تم تنفيذ المرحلة 12A بالكامل مع **185/185 e2e tests passing** عبر جميع الـ test suites، مع builds نظيفة وخالية من الأخطاء للـ backend والـ frontend. توفر هذه المرحلة طبقة قراءة وتجميع مالية متقدمة لقراءة قيود اليومية المحاسبية المرحّلة (POSTED) فقط، وتوليد القوائم المالية الثلاث الأساسية: ميزان المراجعة (Trial Balance)، قائمة الدخل / الأرباح والخسائر (Income Statement)، والميزانية العمومية (Balance Sheet)، مع صفحة عرض قراءة فقط مخصصة ومحمية بالصلاحيات.

### Completed Commits (Phase 12A)

- `273dc94` — `docs(phase-12a): add financial statements plan`
- `19afd66` — `feat(phase-12a): add financial statements backend skeleton`
- `17d11be` — `feat(phase-12a): implement trial balance calculation`
- `f3de9c4` — `feat(phase-12a): implement income statement calculation`
- `161d937` — `feat(phase-12a): implement balance sheet calculation`
- `181f09b` — `test(phase-12a): add financial statements consolidation e2e`
- `53e6950` — `feat(phase-12a): add financial statements frontend view`

---

### 1. Scope (النطاق المحقق)
1. **Trial Balance (ميزان المراجعة)**: أرصدة الحسابات الإجمالية الافتتاحية، حركة الفترة، والرصيد الختامي مع التحقق من توازن إجمالي المدين والدائن.
2. **Income Statement (قائمة الدخل / الأرباح والخسائر)**: حسابات الإيرادات والمصروفات خلال فترة زمنية محددة واحتساب صافي الدخل.
3. **Balance Sheet (الميزانية العمومية)**: الأصول، الالتزامات، وحقوق الملكية حتى تاريخ محدد (as-of date) مع معالجة الأرباح المبقاة وصافي الدخل المحتسب والتحقق من معادلة الميزانية.
4. **Read-Only Frontend View (واجهة العرض)**: صفحة قراءة فقط على `/accounting/reports` مجهزة بفلاتر زمنية وتبويبات عرض، دون أي إمكانية للتعديل أو الترحيل من هذه الواجهة.

---

### 2. Backend APIs (واجهات برمجة التطبيقات)
تمت إضافة ثلاثة مسارات GET في وحدة المحاسبة (`AccountingModule`):
- `GET /api/accounting/reports/trial-balance`
- `GET /api/accounting/reports/income-statement`
- `GET /api/accounting/reports/balance-sheet`

جميع المسارات محمية بصلاحية `gl_journal.read` باستخدام `@RequirePermissions('gl_journal.read')` والـ `PermissionsGuard`.

---

### 3. Data Source and Invariants (مصدر البيانات والقواعد الحاكمة)
- **نماذج البيانات فقط**: يقرأ النظام حصراً من نماذج `Account`, `JournalEntry`, و `JournalEntryLine`.
- **حالة القيود المعتمدة فقط**: القيود المشمولة هي ذات الحالة `JournalEntryStatus.POSTED` فقط.
- **استبعاد المسودات والملغيات**: يتم استبعاد جميع القيود بحالة `DRAFT` و `CANCELLED`. القيود العكسية (Reversing entries) المرحّلة تُحتسب ضمن القيود لتسوية القيود الأصلية.
- **عزل المستأجرين (Tenant Isolation)**: يتم تحديد معرّف الشركة `companyId` حصراً واستثنائياً من الـ JWT الخاص بالمستخدم المسجل (`@CurrentUser()`). لا يُقبل تمرير `companyId` من مسار الـ URL أو الـ query أو الـ body.
- **المحور الزمني (Date Axis)**: يعتمد التصفية والفرز حصراً على تاريخ القيد الدفتري `JournalEntry.entryDate` (نافذة UTC شاملة). لا يُستخدم `postedAt` أو `createdAt`.
- **عدم تعديل البيانات (Read-Only)**: لا تقوم هذه المرحلة بإنشاء، تعديل، ترحيل، إلغاء، أو عكس أي قيود يومية، ولا تجري إقفالات فترات محاسبية في قاعدة البيانات.

---

### 4. Precision & Financial Math (الدقة والعمليات الحسابية)
- العمليات الحسابية تتم باستخدام `Prisma.Decimal` فقط.
- يُحظر تماماً استخدام `Number()` في أي مسار حسابي أو جمع أو طرح أو تسوية محاسبية لتجنب مشاكل الفاصلة العائمة (floating-point inaccuracies).
- النواتج النقدية في الـ JSON هي سلاسل نصية عشرية بدقة 4 خانات (`toFixed(4)`).
- التحقق من التوازن والتطابق يتم عبر دالة `Prisma.Decimal.equals(...)`.

---

### 5. Trial Balance Behavior (سلوك ميزان المراجعة)
- **المعلمات**: `fromDate?`, `toDate?`, `includeZero?`
- **التصنيف الثلاثي**:
  - **الرصيد الافتتاحي (Opening)**: الحركات المرحّلة حيث `entryDate < fromDate`.
  - **حركة الفترة (Period)**: الحركات المرحّلة حيث `fromDate <= entryDate <= toDate`.
  - **الرصيد الختامي (Closing)**: جمع الافتتاحي وحركة الفترة لكل من جانبي المدين والدائن بصورة منفصلة.
- **خيارات العرض**: خيار `includeZero=true` يسمح بعرض الحسابات ذات الحركة الصفرية؛ افتراضياً يتم عرض الحسابات ذات الحركة فقط.
- **فحص التوازن**: يتم فحص تطابق إجمالي المدين الختامي مع إجمالي الدائن الختامي وإرجاع مؤشر `balanced: boolean` في الإجماليات.

---

### 6. Income Statement Behavior (سلوك قائمة الدخل)
- **المعلمات**: `fromDate?`, `toDate?`
- **الحسابات المشمولة**: حسابات `REVENUE` و `EXPENSE` فقط، مع استبعاد حسابات الأصول والالتزامات وحقوق الملكية.
- **النافذة الزمنية الافتراضية**: السنة المالية الحالية حتى تاريخ اليوم (Fiscal Year-to-Date)، بالاعتماد على شهر بداية السنة المالية للشركة `Company.fiscalYearStartMonth`.
- **طبيعة الحسابات والخصومات**:
  - حسابات الإيرادات الدائنة تزيد الإيرادات (`credit − debit`).
  - حسابات الخصومات والمردودات المدينة التابعة للإيرادات (مثل `SALES_DISCOUNTS`) تُعامل كحسابات مقابلة (Contra-Revenue) وتُخفض إجمالي الإيرادات.
  - حسابات المصروفات المدينة تزيد المصروفات (`debit − credit`).
- **صافي الدخل (Net Income)**: `netIncome = totalRevenue − totalExpenses`.

---

### 7. Balance Sheet Behavior (سلوك الميزانية العمومية)
- **المعلمات**: `asOfDate?` (تاريخ الميزانية، افتراضياً نهاية اليوم الحالي بالتوقيت العالمي).
- **الحسابات الدائمة المباشرة**:
  - الأصول (`ASSET`)
  - الالتزامات (`LIABILITY`)
  - حقوق الملكية المسجلة في الدليل (`EQUITY`)
- **البنود التراكمية المحتسبة (Synthetic Equity Lines)**:
  - `RETAINED_EARNINGS_COMPUTED`: صافي الدخل التراكمي لجميع السنوات المالية السابقة لتاريخ بداية السنة المالية المحددة.
  - `CURRENT_PERIOD_NET_INCOME`: صافي دخل السنة المالية الحالية حتى تاريخ الميزانية (`asOfDate`)، وهو يطابق تماماً صافي دخل قائمة الدخل لنفس الفترة.
- **معادلة الميزانية العمومية المحققة**:
  ```text
  الأصول = الالتزامات + حقوق الملكية + الأرباح المبقاة المحتسبة + صافي دخل الفترة الحالية
  ```
  يتم التحقق منها وإرجاع خاصية `totals.balanced: true`.

---

### 8. Frontend Interface (الواجهة الأمامية)
- مسار الصفحة: `/accounting/reports`
- **حماية الصلاحيات**: تشترط صلاحية `gl_journal.read`، وتعرض واجهة توجيهية عند عدم توفر الصلاحية بدلاً من انهيار التطبيق.
- **شاشات وجداول متكاملة**:
  - جدول ميزان المراجعة مع أعمدة الافتتاحي والفترة والختامي وشارة التوازن.
  - جدول الإيرادات وجدول المصروفات مع شريط احتساب صافي الدخل.
  - جدول الأصول، الالتزامات، حقوق الملكية مع إدراج البنود المحتسبة وشريط التحقق من معادلة الميزانية.
- **فلاتر تفاعلية**: إمكانية تصفية البيانات حسب تاريخ البداية والنهاية وتاريخ الميزانية وتضمين الحسابات الصفرية.
- **الالتزام بالقراءة فقط**: تخلو الصفحة تماماً من أي أزرار أو نماذج إنشاء أو تعديل أو ترحيل أو إلغاء للقيود.

---

### 9. Verification Summary (نتائج التحقق)
- **بناء الـ Backend (`pnpm --filter @erp/backend build`)**: **PASS** (NestJS compiled successfully).
- **اختبارات الـ Backend e2e (`pnpm --filter @erp/backend test:e2e`)**: **PASS = 185/185 tests** عبر مجموعتي الاختبار (`reports.e2e-spec.ts` و `app.e2e-spec.ts`).
- **بناء الـ Frontend (`pnpm --filter @erp/frontend build`)**: **PASS** (Next.js 14 compiled with 17 static routes including `○ /accounting/reports`).
- **حالة شجرة العمل (Working Tree)**: نظيفة ومستقرة.

---

### 10. Out of Scope (خارج النطاق ومؤجل لمراحل لاحقة)
- ❌ **قائمة التدفقات النقدية (Cash Flow Statement)**.
- ❌ **التسوية البنكية (Bank Reconciliation)**.
- ❌ **الإقرارات الضريبية والفوترة الإلكترونية مع هيئة الزكاة (ZATCA Phase 2)**.
- ❌ **التعامل بتعدد العملات (Multi-Currency)**.
- ❌ **تصدير التقارير إلى PDF أو Excel**.
- ❌ **إقفال الفترات المحاسبية السنوية في قاعدة البيانات (Year-end close / Retained earnings posting)**.
- ❌ **أي تعديلات على الـ schema أو إضافة صلاحيات جديدة في الـ RBAC**.
- ❌ **أي تغييرات في النشر السحابي أو البنية التحتية (Docker / Cloudflare)**.

---

## Phase 13A: Bank Reconciliation

> تم تنفيذ المرحلة 13A بالكامل مع **207/207 e2e tests passing** عبر جميع مجموعات الاختبارات، وبناء نظيف تماماً للـ backend والـ frontend. توفر هذه المرحلة نظام تسوية ومطابقة بنكية متكامل يدعم استيراد كشوف الحسابات بصيغة CSV، كشف التكرار على مستوى الملف والسطور، محرك اقتراحات المطابقة الذكي، سير عمل المطابقة اليدوية وإلغاء المطابقة (Soft-unmatch)، تقارير العمليات غير المطابقة والملخص العام، ومساحة عمل تفاعلية في الواجهة الأمامية عبر المسار `/accounting/reconciliation`، مع الحفاظ التام على ثوابت المحاسبة وعدم المساس بقيود اليومية.

### Completed Commits (Phase 13A)

- `e99a848` — `docs(phase-13a): add reconciliation architecture plan`
- `5752e49` — `docs(phase-13a): clarify reconciliation unmatch semantics`
- `5934524` — `feat(phase-13a): add reconciliation models and permissions`
- `b9eae18` — `feat(phase-13a): add bank accounts reconciliation skeleton`
- `5f715d5` — `feat(phase-13a): implement bank statement csv import parser`
- `97994d8` — `feat(phase-13a): implement reconciliation matching suggestions`
- `322261f` — `feat(phase-13a): implement manual reconciliation workflow`
- `e7a13ae` — `feat(phase-13a): add reconciliation reports`
- `d862d3c` — `feat(phase-13a): add reconciliation frontend workspace`

---

### 1. Scope (النطاق المحقق)
1. **Manual bank statement CSV import**: رفع واستيراد كشوف الحسابات البنكية يدوياً بصيغة CSV.
2. **Bank account CRUD**: إدارة الحسابات البنكية للشركة (إنشاء، استعراض، تعديل، وحذف ناعم) مع ربط اختياري بحساب الأستاذ العام للأصول (GL Asset Account).
3. **Duplicate file and duplicate transaction detection**: منع تكرار استيراد نفس الكشف البنكي بالاعتماد على بصمة الملف، ومنع تكرار الحركات البنكية عبر بصمة السطر الفريدة (Row Fingerprint).
4. **Matching suggestions engine**: محرك اقتراحات حتمي يطابق الحركات البنكية مع مدفوعات النظام (AR/AP) بناءً على نقاط الثقة والتطابق.
5. **Manual match and soft-unmatch workflow**: سير عمل للمطابقة اليدوية مع إمكانية إلغاء المطابقة الآمن (Soft-unmatch) وتتبع المستخدم ووقت الإلغاء.
6. **Reconciliation reports**: تقرير العمليات غير المطابقة (Unmatched Report) وتقرير الملخص العام والفروقات والتنبيهات (Summary Report).
7. **Frontend workspace**: مساحة عمل متكاملة للمطابقة البنكية على `/accounting/reconciliation`.
8. **No automatic GL postings**: عدم إنشاء أي قيود محاسبية أو تسويات دفتيرية تلقائية.

---

### 2. Data Model (نموذج البيانات)
تم إدخال النماذج التالية في مخطط Prisma (`schema.prisma`):
- **`BankAccount`**: بيانات الحساب البنكي (الاسم، الآيبان الفريد، العملة، الرصيد الافتتاحي والحالي، وحساب الأستاذ المرتبط `glAccountId`).
- **`BankStatement`**: سجل كشف الحساب المستورد، يحمل بصمة SHA-256 للملف في `fileHash` لضمان عدم استيراد الملف مرتين داخل الشركة (`@@unique([companyId, fileHash])`).
- **`BankTransaction`**: حركات كشف الحساب البنكي الفردية (وارد `INFLOW` / صادر `OUTFLOW`) مع بصمة فريدة `fingerprint` مشتقة من التاريخ، النوع، المبلغ، والمرجع لمنع تكرار إدخال الحركة (`@@unique([bankAccountId, fingerprint])`).
- **`ReconciliationMatch`**: يربط حركة بنكية واحدة (`bankTransactionId`) بدفعة واحدة مسجلة في النظام (`paymentId`).
  - **Active-only uniqueness**: فهارس جزئية فريدة (`active_bank_tx_match` و `active_payment_match`) لضمان عدم وجود أكثر من مطابقة نشطة لنفس الحركة أو الدفعة في وقت واحد (`where: unmatchedAt IS NULL`).
  - **Soft-unmatch**: إلغاء المطابقة يتم برمجياً بتسجيل `unmatchedAt` و `unmatchedById` وإعادة الحركة البنكية إلى حالة `UNMATCHED` دون حذف سجل المطابقة ودون تعديل أي قيد محاسبي.
- **Tenant Isolation**: جميع النماذج معزولة تماماً ومقيدة بالشركة عبر حقل `companyId` المشتق من الـ JWT فقط.

---

### 3. APIs (واجهات برمجة التطبيقات)
مسارات التسوية البنكية المتاحة تحت البادئة `/api/reconciliation`:

#### أ. الحسابات البنكية (Bank Accounts):
- `GET /api/reconciliation/bank-accounts`: استعراض الحسابات البنكية النشطة للشركة.
- `POST /api/reconciliation/bank-accounts`: إنشاء حساب بنكي جديد مع التحقق من تفرد الآيبان وصحة حساب الأستاذ العام.
- `PATCH /api/reconciliation/bank-accounts/:id`: تحديث بيانات الحساب البنكي.
- `DELETE /api/reconciliation/bank-accounts/:id`: حذف ناعم للحساب البنكي.

#### ب. استيراد كشوف الحسابات (CSV Import):
- `POST /api/reconciliation/statements/import-csv`: رفع كشف حساب بنكي بصيغة `multipart/form-data` مع التحقق من بصمة الملف وبصمات الحركات ومعالجة المكرر والمتخطى.

#### ج. محرك الاقتراحات (Matching Suggestions):
- `GET /api/reconciliation/suggestions`: احتساب اقتراحات المطابقة بين الحركات البنكية والمدفوعات المرحّلة غير المطابقة استناداً إلى `minScore` وفلاتر التاريخ.

#### د. المطابقة اليدوية وإلغاء المطابقة (Manual Workflow):
- `POST /api/reconciliation/matches`: إنشاء مطابقة يدوية بين حركة بنكية ودفعة مرحّلة متوافقة وتغيير حالة الحركة البنكية إلى `MATCHED`.
- `DELETE /api/reconciliation/matches/:id`: إلغاء مطابقة نشطة (Soft-unmatch) وإعادة الحركة البنكية إلى `UNMATCHED`.

#### هـ. تقارير التسوية (Reports):
- `GET /api/reconciliation/reports/unmatched`: تقرير العمليات غير المطابقة (حركات البنك ومدفوعات النظام) مع الإجماليات.
- `GET /api/reconciliation/reports/summary`: تقرير الملخص العام (رصيد البنك، رصيد الدفاتر، الفارق، والتحذيرات).

---

### 4. RBAC (الأذونات والصلاحيات)
أذونات مخصصة لوحدة المطابقة البنكية مدمجة في نظام الصلاحيات ومصفوفة الأدوار:
- **`reconciliation.read`**: استعراض الحسابات البنكية، كشوف الحسابات، تقارير العمليات غير المطابقة، الملخص العام، واقتراحات المطابقة.
- **`reconciliation.write`**: إنشاء وتعديل وحذف الحسابات البنكية، وتنفيذ عمليات المطابقة وإلغاء المطابقة.
- **`reconciliation.import`**: رفع واستيراد كشوف الحسابات البنكية بصيغة CSV.

---

### 5. Accounting Invariants (الثوابت والضوابط المحاسبية)
تلتزم وحدة التسوية البنكية بالضوابط المحاسبية الصارمة التالية:
- **عدم إنشاء أي قيود**: لا تقوم عمليات المطابقة أو الاستيراد بإنشاء قيود يومية (`JournalEntry`) أو أسطر قيود (`JournalEntryLine`).
- **عدم تعديل القيود القائمة**: لا يتم تعديل أي قيد يومية مسجل في دفتر الأستاذ العام نتيجة المطابقة أو إلغائها.
- **ثبات حالة الدفعات**: تبقى حالة الدفعة `Payment.status` ثابتة عند `POSTED`؛ حالة التسوية مشتقة فقط من وجود مطابقة نشطة في `ReconciliationMatch`.
- **نطاق التعديل المحدد**: تؤثر المطابقة وإلغاء المطابقة حصراً على سجلات `ReconciliationMatch` وحالة الحركة البنكية `BankTransaction.status` (`UNMATCHED` / `MATCHED`).
- **خروج التسويات الدفترية عن النطاق**: معالجة العمولات البنكية (Bank Fees)، الفروقات، والتسويات القيدية اليدوية خارج نطاق هذه المرحلة.

---

### 6. CSV Import Behavior (سلوك استيراد كشوف الحسابات)
- **الرفع اليدوي (Manual CSV Upload)**: رفع ملفات CSV عبر نموذج الواجهة أو واجهة الـ API.
- **حجم الملف (File Size Limit)**: حد أقصى لحجم الملف يقارب 5 ميجابايت (`5 * 1024 * 1024` بايت).
- **مرونة عناوين الأعمدة (Flexible Column Aliases)**: دعم تلقائي لتسميات الأعمدة باللغتين العربية والإنجليزية (مثل: Date, تاريخ, Inflow, Outflow, Debit, Credit, Amount, Reference, Description).
- **توحيد التواريخ (UTC Date Normalization)**: تحليل وتوحيد مختلف صيغ التواريخ المصرفية (`YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, إلخ) وتخزينها بتوقيت UTC.
- **الدقة الرقمية (Prisma.Decimal)**: تحليل المبالغ النقدية وتنقيتها بدقة عبر `Prisma.Decimal`، وتخزينها بتنسيق عشري دقيق `(18,4)`.
- **تجاهل السطور الصفرية**: يتم استبعاد وتخطي أي سطر بمبلغ صفري تلقائياً.
- **كشف التكرار على مستوى الملف (File-level SHA-256)**: حساب هاش `SHA-256` لمحتوى الملف ورفض استيراد الملف المكرر للشركة برمز خطأ `409 Conflict`.
- **كشف التكرار على مستوى الحركات (Row-level Fingerprint)**: حساب بصمة تجزئة فريدة لكل حركة بنكية من بياناتها الأساسية، وتخطي الحركات المكررة مع إدراج الحركات الجديدة فقط داخل معاملة ذرية واحدة (`$transaction`).

---

### 7. Matching Behavior & Scoring (سلوك محرك المطابقة ونظام النقاط)
- **توافق الاتجاه**:
  - الحركات الواردة (`INFLOW`) تتوافق فقط مع مقبوضات المبيعات والعملاء (`AR_PAYMENT` / `SALES`).
  - الحركات الصادرة (`OUTFLOW`) تتوافق فقط مع مدفوعات المشتريات والموردين (`AP_PAYMENT` / `PURCHASE`).
- **نظام احتساب النقاط الحتمي (Deterministic Scoring Weights)**:
  - **تطابق المبلغ (Amount)**: حتى 60 نقطة (تطابق تام = 60).
  - **تقارب التاريخ (Date Proximity)**: حتى 25 نقطة (نفس اليوم = 25، خلال يومين = 20، خلال 5 أيام = 15، خلال 10 أيام = 10، خلال 30 يوماً = 5).
  - **تشابه المرجع والوصف (Reference / Description Similarity)**: حتى 15 نقطة (تطابق رقم الفاتورة أو المرجع أو الوصف = 15).
- **التصنيف**:
  - تطابق تام (`EXACT`): عند بلوغ 100 نقطة.
  - تطابق مقترح (`SUGGESTED`): عند تجاوز الحد الأدنى المحدد `minScore` (افتراضياً 80 نقطة فأكثر).

---

### 8. Frontend Interface (الواجهة الأمامية للمطابقة)
مسار الصفحة: `/accounting/reconciliation`
- **محدد الحساب البنكي (Bank Account Selector)**: اختيار الحساب البنكي مع عرض بيانات الآيبان والعملة والرصيد وحساب الأستاذ المرتبط.
- **شريط مؤشرات الأداء (KPI Summary Banner)**: عرض رصيد كشف البنك، رصيد الدفاتر، فارق المطابقة، وعدد العمليات المعلقة والتنبيهات.
- **لوحة استيراد الملفات (CSV Import Panel)**: نموذج رفع كشوف الحسابات بصيغة CSV، مع معالجة خطأ الملف المكرر (409) وعرض إحصائيات الاستيراد (السطور المستوردة، المتخطاة، والمكررة، وإجمالي الوارد والصادر، وبصمة الملف).
- **جدول الاقتراحات الذكية (Suggested Matches Section)**: استعراض التطابقات المقترحة مع شارات الثقة وتفاصيل الدفعة وزر المطابقة السريعة.
- **تقرير العمليات غير المطابقة (Unmatched Section)**: جدولان مستقلان لحركات البنك المعلقة ومدفوعات النظام المعلقة مع إجماليات المبالغ.
- **التحكم بالصلاحيات**:
  - زر المطابقة محمي ومقيد بصلاحية `reconciliation.write`.
  - لوحة الاستيراد مقيدة بصلاحية `reconciliation.import` مع إشعار القراءة فقط عند غيابها.

---

### 9. Verification Summary (سجل التحقق المعتمد)
- **Prisma Client Generate**: **PASS** (`Prisma Client v5.22.0`).
- **Backend Build (`pnpm --filter @erp/backend build`)**: **PASS** (NestJS compiled successfully).
- **Backend E2E Tests (`pnpm --filter @erp/backend test:e2e`)**: **PASS = 207/207 tests** عبر مجموعتي الاختبار (`reports.e2e-spec.ts` و `app.e2e-spec.ts`).
- **Frontend Build (`pnpm --filter @erp/frontend build`)**: **PASS** (Next.js compiled with 18 static routes including `○ /accounting/reconciliation`).
- **حالة شجرة العمل (Working Tree)**: نظيفة ومستقرة تماماً خلال التحقق النهائي في المرحلة 13A-D-1.

---

### 10. Out of Scope (خارج النطاق ومؤجل للمراحل القادمة)
- ❌ **واجهات البنوك المفتوحة (Open Banking APIs)**.
- ❌ **التغذية البنكية الحية والمباشرة (Real-time Bank Feeds)**.
- ❌ **الترحيل الآلي للرسوم والعمولات البنكية (Automated Fee Posting)**.
- ❌ **المطابقة متعددة الأطراف (Many-to-Many Matching)**: المطابقة الحالية 1:1 فقط.
- ❌ **التسوية متعددة العملات (Multi-Currency Settlement)**.
- ❌ **المطابقة التنبؤية بالذكاء الاصطناعي (AI Matching)**.
- ❌ **تصدير التقارير إلى PDF أو Excel**.
- ❌ **أي تعديلات على إعدادات النشر السحابي أو البنية التحتية (Deployment changes)**.
- ❌ **أي تعديلات على الفوترة الضريبية أو الربط مع هيئة الزكاة والضريبة والجمارك (Tax/ZATCA changes)**.

---

## Phase 14A: Period Close / Fiscal Closing

> تم تنفيذ المرحلة 14A بالكامل مع **207/207 e2e tests passing** عبر جميع مجموعات الاختبارات، وبناء نظيف تماماً للـ backend والـ frontend. توفر هذه المرحلة نظاماً رقابياً محاسبياً متكاملاً لإقفال وإعادة فتح الفترات المحاسبية الشهرية والسنوات المالية، والتحقق التلقائي من توازن القيود وميزان المراجعة قبل الإقفال، وفرض حواجز الحماية الرقابية لمنع الترحيل المحاسبي داخل الفترات والسنوات المقفلة عبر كافة تدفقات دفتر الأستاذ والمبيعات والمشتريات والمدفوعات، مع توفير مساحة عمل تفاعلية في الواجهة الأمامية عبر المسار `/accounting/period-close`، مع الحفاظ التام على ثوابت المحاسبة وتأجيل قيد الأرباح المبقاة لهذه المرحلة.

### Completed Commits (Phase 14A)

- `3b8eeb4` — `docs(phase-14a): add period close architecture plan`
- `1c993d7` — `feat(phase-14a): add period close schema and permissions`
- `61f4718` — `feat(phase-14a): add period close backend skeleton`
- `a3fd4b8` — `feat(phase-14a): implement period close validation`
- `888b957` — `feat(phase-14a): implement period close workflow`
- `ed1e0d1` — `feat(phase-14a): enforce closed period posting guards`
- `0bcefb8` — `feat(phase-14a): add fiscal year close guardrails`
- `0ba1cd9` — `feat(phase-14a): add period close frontend view`

---

### 1. Scope (النطاق المحقق)
1. **Period close architecture and implementation**: تصميم وبناء الهيكلية المحاسبية والرقابية لإقفال الفترات والسنوات المالية.
2. **Period close schema and RBAC permissions**: إضافة نماذج قاعدة البيانات وصلاحيات الوصول المخصصة.
3. **Read-only period close endpoints**: واجهات استعلام لقراءة حالة التواريخ، وسجل الفترات، والسنوات المالية، وسجل التدقيق.
4. **Period close validation endpoint**: محرك فحص وتحقق استباقي شامل قبل إقفال الفترة (فحص المسودات، توازن القيود، وتوازن ميزان المراجعة).
5. **Controlled period close and reopen workflow**: سير عمل محكم لإقفال الفترات وإعادة فتحها مع توثيق أسباب الفتح وسجل التدقيق في معاملات ذرية (`$transaction`).
6. **Closed period posting guards**: حواجز حماية ممركزة على مستوى الخادم تمنع الترحيل داخل الفترات والسنوات المقفلة عبر دفتر الأستاذ العام والمبيعات والمشتريات والمدفوعات.
7. **Fiscal year close guardrails**: فحص وتحقق وإقفال وإعادة فتح السنوات المالية مع اشتراط إقفال جميع الفترات الداخلية وتوازن حركة السنة.
8. **Frontend workspace**: مساحة عمل متكاملة للمستخدمين والمدققين على المسار `/accounting/period-close`.
9. **No retained earnings journal posting**: استبعاد قيد ترحيل الأرباح المبقاة عمداً في هذه المرحلة وتأجيله لمرحلة لاحقة.

---

### 2. Data Model (نموذج البيانات)
تم إدخال النماذج وحالات الإقفال التالية في مخطط Prisma (`schema.prisma`):

- **`PeriodCloseStatus` (Enum)**:
  - `OPEN`: الفترة أو السنة المالية مفتوحة ومتاحة للترحيل المحاسبي.
  - `CLOSING`: جاري الإقفال (تُعامل رقابياً كمعاملة مقفلة وتمنع الترحيل).
  - `CLOSED`: مقفلة تماماً وتمنع الترحيل والتعديل.
  - `REOPENED`: أُعيد فتحها بمبرر رقابي ومتاحة للترحيل.

- **`PeriodCloseAuditAction` (Enum)**:
  - `CLOSE_STARTED` | `CLOSED` | `REOPENED` | `FAILED_VALIDATION`.

- **`PeriodClose` (نموذج إقفال الفترات)**:
  - `id`: المعرّف الفريد.
  - `companyId`: معرّف الشركة المستأجرة (عزل تام للمستأجرين).
  - `fiscalYear` (Int) و `periodNumber` (Int?): السنة المالية ورقم الفترة (1-12).
  - `periodStart` و `periodEnd` (DateTime): نطاق الفترة بتوقيت UTC.
  - `status` (`PeriodCloseStatus` @default(OPEN)).
  - `closedAt`, `closedById`: وقت ومستخدم الإقفال.
  - `reopenedAt`, `reopenedById`, `reopenReason`: وقت ومستخدم وسبب إعادة الفتح.
  - `notes`: ملاحظات اختيارية.
  - الفهرس الفريد: `@@unique([companyId, periodStart, periodEnd])`.

- **`FiscalYearClose` (نموذج إقفال السنوات المالية)**:
  - `id`: المعرّف الفريد.
  - `companyId`: معرّف الشركة.
  - `fiscalYear` (Int): رقم السنة المالية (مثل 2026).
  - `fiscalYearStart` و `fiscalYearEnd` (DateTime): نطاق السنة المالية.
  - `status` (`PeriodCloseStatus` @default(OPEN)).
  - `retainedEarningsJournalEntryId` (String?): حقل معرّف قيد الأرباح المبقاة (موجود في المخطط ويبقى `null` في هذه المرحلة).
  - `closedAt`, `closedById`, `reopenedAt`, `reopenedById`, `reopenReason`, `notes`.
  - الفهارس الفريدة: `@@unique([companyId, fiscalYear])` و `@@unique([companyId, fiscalYearStart, fiscalYearEnd])`.

- **`PeriodCloseAuditLog` (سجل التدقيق الرقابي)**:
  - سجل غير قابل للتعديل يوثق عمليات `CLOSED` و `REOPENED` للفترات والسنوات المالية مع المستخدم المسؤول `actorUserId`، والسبب `reason`، والبيانات الإضافية `metadata` (Json).

- **عزل المستأجرين (Tenant Isolation)**: جميع السجلات معزولة تماماً على مستوى الشركة `companyId` المستخرج حصراً من رمز الـ JWT.

---

### 3. APIs (واجهات برمجة التطبيقات)
المسارات المتاحة تحت البادئة `/api/accounting/period-close`:

#### أ. واجهات الاستعلام والقراءة (Read-Only):
- `GET /api/accounting/period-close/status`: فحص حالة تاريخ معين (افتراضياً اليوم) وإرجاع حالة الفترة المحاسبية والسنة المالية وما إذا كان الترحيل متاحاً أو مغلقاً.
- `GET /api/accounting/period-close/periods`: استعراض سجل الفترات المحاسبية مع إمكانية التصفية بالحالة أو السنة المالية.
- `GET /api/accounting/period-close/fiscal-years`: استعراض سجل السنوات المالية المسجلة وحالاتها.
- `GET /api/accounting/period-close/audit-log`: استعراض سجل التدقيق الرقابي للعمليات.

#### ب. واجهات التحقق والفحص (Validation):
- `POST /api/accounting/period-close/periods/validate`: التحقق المسبق من جاهزية الفترة للإقفال والتأكد من استيفاء الفحوصات المانعة.
- `POST /api/accounting/period-close/fiscal-years/validate`: التحقق المسبق من جاهزية السنة المالية للإقفال وإرجاع تفاصيل الفحوصات ومجموع المدين والدائن.

#### ج. واجهات سير العمل والتحكم (Workflow):
- `POST /api/accounting/period-close/periods/close`: إقفال فترة محاسبية محددة وتغيير حالتها إلى `CLOSED` وتوثيق العملية في سجل التدقيق.
- `POST /api/accounting/period-close/periods/:id/reopen`: إعادة فتح فترة مقفلة وتحويلها إلى `OPEN` مع اشتراط تسجيل سبب إعادة الفتح.
- `POST /api/accounting/period-close/fiscal-years/close`: إقفال سنة مالية محددة وتغيير حالتها إلى `CLOSED` بعد اجتياز التحقق.
- `POST /api/accounting/period-close/fiscal-years/:id/reopen`: إعادة فتح سنة مالية مقفلة مع اشتراط تسجيل سبب إعادة الفتح.

---

### 4. RBAC (الأذونات والصلاحيات)
أذونات مخصصة لوحدة إقفال الفترات مدمجة في نظام الصلاحيات ومصفوفة الأدوار:
- **`period_close.read`**: استعراض حالة الفترات والسنوات وسجل التدقيق وتشغيل واجهات التحقق المسبق.
- **`period_close.close`**: صلاحية تنفيذ إقفال الفترات المحاسبية والسنوات المالية.
- **`period_close.reopen`**: صلاحية إعادة فتح الفترات والسنوات المالية المقفلة.

---

### 5. Validation Behavior (سلوك محرك التحقق)

#### فحوصات إقفال الفترة المحاسبية (`validatePeriod`):
- `DATE_RANGE_VALID`: التحقق من صحة تواريخ الفترة وتأكيد أن تاريخ النهاية أكبر من أو يساوي البداية (مانع).
- `NO_EXISTING_CLOSED_OVERLAP`: التأكد من عدم وجود أي فترة أخرى بحالة `CLOSED` أو `CLOSING` تتداخل مع النطاق المطلوب (مانع).
- `NO_DRAFT_JOURNALS`: التأكد من خلو الفترة من أي مسودات قيود `DRAFT` (يجب ترحيلها أو إلغاؤها قبل الإقفال) (مانع).
- `POSTED_JOURNALS_BALANCED`: التحقق الدقيق باستخدام `Prisma.Decimal` من توازن كل قيد مرحّل داخل الفترة (مدين = دائن) (مانع).
- `TRIAL_BALANCE_BALANCED`: تجميع حركات كافة أسطر القيود المرحلة والتأكد من توازن ميزان المراجعة للفترة (مانع).
- `NO_FAILED_POSTING_EVENTS`: فحص أحداث الترحيل (متخطى `SKIPPED` لعدم وجود سجل أخطاء مستقل).
- `RECONCILIATION_WARNINGS`: فحص تنبيهات المطابقة البنكية (إعلامي غير مانع).

#### فحوصات إقفال السنة المالية (`validateFiscalYear`):
- `FISCAL_YEAR_RANGE_VALID`: صحة نطاق تواريخ السنة المالية (مانع).
- `NO_EXISTING_CLOSED_FISCAL_YEAR_OVERLAP`: عدم وجود سنة مالية أخرى مقفلة تتداخل مع التواريخ (مانع).
- `ALL_PERIODS_CLOSED`: اشتراط وجود فترات محاسبية داخل نطاق السنة، والتأكد من أن جميع الفترات بالكامل بحالة `CLOSED` (مانع).
- `NO_DRAFT_JOURNALS_IN_YEAR`: خلو السنة المالية من أي قيود يومية مسودة (مانع).
- `POSTED_JOURNALS_BALANCED_IN_YEAR`: توازن جميع القيود المرحلة الفردية داخل السنة المالية (مانع).
- `YEAR_TRIAL_BALANCE_BALANCED`: توازن ميزان المراجعة لكامل حركات السنة المالية (مانع).
- `RETAINED_EARNINGS_POSTING_SKIPPED`: إشعار بتخطي قيد الأرباح المبقاة (إعلامي غير مانع `SKIPPED`).

---

### 6. Posting Guard Behavior (حواجز منع الترحيل المحاسبي)
دالة الحماية الممركزة `assertPeriodIsOpen(companyId, entryDate, context?, txClient?)`:
- تفحص أولاً جدول `PeriodClose`: إذا وجد سجل بحالة `CLOSED` أو `CLOSING` يغطي تاريخ المعاملة، ترفض العملية برمز خطأ `409 Conflict` وتوضح أن المنع ناتج عن فترة محاسبية مقفلة.
- تفحص ثانياً جدول `FiscalYearClose`: إذا وجد سجل بحالة `CLOSED` أو `CLOSING` يغطي تاريخ المعاملة، ترفض العملية برمز خطأ `409 Conflict` وتوضح أن المنع ناتج عن سنة مالية مقفلة.
- الحماية مفروضة تلقائياً عبر المعاملات التالية:
  - إنشاء قيود اليومية اليدوية (`create manual journal entry`).
  - تعديل قيود اليومية اليدوية وتعديل تواريخها (`update manual journal entry`).
  - ترحيل قيود اليومية اليدوية (`post manual journal entry`).
  - إلغاء قيود اليومية اليدوية (`cancel manual journal entry`).
  - ترحيل فواتير المبيعات الصادرة تلقائياً (`sales invoice issue`).
  - ترحيل فواتير المشتريات المستلمة تلقائياً (`purchase invoice receive`).
  - ترحيل سندات قبض العملاء (`AR payment`).
  - ترحيل سندات صرف الموردين (`AP payment`).
- **العمليات المسموحة**: استعراض التقارير والقوائم المالية يظل متاحاً للقراءة، وعمليات استيراد ومطابقة وإلغاء مطابقة كشوف الحسابات البنكية تظل متاحة لأنها لا تولد قيوداً في دفتر الأستاذ العام.

---

### 7. Frontend Workspace (واجهة المستخدم لإقفال الفترات)
مسار الصفحة: `/accounting/period-close`
- **حماية الصلاحيات**: تشترط صلاحية `period_close.read` لعرض الصفحة، مع إظهار بطاقة توجيهية واضحة للمستخدمين غير المصرح لهم.
- **مفتش الحالة الفورية (Current Status Inspector)**: اختيار أي تاريخ لمعرفة هل الفترة أو السنة المالية مفتوحة أو مقفلة وهل الترحيل مسموح أو محظور.
- **لوحة الفترات المحاسبية (Periods Tab)**:
  - نموذج إدخال تواريخ وملاحظات الفترة.
  - زر الفحص والتحقق (`Validate`) مع جدول تفصيلي بحالات الفحوصات ومجموع المدين والدائن.
  - زر الإقفال (`Close Period`) مقيد بصلاحية `period_close.close` ومحمي بتأكيد المستخدم.
  - جدول الفترات المحاسبية السابقة مع شارات الحالة وتفاصيل الإقفال.
  - زر إعادة فتح الفترة (`Reopen`) مقيد بصلاحية `period_close.reopen` ويفتح نافذة تطلب تسبيب مبرر الفتح.
- **لوحة السنوات المالية (Fiscal Years Tab)**:
  - نموذج إقفال السنة المالية مع إشعار صريح باستبعاد قيد الأرباح المبقاة.
  - زر التحقق من السنة المالية وعرض توازن السنة بالكامل.
  - زر إقفال السنة المالية مقيد بالصلاحيات وتأكيد المستخدم.
  - جدول السنوات المالية مع إمكانية إعادة الفتح بمبرر رقابي.
- **لوحة سجل التدقيق (Audit Trail Tab)**:
  - استعراض زمني غير قابل للتعديل لكافة عمليات الإقفال وإعادة الفتح مع المستخدم والسبب والبيانات الوصفية.
- **روابط التنقل المحاسبي**: روابط سريعة للقوائم المالية `/accounting/reports`، والمطابقة البنكية، ودليل الحسابات، ولوحة التحكم.

---

### 8. Accounting Invariants (الثوابت المحاسبية الصارمة)
- **عدم إنشاء قيد أرباح مبقاة**: لا يتم إنشاء أي قيد لترحيل الأرباح المبقاة (`retainedEarningsJournalEntryId` يبقى `null`).
- **عدم تعديل القيود القائمة**: لا يتم تعديل أو كتابة أي أسطر قيود بصورة صامتة؛ الحواجز تمنع الترحيل قبل بدء المعاملة المصرفية وترفضه بـ 409 Conflict.
- **استقلالية حالة الدفعات**: لا تُستخدم حالة الدفعة `Payment.status` لتمثيل حالة الإقفال وتظل مستقلة تماماً.
- **استقلالية المطابقة البنكية**: لا تؤثر عمليات المطابقة البنكية على دفتر الأستاذ ولا تتأثر بحواجز إقفال الفترات.
- **التعامل الصارم مع العمليات النقدية**: العمليات الحسابية في الـ Backend تعتمد حصراً على `Prisma.Decimal`، وتُعرض في الـ Frontend كسلاسل نصية منسقة دون استخدام دالة `Number()` في الحسابات المحاسبية.

---

### 9. Verification Summary (سجل التحقق المعتمد)
- **Prisma Client Generate**: **PASS** (`Prisma Client v5.22.0`).
- **Backend Build (`pnpm --filter @erp/backend build`)**: **PASS** (NestJS compiled successfully).
- **Backend E2E Tests (`pnpm --filter @erp/backend test:e2e`)**: **PASS = 207/207 tests** عبر مجموعتي الاختبار (`reports.e2e-spec.ts` و `app.e2e-spec.ts`).
- **Frontend Build (`pnpm --filter @erp/frontend build`)**: **PASS** (Next.js compiled with 19 static routes including `○ /accounting/period-close`).
- **حالة شجرة العمل (Working Tree)**: نظيفة ومستقرة تماماً خلال التحقق النهائي في المرحلة 14A-D-1.

---

### 10. Out of Scope (خارج النطاق ومؤجل للمراحل القادمة)
- ❌ **قيد إقفال الأرباح المبقاة الآلي (Automated Retained Earnings Closing Entry)**.
- ❌ **إقفال المخزون الدوري (Inventory Period Close)**.
- ❌ **إقفال الرواتب ومسيرات الأجور (Payroll Close)**.
- ❌ **الإقرارات الضريبية والفوترة الإلكترونية لهيئة الزكاة (Tax / ZATCA Filing)**.
- ❌ **إعادة تقييم العملات الأجنبية (Multi-Currency Revaluation)**.
- ❌ **الترحيل الآلي للرسوم البنكية (Bank Fee Auto-Posting)**.
- ❌ **التحقق الذكي بالذكاء الاصطناعي (AI Validation)**.
- ❌ **تصدير التقارير إلى PDF أو Excel**.
- ❌ **أي تعديلات على إعدادات النشر السحابي أو البنية التحتية (Deployment changes)**.
- ❌ **أي تعديلات على الـ schema أو الـ RBAC بعد المرحلة 14A-B-1**.



