import { z } from "zod";
import type { Resident } from "../../database/types/database";
import { buildResidentOutcomePrompt, type NemotronInput, type ResidentOutcomePrompt } from "./nemotron-prompt";
import { nemotronJson, type NemotronProvider } from "./nemotron-provider";
export { REACTION_PROMPT_VERSION, buildResidentOutcomePrompt, NEMOTRON_SYSTEM_PROMPT } from "./nemotron-prompt";
export type { NemotronInput, ResidentOutcomePrompt, ExecutionMeasurements } from "./nemotron-prompt";
export { NemotronUnconfiguredError } from "./nemotron-provider";

const impact = z.enum(["negative", "neutral", "positive"]);
const text = z.string().min(1).max(1200).refine((value) => value.trim().length > 0);
export const residentReactionSchema = z.object({
  emotions: z.object({ hope: z.number().int().min(0).max(100), anxiety: z.number().int().min(0).max(100), anger: z.number().int().min(0).max(100), trust: z.number().int().min(0).max(100), fairness: z.number().int().min(0).max(100) }).strict().optional(),
  socialResponse: z.object({ toResidentId: z.string().uuid(), text, influence: z.number().int().min(-10).max(10) }).strict().optional(),
  residentId: z.string().uuid(), supportScore: z.number().int().min(0).max(100),
  sentiment: z.enum(["very_negative", "negative", "mixed", "positive", "very_positive"]),
  satisfaction: z.enum(["unhappy", "mixed", "happy"]), mainReason: text, reaction: text,
  personalImpact: impact, neighborhoodImpact: impact, financialImpact: impact,
  executionAssessment: z.enum(["poor", "mixed", "good", "unknown"]),
  keyFactors: z.array(z.object({ factor: z.string().min(1), effect: impact, reason: text }).strict()).min(1).max(6),
}).strict().superRefine((reaction, context) => {
  const inconsistent = reaction.sentiment === "very_negative" && reaction.supportScore > 25
    || reaction.sentiment === "negative" && reaction.supportScore > 50
    || reaction.sentiment === "positive" && reaction.supportScore < 50
    || reaction.sentiment === "very_positive" && reaction.supportScore < 75;
  if (inconsistent) context.addIssue({ code: "custom", message: "Support score contradicts sentiment." });
  if (reaction.personalImpact !== "neutral" && reaction.neighborhoodImpact !== "neutral" && reaction.personalImpact !== reaction.neighborhoodImpact && reaction.sentiment !== "mixed") context.addIssue({ code: "custom", message: "Conflicting personal and neighborhood impacts require mixed sentiment." });
});
export type ResidentReaction = z.infer<typeof residentReactionSchema>;

