'use client';

type DisputeClassificationFormProps = {
  systemCategory: string | null;
  categories: string[];
  disputedCategory: string;
  disputeEvidence: string;
  onDisputedCategoryChange: (value: string) => void;
  onDisputeEvidenceChange: (value: string) => void;
  errors?: {
    disputedCategory?: string;
    disputeEvidence?: string;
  };
  disabled?: boolean;
};

export function DisputeClassificationForm({
  systemCategory,
  categories,
  disputedCategory,
  disputeEvidence,
  onDisputedCategoryChange,
  onDisputeEvidenceChange,
  errors,
  disabled = false,
}: DisputeClassificationFormProps) {
  const categoryErrorId = 'disputed-category-error';
  const evidenceErrorId = 'dispute-evidence-error';

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Dispute Classification (Optional)</h2>
      <p className="mt-1 text-sm text-slate-700">
        System category: <span className="font-medium">{systemCategory ?? 'Unclassified'}</span>
      </p>

      <label htmlFor="disputedCategory" className="mt-3 block text-sm font-medium text-slate-900">
        Alternative category
      </label>
      <select
        id="disputedCategory"
        value={disputedCategory}
        onChange={(event) => onDisputedCategoryChange(event.target.value)}
        disabled={disabled}
        aria-describedby={errors?.disputedCategory ? categoryErrorId : undefined}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
      >
        <option value="">No dispute category selected</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
      {errors?.disputedCategory ? (
        <p id={categoryErrorId} className="mt-1 text-sm text-red-700">
          {errors.disputedCategory}
        </p>
      ) : null}

      <label htmlFor="disputeEvidence" className="mt-3 block text-sm font-medium text-slate-900">
        Dispute evidence (optional)
      </label>
      <textarea
        id="disputeEvidence"
        value={disputeEvidence}
        onChange={(event) => onDisputeEvidenceChange(event.target.value)}
        rows={4}
        disabled={disabled}
        aria-describedby={errors?.disputeEvidence ? evidenceErrorId : undefined}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
        placeholder="Add details supporting why another category is more accurate."
      />
      {errors?.disputeEvidence ? (
        <p id={evidenceErrorId} className="mt-1 text-sm text-red-700">
          {errors.disputeEvidence}
        </p>
      ) : null}
    </section>
  );
}
