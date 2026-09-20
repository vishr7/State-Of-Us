import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Policy } from '../types/database';
import { generatedEventSchema, type GeneratedEventCandidate } from '../../lib/signals/generated-events';

export function catalogChoice(policy: Policy): GeneratedEventCandidate {
  const id = `catalog:${policy.id}:${createHash('sha256').update(JSON.stringify(policy)).digest('hex').slice(0,16)}`;
  const quote = policy.description || policy.name;
  const ref = { sourceSignalId: id, evidenceIndex: 0, quote };
  const claim = { text: quote, evidence: [ref] };
  const category = ['housing','transit','environment','business'].includes(policy.category) ? policy.category : 'policy';
  return generatedEventSchema.parse({
    id, sourceSignalIds: [id], actionKey: `catalog:${policy.id}`, category,
    title: policy.name, description: quote, problem: 'Choose how to invest in your city.', proposedAction: policy.name,
    supportedBenefits: [], supportedRisks: [], affectedGroups: [],
    claims: { sourceSignalIds: [id], actionKey: `catalog:${policy.id}`, category, title: claim, description: claim, problem: claim, proposedAction: claim, supportedBenefits: [], supportedRisks: [], affectedGroups: [] },
    sourceRefs: [{ title: 'Authored game policy catalog', url: `catalog://policies/${policy.id}`, publisher: 'State of US', publishedAt: null }],
    provenance: [], evidence: [ref], generation: { model: 'authored-catalog', promptVersion: 'catalog-v1' },
    executable: true, policyId: policy.id, bindingVersion: 'catalog-v1', scale: 'medium', resourceTier: 3, estimatedDurationDays: 1,
  });
}
export function validCatalogChoice(candidate: GeneratedEventCandidate, policy: Policy) {
  return policy.effects.version === 1 && isDeepStrictEqual(candidate, catalogChoice(policy));
}
/** Fill with distinct executable policies; rotate categories deterministically. */
export function fillDailyChoices(news: GeneratedEventCandidate[], policies: Policy[], turn: number) {
  const result = news.filter(c => c.executable).filter((c,i,a) => a.findIndex(x => x.policyId === c.policyId) === i).slice(0,5);
  const groups = new Map<string, Policy[]>();
  for (const p of policies.filter(p => p.effects.version === 1).sort((a,b) => a.id.localeCompare(b.id))) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  const ordered: Policy[] = [];
  for (let round=0; [...groups.values()].some(g => g.length > round); round++) for (const g of groups.values()) { const p=g[(round+turn)%g.length]; if(round<g.length) ordered.push(p); }
  for (const p of ordered) { if(result.length===5) break; if(!result.some(c=>c.policyId===p.id)) result.push(catalogChoice(p)); }
  return result;
}
