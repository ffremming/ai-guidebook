'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

type SubmitResolutionInput = {
  logId: string;
  narrativeExplanation: string;
  disputedCategory?: string;
  disputeEvidence?: string;
};

type SubmitResolutionError = {
  error?: string;
  fields?: Record<string, string[] | undefined>;
};

export function useResolution() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: SubmitResolutionInput) => {
      const response = await fetch('/api/resolutions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const payload = (await response.json()) as SubmitResolutionError;
        throw payload;
      }

      return response.json();
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['resolution', variables.logId] });
      await queryClient.invalidateQueries({ queryKey: ['log', variables.logId] });
    },
  });

  return {
    submit: mutation.mutateAsync,
    isSubmitting: mutation.isPending,
  };
}
