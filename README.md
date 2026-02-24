# AI Guidebook

AI Guidebook is a Next.js app for student AI usage logging, compliance checks, declarations, and reflections.

This setup is for first-time users.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker

Quick check:

```bash
node -v
npm -v
docker -v
docker info >/dev/null && echo "Docker is running"
```

## 1. Install Dependencies

```bash
npm install
```

## 2. Start PostgreSQL

### Option A (recommended): Docker PostgreSQL

```bash
docker run -d \
  --name guidebook-postgres \
  -e POSTGRES_USER=guidebook_user \
  -e POSTGRES_PASSWORD=guidebook_dev \
  -e POSTGRES_DB=guidebook_db \
  -p 5433:5432 \
  postgres:16
```

### Option B: Existing PostgreSQL

Use your own DB and set `DATABASE_URL` in `.env`.

## 3. Configure Environment Variables

Create `ai-guidebook/.env` with:

```env
DATABASE_URL="postgresql://guidebook_user:guidebook_dev@localhost:5433/guidebook_db?schema=public"
NEXTAUTH_SECRET="replace-with-random-secret"
AUTH_SECRET="replace-with-random-secret"
ENCRYPTION_KEY="replace-with-64-hex-characters"
INTERNAL_CLASSIFY_TOKEN="replace-with-random-secret"
NEXTAUTH_URL="http://localhost:3000"
```

Generate secrets:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

If `openssl` is unavailable, generate values another secure way and paste them into `.env`.

## 4. Run Migrations

```bash
npx prisma migrate deploy
```

Verify migration state:

```bash
npx prisma migrate status
```

## 5. Seed Data (required for first run)

```bash
npm run db:seed
```

This creates baseline users, courses, assignments, policy versions, and rules.

## 6. Start App

```bash
npm run dev
```

Open:

- `http://localhost:3000/login`

## 7. Login

Use the credentials form (name + email). Seeded emails you can use:

- `student@ntnu.no`
- `instructor@ntnu.no`
- `admin@ntnu.no`

## 8. Smoke Test (2 minutes)

After login, verify these pages load without 500 errors:

1. `/dashboard`
2. `/assignments`
3. `/log`
4. `/reflections`

Then create one log and confirm it appears in dashboard/my logs.

## Useful Commands

```bash
npm run lint
npm run build
npm run test:integration
npm run test:e2e
```

## Common Problems

### 500 on `/api/assignments`

Usually one of these:

1. DB is down
2. Migrations not applied
3. Fresh DB but stale login session

Fix:

```bash
docker ps
npx prisma migrate deploy
npx prisma migrate status
```

Then sign out and sign in again.

### Reflection endpoints failing

Run migrations and verify status:

```bash
npx prisma migrate deploy
npx prisma migrate status
```

### `AUTH_REQUIRED` after switching database

Your JWT references a user that does not exist in the new DB.

Fix: sign out and sign in again.

## Notes

- This project can safely share one Postgres server with other projects if you use a separate database in `DATABASE_URL`.
- If you change `.env`, restart `npm run dev`.

## Windows note

Commands are shown for bash/zsh. On Windows, run equivalent commands in PowerShell and edit `.env` manually.
