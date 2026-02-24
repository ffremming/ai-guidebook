# AI Guidebook

AI Guidebook is a Next.js app for student AI usage logging, compliance checks, and declaration export.

This guide is written for first-time setup on a clean machine.

## Stack

- Next.js 16
- React 19
- Prisma ORM
- PostgreSQL 16
- NextAuth (credentials provider)

## Prerequisites

- Node.js 20+
- npm 10+
- Docker (recommended for PostgreSQL)

Check versions:

```bash
node -v
npm -v
docker -v
```

## 1. Install Dependencies

```bash
npm install
```

## 2. Start PostgreSQL

You have two options.

### Option A: Use Docker (recommended)

Start a dedicated PostgreSQL container:

```bash
docker run -d \
  --name guidebook-postgres \
  -e POSTGRES_USER=guidebook_user \
  -e POSTGRES_PASSWORD=guidebook_dev \
  -e POSTGRES_DB=guidebook_db \
  -p 5433:5432 \
  postgres:16
```

If container already exists:

```bash
docker start guidebook-postgres
```

### Option B: Use an existing local PostgreSQL instance

Use your own credentials/port and set `DATABASE_URL` accordingly.

## 3. Configure Environment Variables

Create `ai-guidebook/.env` (or edit existing) with at least:

```env
DATABASE_URL="postgresql://guidebook_user:guidebook_dev@localhost:5433/guidebook_db?schema=public"
NEXTAUTH_SECRET="replace-with-random-secret"
AUTH_SECRET="replace-with-random-secret"
ENCRYPTION_KEY="replace-with-64-hex-characters"
INTERNAL_CLASSIFY_TOKEN="replace-with-random-secret"
NEXTAUTH_URL="http://localhost:3000"
```

Generate secure values:

```bash
openssl rand -base64 32   # for NEXTAUTH_SECRET / AUTH_SECRET / INTERNAL_CLASSIFY_TOKEN
openssl rand -hex 32      # for ENCRYPTION_KEY
```

## 4. Apply Database Migrations

```bash
npx prisma migrate deploy
```

For development schema workflows, you can also use:

```bash
npx prisma migrate dev
```

## 5. Seed Initial Data (recommended)

```bash
npm run db:seed
```

This seeds users, courses, assignments, policies, and usage rules.

## 6. Start the App

```bash
npm run dev
```

Open:

- App: `http://localhost:3000`
- Login: `http://localhost:3000/login`

## 7. First Login

Use the credentials login form (name + email).

Suggested seeded emails:

- `student@ntnu.no`
- `instructor@ntnu.no`
- `admin@ntnu.no`

The auth callback upserts user records by `authSubject` and email.

## Useful Commands

```bash
npm run lint
npm run build
npm run test:integration
npm run test:e2e
```

## Common Issues

### `500` on `/api/assignments`

Most common causes:

1. PostgreSQL container is not running
2. Migrations were not applied
3. Session is stale after switching database

Fix:

```bash
docker ps
# if DB is stopped:
docker start guidebook-postgres

npx prisma migrate deploy
```

Then sign out and sign in again.

### `500` on reflection endpoints (`/api/reflections/...`)

Cause: reflection migration not applied.

Fix:

```bash
npx prisma migrate deploy
```

### `PrismaClientInitializationError` / cannot connect to DB

- Verify `DATABASE_URL` is correct
- Verify PostgreSQL is running on the host/port in `DATABASE_URL`

### `AUTH_REQUIRED` responses after database switch

Your JWT may point to a user not present in the new DB.

Fix: sign out and sign in again.

## Database Isolation Notes

You can safely run this project in the same PostgreSQL server as other projects by using a different database name/user in `DATABASE_URL`.

Example isolated DB used in this project:

- DB: `guidebook_db`
- User: `guidebook_user`

## Project Structure (high-level)

- `src/app` - routes and API handlers
- `src/components` - UI components
- `src/hooks` - React query/data hooks
- `src/lib` - auth, compliance, db helpers
- `prisma` - schema, migrations, seed

## Production Notes

- Use strong secrets in environment variables
- Use managed PostgreSQL with backups
- Run migrations as part of deployment pipeline
- Keep `NEXTAUTH_URL` aligned with deployed URL
