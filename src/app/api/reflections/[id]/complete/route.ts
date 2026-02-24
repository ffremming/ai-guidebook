import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ZodError, z } from 'zod';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { encryptNullableText } from '@/lib/encryption/field-encryptor';
import { STANDARD_REFLECTION_PROMPTS } from '@/lib/reflections/prompts';

const completeSchema = z.object({
  responses: z.array(z.string().trim()).optional(),
  justificationText: z.string().trim().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getRequiredSession(request);
    if (session.user.role !== UserRole.STUDENT) {
      return NextResponse.json({ error: 'Student role required' }, { status: 403 });
    }

    const { id } = await context.params;
    const parsed = completeSchema.parse(await request.json());

    const existing = await prisma.reflectionJournalEntry.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        triggerType: true,
        status: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Reflection entry not found' }, { status: 404 });
    }

    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (existing.triggerType === 'COMPLIANCE_SERIOUS') {
      const justification = parsed.justificationText?.trim() ?? '';
      if (justification.length === 0) {
        return NextResponse.json(
          {
            error: 'Validation failed',
            fields: {
              justificationText: ['Justification is required for serious compliance flags'],
            },
          },
          { status: 400 },
        );
      }

      const updated = await prisma.reflectionJournalEntry.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          responsesJson: {
            justification,
          },
          justificationText: encryptNullableText(justification),
          completedAt: new Date(),
        },
        select: {
          id: true,
          assignmentId: true,
          triggerType: true,
          status: true,
          completedAt: true,
        },
      });

      return NextResponse.json({ entry: updated }, { status: 200 });
    }

    const responses = parsed.responses ?? [];
    if (responses.length !== STANDARD_REFLECTION_PROMPTS.length) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fields: {
            responses: [`Expected ${STANDARD_REFLECTION_PROMPTS.length} answers`],
          },
        },
        { status: 400 },
      );
    }

    const hasEmptyResponse = responses.some((value) => value.trim().length === 0);
    if (hasEmptyResponse) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fields: {
            responses: ['All reflection questions must be answered'],
          },
        },
        { status: 400 },
      );
    }

    const updated = await prisma.reflectionJournalEntry.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        responsesJson: {
          responses,
        },
        completedAt: new Date(),
      },
      select: {
        id: true,
        assignmentId: true,
        triggerType: true,
        status: true,
        completedAt: true,
      },
    });

    return NextResponse.json({ entry: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json(
        {
          error:
            'Reflection journal is not available yet. Run database migrations and try again.',
        },
        { status: 409 },
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          fields: error.flatten().fieldErrors,
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
