'use client';

type NarrativeExplanationFormProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
};

export function NarrativeExplanationForm({
  value,
  onChange,
  error,
  disabled = false,
}: NarrativeExplanationFormProps) {
  const helperId = 'narrative-explanation-helper';
  const errorId = 'narrative-explanation-error';

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <label htmlFor="narrativeExplanation" className="block text-base font-semibold text-slate-900">
        Narrative Explanation
      </label>
      <p id={helperId} className="mt-1 text-sm text-slate-700">
        Explain what you did, why you used the tool, and how your output aligns with the assignment
        requirements.
      </p>
      <textarea
        id="narrativeExplanation"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        disabled={disabled}
        aria-describedby={error ? `${helperId} ${errorId}` : helperId}
        className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
        placeholder="Describe your intent, what prompts you used, and what parts you wrote yourself."
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm text-slate-700">{value.length} characters</p>
        {error ? (
          <p id={errorId} className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
