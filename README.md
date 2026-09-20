# Stock & Money Management System

A professional full-stack inventory and financial management platform built with **Next.js 15**, **SQLite**, and **Prisma**. Designed for businesses importing goods from China and selling through wholesale and retail channels.

## Features

### Role-Based Access
- **Admin (Owner)**: Full access — imports, shop transfers, users, dashboard analytics
- **Salesperson**: Retail sales, wholesale sales, client management, money collection tracking

### Inventory Flow
1. **Imports** — Add China import batches with multiple products
2. **Products** — Each product has cartons with configurable items per carton
3. **Warehouse** — Stock stored after import
4. **Shop Transfer** — Move stock to retail shop (separate business unit)
5. **Sales** — Wholesale (direct) or Retail (from shop)

### Financial Tracking
- **Wholesale & Retail sales** with credit support (paid, partial, credit)
- **Salesperson ledger** — tracks money collected (not handed to owner directly)
- **Expense payments** — salespersons can pay taxes, shop/warehouse costs from held funds
- **Dashboard** — revenue, stock levels, credit outstanding, held balances

## Tech Stack

- **Frontend/Backend**: Next.js 15 (App Router)
- **Database**: SQLite
- **ORM**: Prisma
- **Auth**: JWT sessions (httpOnly cookies)
- **UI**: Tailwind CSS v4, Framer Motion, Lucide icons
- **Theme**: Clean green professional design

## Getting Started

### Prerequisites
- Node.js 18+

### Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   The defaults are fine for local development. `JWT_SECRET` **must** be replaced before
   deploying — the app refuses to start in production with the example value:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Create database and push schema**
   ```bash
   npx prisma db push
   npx prisma generate
   ```

4. **Seed demo data**
   ```bash
   npm run db:seed
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

### Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@stockmoney.com | admin123 |
| Salesperson | sales@stockmoney.com | sales123 |

These are for local development only. On a real server, create the admin with your own
credentials — the seeder refuses the default password when `NODE_ENV=production`:

```bash
ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='<strong password>' npm run db:seed:admin
```

## Business Workflow

```
China Import → Warehouse Stock → Wholesale Sale (direct/credit)
                              ↘ Shop Transfer → Retail Sale (direct/credit)
                                               ↘ Expenses (tax, shop, warehouse)
Salesperson collects payments → Ledger balance → Pays expenses on owner's behalf
```

## Project Structure

```
src/
├── app/
│   ├── (app)/        # Authenticated pages (dashboard, imports, inventory,
│   │                 #   sales, clients, expenses, ledger, banks, hawala, users…)
│   ├── api/          # REST API routes
│   ├── login/        # Sign-in page
│   └── manifest.ts   # PWA manifest
├── components/       # UI components
├── lib/              # Auth, prisma, rate limiting, domain logic
└── middleware.ts     # Session gate for pages and /api
prisma/
├── schema.prisma     # Database schema
└── seed*.ts          # Demo / admin / sales seeders
scripts/              # One-off database maintenance tools (run with tsx)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push schema to DB |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio |

## Production Deployment

1. **Set a real `JWT_SECRET`** (32+ random chars) and an **absolute** `DATABASE_URL` in `.env`,
   so the app always opens the same SQLite file regardless of working directory.
2. Set `HSTS=true` only if the app is served over HTTPS. Over plain http on a LAN, leave it off.
3. Build and start:
   ```bash
   npm ci
   npm run build
   npm run start:prod
   ```
   `start:prod` applies any pending schema changes (`prisma db push`) and listens on `0.0.0.0:3000`.
   The server is kept alive with PM2.

   > **Stop the running app before rebuilding.** On Windows the live process keeps a lock on
   > Prisma's query engine, and `prisma generate` then fails with `EPERM: operation not
   > permitted, rename … query_engine-windows.dll.node`. Run `pm2 stop <app>`, build, then
   > `pm2 start <app>`.
4. **Back up `prisma/dev.db` regularly** — it holds all inventory and financial records.

### Security notes

- Sessions are JWTs in httpOnly cookies, expiring after 7 days. The app refuses to boot in
  production with a default or short `JWT_SECRET`.
- `/api/auth/login` is throttled per 5-minute window: 10 failed attempts per account and 30 per
  client IP. A successful login clears both counters. The counters live in process memory, so
  they assume a single instance; scaling out needs a shared store. If you put the app behind a
  reverse proxy, forward the real client address
  (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`) — otherwise every user shares
  the proxy's IP bucket.
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`) are set in `next.config.ts`.

## License

Private — All rights reserved.
