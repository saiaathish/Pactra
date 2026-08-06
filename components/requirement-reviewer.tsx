"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RequirementView {
  id?: string;
  type: string;
  description: string;
  parameters: Record<string, unknown>;
  verificationMode: string;
}

const TYPE_LABELS: Record<string, string> = {
  segment_placement: "Segment placement (start window)",
  segment_duration: "Segment duration",
  required_phrase: "Required phrase (exact)",
  required_meaning: "Required meaning (semantic)",
  forbidden_claim: "Forbidden claim",
  spoken_disclosure: "Spoken disclosure",
  description_disclosure: "Description disclosure",
  description_url: "Description URL",
  discount_code: "Discount code",
  logo_visibility: "Logo visibility",
  human_review: "Human review (subjective)",
};

/**
 * Review the extracted candidate requirements: edit types/descriptions,
 * delete, add, then confirm → creates the immutable brief version.
 */
export function RequirementReviewer({
  versionId,
  initial,
}: {
  versionId: string;
  initial: RequirementView[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RequirementView[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<RequirementView>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { type: "required_phrase", description: "", parameters: {}, verificationMode: "deterministic" },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const valid = rows.filter((r) => r.description.trim());
    if (valid.length === 0) {
      setError("No requirements with a description");
      setBusy(false);
      return;
    }

    const patchRes = await fetch(`/api/brief-versions/${versionId}/requirements`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requirements: valid.map((r) => ({
          id: r.id ?? undefined,
          type: r.type,
          description: r.description,
          parameters: r.parameters ?? {},
          verificationMode: r.verificationMode,
        })),
        deletedIds: rows.filter((r) => !r.description.trim() && r.id).map((r) => r.id!),
      }),
    });
    const patchPayload = await patchRes.json();
    if (!patchRes.ok) {
      setError(patchPayload.error ?? "Failed to save requirements");
      setBusy(false);
      return;
    }

    const confirmRes = await fetch(`/api/brief-versions/${versionId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const confirmPayload = await confirmRes.json();
    if (!confirmRes.ok) {
      setError(confirmPayload.error ?? "Failed to confirm version");
      setBusy(false);
      return;
    }

    router.push("/campaigns/new?briefVersionId=" + versionId);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          {rows.length} candidate requirement(s) — edit anything the parser got
          wrong. Nothing is final until you confirm.
        </p>
        <Button variant="secondary" onClick={addRow} disabled={busy}>
          Add requirement
        </Button>
      </div>

      <ul className="space-y-3">
        {rows.map((row, i) => (
          <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex items-start gap-2">
              <select
                value={row.type}
                onChange={(e) => updateRow(i, { type: e.target.value })}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Requirement description"
                value={row.description}
                onChange={(e) => updateRow(i, { description: e.target.value })}
                className="flex-1"
              />
              <Button variant="ghost" onClick={() => removeRow(i)} disabled={busy}>
                ✕
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 pl-1">
              {row.type === "required_phrase" || row.type === "forbidden_claim" ? (
                <ParameterInput
                  label="Exact phrase"
                  value={(row.parameters.phrase as string) ?? ""}
                  onChange={(v) => updateRow(i, { parameters: { ...row.parameters, phrase: v } })}
                />
              ) : null}
              {row.type === "required_meaning" ? (
                <ParameterInput
                  label="Required meaning"
                  value={(row.parameters.meaning as string) ?? ""}
                  onChange={(v) => updateRow(i, { parameters: { ...row.parameters, meaning: v } })}
                />
              ) : null}
              {row.type === "segment_placement" ? (
                <>
                  <NumberInput
                    label="Start window min (s)"
                    value={(row.parameters.start_min_s as number) ?? undefined}
                    onChange={(v) => updateRow(i, { parameters: { ...row.parameters, start_min_s: v } })}
                  />
                  <NumberInput
                    label="Start window max (s)"
                    value={(row.parameters.start_max_s as number) ?? undefined}
                    onChange={(v) => updateRow(i, { parameters: { ...row.parameters, start_max_s: v } })}
                  />
                </>
              ) : null}
              {row.type === "segment_duration" ? (
                <>
                  <NumberInput
                    label="Min seconds"
                    value={(row.parameters.minimum_seconds as number) ?? undefined}
                    onChange={(v) => updateRow(i, { parameters: { ...row.parameters, minimum_seconds: v } })}
                  />
                  <NumberInput
                    label="Max seconds"
                    value={(row.parameters.maximum_seconds as number) ?? undefined}
                    onChange={(v) => updateRow(i, { parameters: { ...row.parameters, maximum_seconds: v } })}
                  />
                </>
              ) : null}
              {row.type === "description_url" ? (
                <ParameterInput
                  label="Required URL"
                  value={(row.parameters.url as string) ?? ""}
                  onChange={(v) => updateRow(i, { parameters: { ...row.parameters, url: v } })}
                />
              ) : null}
              {row.type === "discount_code" ? (
                <ParameterInput
                  label="Discount code"
                  value={(row.parameters.code as string) ?? ""}
                  onChange={(v) => updateRow(i, { parameters: { ...row.parameters, code: v } })}
                />
              ) : null}
              {row.type === "human_review" ? (
                <span className="text-xs text-zinc-500">
                  Subjective — always flagged for human review, never auto-passed.
                </span>
              ) : null}
              {row.type === "logo_visibility" ? (
                <span className="text-xs text-zinc-500">
                  Visual check — currently not_testable (stretch test).
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button onClick={handleConfirm} disabled={busy}>
        {busy ? "Confirming…" : "Confirm version (immutable)"}
      </Button>
    </div>
  );
}

function ParameterInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-500">
      {label}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-48 py-1 text-xs"
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-500">
      {label}
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 py-1 text-xs"
      />
    </label>
  );
}
