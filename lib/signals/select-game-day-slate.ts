import { z } from "zod";
import { decisionCandidateSchema, type DecisionCandidate } from "./decisions";
import { normalizeUrl } from "./adapters/rss";

export const SELECTION_VERSION = "game-day-selection-v1";
export const SCALE_METADATA = {
  major: { resourceTier: 5, estimatedDurationDays: 5 },
  large: { resourceTier: 4, estimatedDurationDays: 4 },
  medium: { resourceTier: 3, estimatedDurationDays: 3 },
  small: { resourceTier: 2, estimatedDurationDays: 1 },
  minor: { resourceTier: 1, estimatedDurationDays: 1 },
} as const;

export const gameDecisionOptionSchema = z.object({
  candidate: decisionCandidateSchema,
  scale: z.enum(["major", "large", "medium", "small", "minor"]),
  resourceTier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  estimatedDurationDays: z.number().int().positive(),
}).strict().superRefine((option, context) => {
  const expected = classifyDecision(option.candidate);
  if (!expected || option.scale !== expected.scale || option.resourceTier !== expected.resourceTier || option.estimatedDurationDays !== expected.estimatedDurationDays) {
    context.addIssue({ code: "custom", message: "Option metadata must match the deterministic scale rules." });
  }
});
export const gameDayDecisionSlateSchema = z.object({
  day: z.number().int().positive(),
  decisions: z.array(gameDecisionOptionSchema).max(5),
  generatedAt: z.iso.datetime(),
  selectionVersion: z.literal(SELECTION_VERSION),
}).strict().refine((slate) => new Set(slate.decisions.map((option) => option.candidate.id)).size === slate.decisions.length, "Duplicate candidate IDs in slate");
export type GameDecisionOption = z.infer<typeof gameDecisionOptionSchema>;
export type GameDayDecisionSlate = z.infer<typeof gameDayDecisionSlateSchema>;

/** These are game-planning estimates, not claims about real budgets or completion times. */
export function classifyDecision(candidate: DecisionCandidate): { scale: keyof typeof SCALE_METADATA; resourceTier: 1 | 2 | 3 | 4 | 5; estimatedDurationDays: number } | null {
  const description = `${candidate.title}. ${candidate.problem}. ${candidate.proposedAction ?? ""}`;
  const sentences = (text: string) => text.split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/^Despite\b[^,]*,\s*/i, ""))
    .filter((sentence) => !/\b(?:no|not|never|without|avoid\w*|prevent\w*)\b/i.test(sentence));
  const descriptions = sentences(description);
  const quotes = candidate.evidence.flatMap(({ quote }) => sentences(quote));
  const supported = (pattern: RegExp) => descriptions.some((text) => pattern.test(text)) && quotes.some((quote) => pattern.test(quote));
  const local = supported(/\b(?:neighborhood|local|block)\b/i);
  const broad = !local && (candidate.geography.scope !== "city" || supported(/\b(?:citywide|city-wide|across the city|throughout the city)\b/i));
  const fiscal = candidate.category === "public_finance" && supported(/\b(?:budget|fiscal|financial)\b/i)
    && supported(/\b(?:deficit|restructur\w*|re-opening|reopening|shortfall)\b/i);
  const structural = supported(/\b(?:restructur\w*|overhaul|reconstruction|transit expansion|housing development|environmental remediation)\b/i);
  let scale: keyof typeof SCALE_METADATA;
  // Significant structural/fiscal subjects take precedence over incidental outreach wording.
  if ((fiscal && !local && supported(/\b(?:city|county|municipal|state|national|metro)\b/i)) || (broad && structural)) scale = "major";
  else if (supported(/\b(?:construction|replacement|renovation|expansion|capital project|substantial investment|major program)\b/i)) scale = "large";
  else if (supported(/\b(?:pilot|upgrade|repairs?|inspection program|training program)\b/i)) scale = "medium";
  else if (supported(/\b(?:outreach|public meeting|public notice|communication campaign|information session|awareness campaign)\b/i)) scale = "minor";
  else if (supported(/\b(?:local|neighborhood|block|targeted)\b/i) && supported(/\b(?:cleanup|clean-up|garden|workshop|initiative)\b/i)) scale = "small";
  else return null; // Unknown scale is not a reason to manufacture a medium/minor option.
  return { scale, ...SCALE_METADATA[scale] };
}

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const date = (candidate: DecisionCandidate) => Date.parse(candidate.source.publishedAt ?? candidate.eventDate ?? "") || 0;
const article = (candidate: DecisionCandidate) => normalizeUrl(candidate.source.url);
const publisher = (candidate: DecisionCandidate) => candidate.source.publisher.trim().toLowerCase() || new URL(candidate.source.url).hostname;

export function selectGameDaySlate(
  inputs: readonly DecisionCandidate[],
  options: { day: number; previousIds?: ReadonlySet<string>; generatedAt: string },
): GameDayDecisionSlate {
  const unique = new Map<string, DecisionCandidate>();
  for (const input of inputs) {
    const candidate = decisionCandidateSchema.parse(input);
    // A signal ID is immutable; duplicate identical batches are harmless, conflicts are not.
    const previous = unique.get(candidate.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(candidate)) throw new Error(`Conflicting candidate ID: ${candidate.id}`);
    unique.set(candidate.id, candidate);
  }
  const remaining: GameDecisionOption[] = [];
  for (const candidate of unique.values()) {
    if (options.previousIds?.has(candidate.id)) continue;
    const metadata = classifyDecision(candidate);
    if (metadata) remaining.push({ candidate, ...metadata });
  }
  const decisions: GameDecisionOption[] = [];
  while (remaining.length && decisions.length < 5) {
    const scales = new Set(decisions.map((option) => option.scale));
    const categories = new Set(decisions.map((option) => option.candidate.category));
    const articles = new Set(decisions.map((option) => article(option.candidate)));
    const publishers = new Set(decisions.map((option) => publisher(option.candidate)));
    remaining.sort((a, b) =>
      Number(scales.has(a.scale)) - Number(scales.has(b.scale))
      || Number(categories.has(a.candidate.category)) - Number(categories.has(b.candidate.category))
      || Number(articles.has(article(a.candidate))) - Number(articles.has(article(b.candidate)))
      || Number(publishers.has(publisher(a.candidate))) - Number(publishers.has(publisher(b.candidate)))
      || date(b.candidate) - date(a.candidate)
      || compareId(a.candidate.id, b.candidate.id));
    decisions.push(remaining.shift()!);
  }
  // Presentation order goes from largest to smallest; selection ranking above remains unchanged.
  decisions.sort((a, b) => b.resourceTier - a.resourceTier || compareId(a.candidate.id, b.candidate.id));
  return gameDayDecisionSlateSchema.parse({ day: options.day, decisions, generatedAt: options.generatedAt, selectionVersion: SELECTION_VERSION });
}
