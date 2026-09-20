import { createHash } from "node:crypto";
import type { Policy } from "../types/database";
import type { GeneratedEventCandidate } from "../../lib/signals/generated-events";

export const TRANSIT_POLICY_ID = "99999999-9999-4999-8999-000000000002";
export const BINDING_VERSION = "authored-actions-v2";
import { ACTION_MAPPINGS } from "./actionMappings";

const normalize = (value: string) => value.trim().toLowerCase().replace(/[.!]$/, "").replace(/\s+/g, " ");
export const policyFingerprint = (policy: Policy) => createHash("sha256").update(JSON.stringify(policy.effects)).digest("hex");

export function bindExecutableActions(candidates: GeneratedEventCandidate[], catalog: Policy[]): GeneratedEventCandidate[] {

  return candidates.map((candidate) => {
    const mapping = ACTION_MAPPINGS.find(m => m.actionKey === candidate.actionKey);
    const policy = mapping && catalog.find(p => p.id === mapping.policyId && p.name === mapping.policyName && p.category === mapping.policyCategory && p.effects.version === 1);
    const action = candidate.proposedAction ?? "";
    const actionEvidence = candidate.claims.proposedAction?.evidence ?? [];
    const fictional = candidate.generation.promptVersion === "simulation-proposals-v1";
    const supported = action.trim().length > 0 && candidate.claims.proposedAction?.text === action && actionEvidence.length > 0 && actionEvidence.every((ref) =>
      (fictional ? candidate.claims.problem.evidence.some(e => e.sourceSignalId === ref.sourceSignalId) : ref.quote.includes(action) && !/\b(?:no|not|never|reject\w*|cancel\w*|oppose\w*|avoid\w*)\b/i.test(ref.quote)));
    const executable = !!policy && !!mapping && mapping.categories.includes(candidate.category) && (fictional || mapping.aliases.some(alias => normalize(alias) === normalize(action))) && supported;
    return { ...candidate, executable, policyId: executable ? policy!.id : null,
      bindingVersion: executable ? BINDING_VERSION : null,
      scale: executable ? mapping!.scale : null, resourceTier: executable ? mapping!.resourceTier : null, estimatedDurationDays: executable ? mapping!.estimatedDurationDays : null };
  });
}
