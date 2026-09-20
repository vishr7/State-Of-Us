import type { GeneratedEventCandidate } from './generated-events';
export interface PolicyInspiration { title: string; url: string; publisher: string; publishedAt: string | null; curated: boolean }
const context: Record<string, Omit<PolicyInspiration, 'curated' | 'publishedAt'>> = {
  housing: { title: 'Pittsburgh Housing Needs Assessment', url: 'https://www.pittsburghpa.gov/Business-Development/City-Planning/Planning-banner/Housing-Needs', publisher: 'City of Pittsburgh' },
  transit: { title: 'Transit surveys and reports', url: 'https://www.rideprt.org/inside-Pittsburgh-Regional-Transit/Transparency/surveys-and-reports/', publisher: 'Pittsburgh Regional Transit' },
  environment: { title: 'Pittsburgh Climate Action Plan', url: 'https://www.pittsburghpa.gov/Business-Development/City-Planning/Sustainability/Climate-Action-Plan', publisher: 'City of Pittsburgh' },
  budget: { title: 'City budget surveys and public engagement', url: 'https://engage.pittsburghpa.gov/city-pittsburgh-budget-engagements/past-city-budget-engagements', publisher: 'Engage Pittsburgh' },
};
export function policyInspiration(candidate: GeneratedEventCandidate, category?: string): PolicyInspiration[] {
  const sources = candidate.sourceRefs.filter(s => /^https?:\/\//i.test(s.url));
  if (sources.length) return [...new Map(sources.map(s => [s.url, s])).values()].map(s => ({ ...s, publisher: s.publisher ?? 'Original source', curated: false }));
  // Scripted emergencies must not be represented as real news.
  if (candidate.policyId?.startsWith('ae00000')) return [];
  const source = context[category ?? candidate.category] ?? context.budget;
  return [{ ...source, publishedAt: null, curated: true }];
}
