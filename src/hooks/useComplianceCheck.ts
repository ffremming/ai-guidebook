'use client';

import { useEffect, useMemo, useState } from 'react';

type CompliancePreview = {
  status: 'PENDING' | 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT';
  severityLevel: 'ALLOWED' | 'MINOR' | 'MODERATE' | 'SERIOUS' | 'FORBIDDEN' | null;
  isSerious: boolean;
  detectedCategory: string | null;
  ruleReferences: string[];
  message: string;
};

type UseComplianceCheckState = {
  result: CompliancePreview | null;
  isLoading: boolean;
  error: string | null;
};

export function useComplianceCheck(reason: string, assignmentId: string | null) {
  const [state, setState] = useState<UseComplianceCheckState>({
    result: null,
    isLoading: false,
    error: null,
  });

  const trimmedReason = useMemo(() => reason.trim(), [reason]);

  useEffect(() => {
    if (!assignmentId || trimmedReason.length === 0) {
      setState({ result: null, isLoading: false, error: null });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await fetch('/api/compliance/intent-check', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            reason: trimmedReason,
            assignmentId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Unable to evaluate compliance');
        }

        const payload = (await response.json()) as CompliancePreview;
        setState({ result: payload, isLoading: false, error: null });
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') {
          return;
        }
        setState({ result: null, isLoading: false, error: 'Compliance check failed' });
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [assignmentId, trimmedReason]);

  return state;
}
