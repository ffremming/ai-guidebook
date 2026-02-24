export type ReflectionTriggerType = 'STANDARD_EXPORT' | 'COMPLIANCE_SERIOUS';

export const REFLECTION_PROMPT_SET_VERSION = 'v1';

export const STANDARD_REFLECTION_PROMPTS = [
  'What did AI help you do in this assignment, and what did you do yourself?',
  'Which AI outputs did you reject or revise, and why?',
  'How did this AI use affect your learning process and confidence in the final result?',
] as const;

export const COMPLIANCE_JUSTIFICATION_PROMPT =
  'This action appears to conflict with course policy. Explain why this specific AI use is necessary, what alternatives you considered, and how you will reduce policy risk.';

export function isReflectionTriggerType(value: string | null): value is ReflectionTriggerType {
  return value === 'STANDARD_EXPORT' || value === 'COMPLIANCE_SERIOUS';
}
