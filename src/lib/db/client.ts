import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton for the AI Guidebook application.
 *
 * Why the global pattern:
 * Next.js hot-reload re-evaluates every module on each file save. Without the
 * global guard, each reload creates a new PrismaClient instance — and a new
 * connection pool — while the previous instance is not garbage-collected.
 * This causes the "too many connections" warning in development.
 *
 * In production the module is loaded once, so the `if` branch is never entered
 * and the guard has no overhead.
 *
 * Usage:
 *   import { prisma } from '@/lib/db/client';
 *   const user = await prisma.user.findUnique({ where: { id } });
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
