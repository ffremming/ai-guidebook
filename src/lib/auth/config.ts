import { UserRole } from '@prisma/client';
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { writeAuditLog } from '@/lib/audit/logger';
import { prisma } from '@/lib/db/client';

type CallbackUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  role?: UserRole;
  authSubject?: string;
};

function toNormalizedEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function toTrimmedName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60,
    updateAge: 15 * 60,
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      id: 'credentials',
      name: 'Institution Account',
      credentials: {
        email: { label: 'Email', type: 'email' },
        name: { label: 'Name', type: 'text' },
      },
      async authorize(credentials) {
        const email = toNormalizedEmail(credentials?.email);
        const name = toTrimmedName(credentials?.name);

        if (!email || !name) {
          return null;
        }

        return {
          email,
          name,
          authSubject: `local:${email}`,
        } as CallbackUser;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const callbackUser = user as CallbackUser;
      const email = toNormalizedEmail(callbackUser.email);
      const name = toTrimmedName(callbackUser.name);

      const profileSub =
        typeof profile?.sub === 'string' && profile.sub.length > 0
          ? profile.sub
          : null;
      const providerAccountSub =
        typeof account?.providerAccountId === 'string' &&
        account.providerAccountId.length > 0
          ? account.providerAccountId
          : null;
      const fallbackSub = email ? `local:${email}` : null;
      const subject =
        callbackUser.authSubject ?? profileSub ?? providerAccountSub ?? fallbackSub;

      if (!email || !name || !subject) {
        return false;
      }

      try {
        const dbUser = await prisma.user.upsert({
          where: { authSubject: subject },
          update: {
            email,
            name,
          },
          create: {
            email,
            name,
            role: UserRole.STUDENT,
            authSubject: subject,
          },
          select: {
            id: true,
            role: true,
          },
        });

        callbackUser.id = dbUser.id;
        callbackUser.role = dbUser.role;
        callbackUser.authSubject = subject;

        await writeAuditLog({
          actorId: dbUser.id,
          actionType: 'USER_LOGIN',
          resourceType: 'user',
          resourceId: dbUser.id,
          metadataJson: {
            provider: account?.provider ?? 'credentials',
            subject,
          },
        });

        return true;
      } catch {
        return false;
      }
    },
    async jwt({ token, user }) {
      const callbackUser = user as CallbackUser | undefined;

      if (callbackUser) {
        if (callbackUser.id) {
          token.userId = callbackUser.id;
        }

        if (callbackUser.role) {
          token.userRole = callbackUser.role;
        }

        if (callbackUser.authSubject) {
          token.authSubject = callbackUser.authSubject;
        }
      }

      if (!token.userId || !token.userRole) {
        let dbUser = null;

        if (typeof token.authSubject === 'string' && token.authSubject.length > 0) {
          dbUser = await prisma.user.findUnique({
            where: { authSubject: token.authSubject },
            select: { id: true, role: true },
          });
        }

        if (!dbUser && typeof token.email === 'string' && token.email.length > 0) {
          dbUser = await prisma.user.findUnique({
            where: { email: token.email },
            select: { id: true, role: true, authSubject: true },
          });

          if (dbUser?.authSubject) {
            token.authSubject = dbUser.authSubject;
          }
        }

        if (dbUser) {
          token.userId = dbUser.id;
          token.userRole = dbUser.role;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.userId === 'string') {
          session.user.id = token.userId;
        }

        if (token.userRole) {
          session.user.role = token.userRole as UserRole;
        }
      }

      return session;
    },
  },
};
