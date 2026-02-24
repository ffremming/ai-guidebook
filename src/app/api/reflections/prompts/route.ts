import { NextResponse } from 'next/server';

import { AuthError } from '@/lib/auth/errors';
import { getRequiredSession } from '@/lib/auth/session';
import {
  COMPLIANCE_JUSTIFICATION_PROMPT,
  REFLECTION_PROMPT_SET_VERSION,
  STANDARD_REFLECTION_PROMPTS,
  isReflectionTriggerType,
} from '@/lib/reflections/prompts';

export async function GET(request: Request) {
  try {
    await getRequiredSession(request);
    const { searchParams } = new URL(request.url);
    const triggerTypeRaw = searchParams.get('triggerType');

    if (!isReflectionTriggerType(triggerTypeRaw)) {
      return NextResponse.json({ error: 'Invalid triggerType' }, { status: 400 });
    }

    if (triggerTypeRaw === 'COMPLIANCE_SERIOUS') {
      return NextResponse.json(
        {
          triggerType: triggerTypeRaw,
          version: REFLECTION_PROMPT_SET_VERSION,
          prompts: [COMPLIANCE_JUSTIFICATION_PROMPT],
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        triggerType: triggerTypeRaw,
        version: REFLECTION_PROMPT_SET_VERSION,
        prompts: STANDARD_REFLECTION_PROMPTS,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
