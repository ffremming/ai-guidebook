'use client';

import { useState } from 'react';

type SeverityLevel = 'ALLOWED' | 'MINOR' | 'MODERATE' | 'SERIOUS' | 'FORBIDDEN';

export type EditablePolicyRule = {
  id?: string;
  usageCategory: string;
  severityLevel: SeverityLevel;
  ruleReference: string;
  description?: string | null;
  keywords: string[];
};

type PolicyRuleEditorProps = {
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  initialDescription: string | null;
  initialRules: EditablePolicyRule[];
  onSave: (payload: {
    description: string | null;
    rules: EditablePolicyRule[];
  }) => Promise<unknown>;
};

const SEVERITIES: SeverityLevel[] = ['ALLOWED', 'MINOR', 'MODERATE', 'SERIOUS', 'FORBIDDEN'];

function emptyRule(): EditablePolicyRule {
  return {
    usageCategory: '',
    severityLevel: 'ALLOWED',
    ruleReference: '',
    description: '',
    keywords: [],
  };
}

export function PolicyRuleEditor({
  status,
  initialDescription,
  initialRules,
  onSave,
}: PolicyRuleEditorProps) {
  const isEditable = status === 'DRAFT';
  const [description, setDescription] = useState(initialDescription ?? '');
  const [rules, setRules] = useState<EditablePolicyRule[]>(initialRules);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function save() {
    setStatusMessage(null);
    setIsSaving(true);
    try {
      await onSave({
        description: description.trim() || null,
        rules,
      });
      setStatusMessage('Rules saved');
    } catch {
      setStatusMessage('Failed to save rules');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Policy Rule Editor</h2>
        {!isEditable ? (
          <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
            Read-only
          </span>
        ) : null}
      </div>

      <label className="block text-sm font-medium text-slate-900" htmlFor="policy-description">
        Description
      </label>
      <textarea
        id="policy-description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={3}
        disabled={!isEditable}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
      />

      <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-800">
            <tr>
              <th className="px-2 py-2 font-semibold">Usage Category</th>
              <th className="px-2 py-2 font-semibold">Severity</th>
              <th className="px-2 py-2 font-semibold">Rule Reference</th>
              <th className="px-2 py-2 font-semibold">Keywords (comma-separated)</th>
              {isEditable ? <th className="px-2 py-2 font-semibold">Remove</th> : null}
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, index) => (
              <tr key={rule.id ?? `rule-${index}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-2 py-2">
                  <input
                    value={rule.usageCategory}
                    onChange={(event) =>
                      setRules((prev) =>
                        prev.map((item, idx) =>
                          idx === index ? { ...item, usageCategory: event.target.value } : item,
                        ),
                      )
                    }
                    disabled={!isEditable}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    value={rule.severityLevel}
                    onChange={(event) =>
                      setRules((prev) =>
                        prev.map((item, idx) =>
                          idx === index
                            ? { ...item, severityLevel: event.target.value as SeverityLevel }
                            : item,
                        ),
                      )
                    }
                    disabled={!isEditable}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
                  >
                    {SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input
                    value={rule.ruleReference}
                    onChange={(event) =>
                      setRules((prev) =>
                        prev.map((item, idx) =>
                          idx === index ? { ...item, ruleReference: event.target.value } : item,
                        ),
                      )
                    }
                    disabled={!isEditable}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={rule.keywords.join(', ')}
                    onChange={(event) =>
                      setRules((prev) =>
                        prev.map((item, idx) =>
                          idx === index
                            ? {
                                ...item,
                                keywords: event.target.value
                                  .split(',')
                                  .map((keyword) => keyword.trim())
                                  .filter(Boolean),
                              }
                            : item,
                        ),
                      )
                    }
                    disabled={!isEditable}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
                  />
                </td>
                {isEditable ? (
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setRules((prev) => prev.filter((_, idx) => idx !== index))
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                    >
                      Remove
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isEditable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRules((prev) => [...prev, emptyRule()])}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Add Rule
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save Rules'}
          </button>
        </div>
      ) : null}

      {statusMessage ? <p className="mt-2 text-sm text-slate-700">{statusMessage}</p> : null}
    </section>
  );
}
