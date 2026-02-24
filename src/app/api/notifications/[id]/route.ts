import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

const patchNotificationSchema = z.object({
  isRead: z.literal(true),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getRequiredSession(request);

    if (session.user.role !== UserRole.STUDENT) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await context.params;
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: 'Invalid notification id' }, { status: 400 });
    }

    const rawBody = await request.json();
    const parsedBody = patchNotificationSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          fields: parsedBody.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const existing = await prisma.policyChangeNotification.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await prisma.policyChangeNotification.update({
      where: {
        id: existing.id,
      },
      data: {
        isRead: true,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
