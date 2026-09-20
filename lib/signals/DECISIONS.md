# Decision candidates

Run `npm run build:decisions` from the repository root. No API key or model is
needed. The builder reads validated ExternalSignal batches in
`data/signals/extracted/*.json` and writes corresponding batch files to
`data/signals/decisions/`. Each output contains `transformVersion`, `sourceBatch`
(the input filename), and `decisions`. All inputs are validated before writes;
malformed input fails the command. Empty batches produce an empty decisions array.
Individual writes are atomic, but the whole directory build is not transactional.

The runtime schema and inferred TypeScript type live in `decisions.ts`:

```ts
type DecisionCandidateType = "required_event" | "optional_policy";
interface DecisionCandidate {
  id: string;
  signalId: string;
  documentId: string;
  transformVersion: "signal-decisions-v1";
  type: DecisionCandidateType;
  category: ExternalSignal["category"];
  title: string;
  problem: string;
  proposedAction?: string;
  supportedBenefits: string[];
  supportedRisks: string[];
  affectedGroups: string[];
  urgency: "low" | "medium" | "high" | null;
  source: ExternalSignal["source"];
  provenance: ExternalSignal["provenance"];
  evidence: ExternalSignal["evidence"];
  geography: ExternalSignal["geography"];
  eventDate: ExternalSignal["eventDate"];
  status: ExternalSignal["status"];
}
```

`title` and `problem` copy the headline and summary verbatim. Source metadata,
provenance, quotes, geography, event date and status are copied without changing
the original signal. Source/provenance extra metadata is retained. The original
model and prompt version describe extraction; `transformVersion` identifies this
deterministic layer. IDs are SHA-256 of the transform version and original signal
ID, so repeated builds are stable. Input signal IDs are treated as immutable.

Classification requires the same reactive rule to match a non-ambiguous sentence
in both headline/summary and evidence. Rules cover deficits, shortages, closures,
declared emergencies, disruptions, outages, failures and critical/severe
underfunding. Proposed/completed signals always default to optional. Sentences
with negation, hypothetical/preventive/planning/resolution language are excluded.
Everything else defaults to optional, including ambiguous signals and routine
mentions of emergency funds. These are conservative English heuristics, not full
semantic reasoning; ambiguous cases can be missed. A required event is a candidate
classification as of the source's event/date, not a claim of urgency today.

Urgency is `high` only when a reactive signal and its evidence explicitly mention
urgent/immediate action, response or attention. Otherwise urgency is `null`
(unknown), rather than inventing a priority. This version emits no low/medium
priorities. It leaves benefits, risks and affected groups empty and omits
proposedAction: the input schema does not structure those facts, and this version
does not attempt to infer them from prose. Empty means unstructured/unknown, not
that no benefits or risks exist. Source numeric facts remain in copied text but
are never converted into simulation effects.

`decisionCandidateSchema` checks structure and rejects unknown top-level fields
including numeric game effects. `validateDecisionCandidate(candidate, signal)`
also enforces the exact deterministic mapping, rejecting invented benefits,
altered quotes or other changes that structural validation alone cannot detect.
This layer assumes the input has passed existing evidence validation; it does not
fetch or revalidate the source document.

No selection, cross-batch merging, scheduling, frontend or database integration is
performed. Different extraction runs can yield separate candidates for the same
story; output retains the original batch boundary. Reruns overwrite corresponding
outputs, but do not delete outputs whose input files were subsequently removed.