export function validateResidentReaction(value: unknown, input: ResidentOutcomePrompt): ResidentReaction {
  const result = residentReactionSchema.parse(value);
  if (result.residentId !== input.resident.id) throw new Error("Reaction resident does not match the supplied resident.");
  if (result.socialResponse && !input.socialVoices.some(v => v.residentId === result.socialResponse!.toResidentId)) throw new Error('Social reply targets an unknown speaker.');
  const prose = [result.reaction, result.mainReason, result.socialResponse?.text ?? '', ...result.keyFactors.map((factor) => factor.reason)].join(" ");
  const budgetLanguage = /\b(?:over[ -]?budget|under[ -]?budget|on[ -]?budget|within (?:the )?budget|cost overruns?|exceed(?:ed|s)? (?:the )?budget|below (?:the )?budget)\b/i;
  const goalLanguage = /\b(?:underperform\w*|exceed\w* (?:its |the )?(?:goals|targets|expectations)|met (?:its |the )?(?:goals|targets|expectations)|failed to (?:meet|achieve)|project (?:succeeded|failed))\b/i;
  if (input.execution.budgetStatus === "unknown" && budgetLanguage.test(prose)) throw new Error("Reaction invents budget performance.");
  if (input.execution.goalStatus === "unknown" && goalLanguage.test(prose)) throw new Error("Reaction invents goal performance.");
  if (input.execution.budgetStatus === "unknown" && input.execution.goalStatus === "unknown" && result.executionAssessment !== "unknown") throw new Error("Execution quality is unknown.");
  const personalChange = [...Object.values(input.outcome.resident), ...Object.values(input.outcome.neighborhood)].some((change) => change.delta !== 0);
  if (!personalChange && result.personalImpact !== "neutral") throw new Error("No direct change supports a personal impact claim.");
  for (const factor of result.keyFactors) {
    const [scope, metric, extra] = factor.factor.split(".");
    if (extra || !metric) throw new Error("Invalid reaction factor reference.");
    if (scope === "execution") {
      if (metric !== "budgetStatus" && metric !== "goalStatus") throw new Error("Unknown execution factor.");
      if (input.execution[metric] === "unknown" && factor.effect !== "neutral") throw new Error("Unknown execution factor must remain neutral.");
    } else if (!["resident", "neighborhood", "city"].includes(scope) || !Object.hasOwn(input.outcome[scope as keyof typeof input.outcome], metric)) throw new Error("Reaction factor is not in the supplied outcome.");
  }
  const numbers = new Set<number>();
  function collect(value: unknown) {
    if (typeof value === "number") numbers.add(value);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  }
  collect(input);
  for (const token of prose.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []) if (!numbers.has(Number(token.replace(/,/g, "")))) throw new Error("Reaction contains a number absent from the supplied outcome.");
  return result;
}

export function validateReactions(value: unknown, residents: Resident[], input?: NemotronInput): ResidentReaction[] {
  const reactions = z.object({ reactions: z.array(residentReactionSchema) }).strict().parse(value).reactions;
  const ids = new Set(residents.map((resident) => resident.id));
  if (reactions.length !== ids.size || new Set(reactions.map((reaction) => reaction.residentId)).size !== reactions.length || reactions.some((reaction) => !ids.has(reaction.residentId))) throw new Error("Resident reactions do not match the supplied residents.");
  return input ? reactions.map((reaction) => validateResidentReaction(reaction, buildResidentOutcomePrompt(input, reaction.residentId))) : reactions;
}

/** Each call evaluates one resident; await all calls before accepting or rejecting the batch. */
export async function generateResidentReactions(input: NemotronInput, provider: NemotronProvider = nemotronJson): Promise<ResidentReaction[]> {
  // Limit concurrent provider calls; each failure leaves the other residents usable.
  const evaluate = async (context: NemotronInput) => {
    const results: ResidentReaction[] = [];
    for (let start = 0; start < context.residents.length; start += 4) {
      const batch = await Promise.allSettled(context.residents.slice(start, start + 4).map(async resident => {
        const prompt = buildResidentOutcomePrompt(context, resident.id);
        return validateResidentReaction(await provider(prompt), prompt);
      }));
      for (const result of batch) {
        if (result.status === 'fulfilled') results.push(result.value);
      }
    }
    return results;
  };
  const initial = await evaluate(input);
  if (initial.length !== input.residents.length) throw new Error('Initial emotional evaluations incomplete; retry required.');
  const socialVoices = initial.map(r => ({ residentId: r.residentId, supportScore: r.supportScore, reaction: r.reaction,
    neighborhood: input.before.neighborhoods.find(n => n.id === input.residents.find(p => p.id === r.residentId)?.neighborhood_id)?.name ?? '' }));
  const socialInput = { ...input, socialVoices };
  const responses = await evaluate(socialInput);
  return initial.map(first => {
    const reply = responses.find(r => r.residentId === first.residentId);
    if (!reply?.socialResponse) return first;
    // Preserve first-pass material assessment; peer persuasion is bounded and separate.
    return { ...first, socialResponse: reply.socialResponse, emotions: reply.emotions ?? first.emotions };
  });
}
