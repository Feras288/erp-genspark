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

**آخر تحديث:** المرحلة 0 — جاهزة للبناء، بانتظار موافقة الانتقال إلى المرحلة 1.
