import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ZodError, z } from 'zod';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

const createReflectionNoteSchema = z
  .object({
    content: z.string().trim().min(1, 'Reflection is required').max(5000),
  })
  .strict();

function zodFieldErrors(error: ZodError) {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!fields[path]) {
      fields[path] = [];
    }
    fields[path].push(issue.message);
  }

  return fields;
}

export async function GET(request: Request) {
  try {
    const session = await getRequiredSession(request);

    const notes = await prisma.reflectionNote.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });

    return NextResponse.json(
      {
        notes: notes.map((note) => ({
          id: note.id,
          content: note.content,
          createdAt: note.createdAt,
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json(
        {
          notes: [],
          reflectionFeatureUnavailable: true,
        },
        { status: 200 },
      );
    }

    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getRequiredSession(request);

    if (session.user.role !== UserRole.STUDENT) {
      return NextResponse.json({ error: 'Student role required' }, { status: 403 });
    }

    const parsed = createReflectionNoteSchema.parse(await request.json());

    const created = await prisma.reflectionNote.create({
      data: {
        userId: session.user.id,
        content: parsed.content,
      },
    });

    return NextResponse.json(
      {
        note: {
          id: created.id,
          content: created.content,
          createdAt: created.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json(
        {
          error: 'Reflection notes are not available yet. Run database migrations and try again.',
        },
        { status: 409 },
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fields: zodFieldErrors(error),
        },
        { status: 400 },
      );
    }

    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
