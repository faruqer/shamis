# Stock & Money Management System

A professional full-stack inventory and financial management platform built with **Next.js 15**, **PostgreSQL**, and **Prisma**. Designed for businesses importing goods from China and selling through wholesale and retail channels.

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
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT sessions (httpOnly cookies)
- **UI**: Tailwind CSS v4, Framer Motion, Lucide icons
- **Theme**: Clean green professional design

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL running locally or remotely

### Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your PostgreSQL connection:
   ```
   DATABASE_URL="postgresql://postgres:password@localhost:5432/stock_money?schema=public"
   JWT_SECRET="your-secret-key-here"
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
│   ├── api/          # REST API routes
│   ├── dashboard/    # Main dashboard
│   ├── imports/      # Import management
│   ├── inventory/    # Stock viewer
│   ├── sales/        # Wholesale, shop transfer, retail
│   ├── clients/      # Client management
│   ├── expenses/     # Cost tracking
│   ├── ledger/       # Money ledger
│   └── users/        # User management (admin)
├── components/       # UI components
└── lib/              # Auth, prisma, utilities
prisma/
├── schema.prisma     # Database schema
└── seed.ts           # Demo data seeder
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push schema to DB |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio |

## License

Private — All rights reserved.
