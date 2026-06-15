# JO-Administrativo

Sistema ERP/POS para gestión empresarial. Ventas, inventario, caja, compras y finanzas.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **UI**: Tailwind CSS 4 + shadcn/ui
- **Database**: PostgreSQL (Neon) + Prisma ORM
- **State**: Zustand
- **Real-time**: Pusher
- **Storage**: Vercel Blob
- **Email**: Resend
- **Deploy**: Vercel

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Push database schema
npx prisma db push

# Seed database (optional)
npx tsx prisma/seed.ts

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/              # Next.js App Router (API routes)
│   └── api/          # REST API endpoints
├── components/       # React components
│   ├── ui/           # shadcn/ui components
│   ├── pos/          # POS Terminal
│   ├── products/     # Product management
│   ├── purchases/    # Purchase management
│   ├── clients/      # Client management
│   ├── cash/         # Cash register
│   ├── dashboard/    # Financial dashboard
│   ├── expenses/     # Expense tracking
│   └── layout/       # App shell, sidebar, header
├── lib/              # Utilities (db, api, utils)
├── stores/           # Zustand state stores
└── hooks/            # Custom React hooks
prisma/
├── schema.prisma     # Database schema
└── seed.ts           # Seed data
```
