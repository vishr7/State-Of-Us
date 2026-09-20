import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { signalDraftSchema, type ExternalSignal } from "./types";

export const DECISION_TRANSFORM_VERSION = "signal-decisions-v1";
const nonblank = z.string().refine((value) => value.trim().length > 0, "Must not be blank");
const timestamp = nonblank.refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp");

// Extend the existing draft validator; retain source/provenance extras rather than dropping metadata.
export const externalSignalSchema = signalDraftSchema.extend({
  id: nonblank,
  documentId: nonblank,
  source: z.object({ title: nonblank, url: z.url(), publisher: z.string(), publishedAt: timestamp.nullable() }).passthrough(),
  provenance: z.object({
    retrievedAt: timestamp, adapterVersion: nonblank, contentHash: nonblank,
    extractedAt: timestamp, model: nonblank, promptVersion: nonblank,
  }).passthrough(),
}).superRefine((signal, context) => {
  if (!signal.headline.trim() || !signal.summary.trim() || !signal.geography.name.trim() || signal.evidence.some(({ quote }) => !quote.trim())) {
    context.addIssue({ code: "custom", message: "Signal text and evidence must not be blank." });
  }
}) satisfies z.ZodType<ExternalSignal>;

export const decisionCandidateSchema = z.object({
  id: nonblank,
  signalId: externalSignalSchema.shape.id,
  documentId: externalSignalSchema.shape.documentId,
  transformVersion: z.literal(DECISION_TRANSFORM_VERSION),
  type: z.enum(["required_event", "optional_policy"]),
  category: signalDraftSchema.shape.category,
  title: nonblank,
  problem: nonblank,
  proposedAction: nonblank.optional(),
  supportedBenefits: z.array(nonblank),
  supportedRisks: z.array(nonblank),
  affectedGroups: z.array(nonblank),
  urgency: z.enum(["low", "medium", "high"]).nullable(),
  source: externalSignalSchema.shape.source,
  provenance: externalSignalSchema.shape.provenance,
  evidence: signalDraftSchema.shape.evidence,
  geography: signalDraftSchema.shape.geography,
  eventDate: signalDraftSchema.shape.eventDate,
  status: signalDraftSchema.shape.status,
}).strict();

export type DecisionCandidate = z.infer<typeof decisionCandidateSchema>;
export type DecisionCandidateType = DecisionCandidate["type"];

// Prefer false negatives to presenting hypothetical, denied or resolved issues as mandatory.
const ambiguous = /\b(?:no|not|never|without|avoid\w*|prevent\w*|could|would|may|might|if|risk|potential|possible|propos\w*|plan\w*|resolv\w*|reopen\w*|restor\w*|avert\w*)\b|\b(?:deficit|shortage|closure|emergency|disruption|outage)\s+(?:(?:has|have|had|is|was)\s+)?ended\b/i;
const reactiveRules = [
  /\bdeficit\b/i,
  /\b(?:shortage|shortages)\b/i,
  /\b(?:closure|closures|closed)\b/i,
  /\b(?:declared|declaration of)\s+(?:an?\s+)?(?:state of\s+)?emergency\b/i,
  /\b(?:disruption|disruptions|outage|outages|failure|failures)\b/i,
  /\b(?:critically|severely)\s+underfunded\b|\bcritical\s+underfunding\b/i,
];

function supportedSentences(text: string): string[] {
  // Do not split decimal amounts such as $8.6 million.
  return text.split(/(?<=[.!?])\s+/)
    // A superseded forecast in a leading concessive clause must not hide reported actuals.
    .map((sentence) => sentence.replace(/^Despite\b[^,]*,\s*/i, ""))
    .filter((sentence) => !ambiguous.test(sentence));
}

export function toDecisionCandidate(input: ExternalSignal): DecisionCandidate {
  const signal = externalSignalSchema.parse(input);
  const descriptions = supportedSentences(`${signal.headline}. ${signal.summary}`);
  const evidence = signal.evidence.flatMap(({ quote }) => supportedSentences(quote));
  const reactive = signal.status !== "proposed" && signal.status !== "completed"
    && reactiveRules.some((rule) => descriptions.some((text) => rule.test(text)) && evidence.some((text) => rule.test(text)));
  const urgent = /\b(?:urgent|immediate)\s+(?:action|response|attention)\b/i;
  return decisionCandidateSchema.parse({
    id: createHash("sha256").update(`${DECISION_TRANSFORM_VERSION}\n${signal.id}`).digest("hex"),
    signalId: signal.id, documentId: signal.documentId, transformVersion: DECISION_TRANSFORM_VERSION,
    type: reactive ? "required_event" : "optional_policy",
    category: signal.category, title: signal.headline, problem: signal.summary,
    // The source schema has no structured action/benefit/risk/group fields. Do not infer them.
    supportedBenefits: [], supportedRisks: [], affectedGroups: [],
    urgency: reactive && descriptions.some((text) => urgent.test(text)) && evidence.some((text) => urgent.test(text)) ? "high" : null,
    source: signal.source, provenance: signal.provenance, evidence: signal.evidence,
    geography: signal.geography, eventDate: signal.eventDate, status: signal.status,
  });
}

// Structural validation alone cannot establish grounding. Compare against the deterministic mapping.
export function validateDecisionCandidate(value: unknown, signal: ExternalSignal): DecisionCandidate {
  const candidate = decisionCandidateSchema.parse(value);
  if (!isDeepStrictEqual(candidate, toDecisionCandidate(signal))) throw new Error("Decision candidate does not match its validated source signal.");
  return candidate;
}
