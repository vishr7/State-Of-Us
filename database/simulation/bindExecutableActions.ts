import { createHash } from "node:crypto";
import type { Policy } from "../types/database";
import type { GeneratedEventCandidate } from "../../lib/signals/generated-events";

export const TRANSIT_POLICY_ID = "99999999-9999-4999-8999-000000000002";
export const BINDING_VERSION = "authored-actions-v1";
const aliases = new Set(["expand transit", "add a new bus line and increase train frequency"]);
const normalize = (value: string) => value.trim().toLowerCase().replace(/[.!]$/, "").replace(/\s+/g, " ");
export const policyFingerprint = (policy: Policy) => createHash("sha256").update(JSON.stringify(policy.effects)).digest("hex");

export function bindExecutableActions(candidates: GeneratedEventCandidate[], catalog: Policy[]): GeneratedEventCandidate[] {
  const policy = catalog.find((item) => item.id === TRANSIT_POLICY_ID && item.name === "Expand Transit" && item.category === "transit" && item.effects.version === 1);
  return candidates.map((candidate) => {
    const action = candidate.proposedAction ?? "";
    const actionEvidence = candidate.claims.proposedAction?.evidence ?? [];
    const supported = actionEvidence.length > 0 && actionEvidence.every((ref) =>
      ref.quote.includes(action) && !/\b(?:no|not|never|reject\w*|cancel\w*|oppose\w*|avoid\w*)\b/i.test(ref.quote));
    const executable = !!policy && candidate.actionKey === "expand_transit" && candidate.category === "transit" && aliases.has(normalize(action)) && supported;
    return { ...candidate, executable, policyId: executable ? policy!.id : null,
      bindingVersion: executable ? BINDING_VERSION : null,
      scale: executable ? "large" : null, resourceTier: executable ? 4 : null, estimatedDurationDays: executable ? 4 : null };
  });
}
