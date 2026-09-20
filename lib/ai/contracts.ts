import { z } from 'zod';
import { RESIDENT_ARCHETYPES, HOUSING_STATUSES } from '../../database/types/database';

export const insightRequestSchema = z.object({
  mode: z.enum(['briefing', 'decision', 'outcome', 'event', 'resident', 'debate', 'compare']),
  policyIds: z.array(z.string().uuid()).max(2).default([]),
  residentId: z.string().max(100).optional(),
  event: z.string().max(600).optional(),
  question: z.string().max(400).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'compare' && (value.policyIds.length !== 2 || new Set(value.policyIds).size !== 2)) ctx.addIssue({ code: 'custom', message: 'Choose two different policies.' });
});
export type InsightRequest = z.infer<typeof insightRequestSchema>;
const sentence = z.string().trim().min(1).max(700);
export const commentarySchema = z.object({
  summary: sentence,
  mayorSpeech: z.string().trim().min(1).max(900),
  residents: z.array(z.object({ residentId: z.string(), stance: z.enum(['support', 'concerned', 'mixed']), thought: sentence, priority: z.string().max(160) }).strict()).min(1).max(4),
  conversation: z.array(z.object({ residentId: z.string(), text: sentence }).strict()).max(6),
  comparison: z.string().max(800),
}).strict();
export type Commentary = z.infer<typeof commentarySchema>;
export interface Metrics { treasury: number; happiness: number; approval: number; averageRent: number; revenue: number; expenses: number }
export interface VoicePersona { id: string; name: string; occupation: string; neighborhood: string; income: number; housing: string; priorities: string[]; neighborhoodHappiness: number | null }
export interface InsightFacts {
  assessment?: import('../../database/simulation/performanceAssessment').PerformanceAssessment;
  cityName: string; turn: number; mode: InsightRequest['mode'];
  current: Metrics; previous: Metrics | null;
  policies: { id: string; name: string; description: string; status: 'proposed' | 'queued' | 'applied' }[];
  scenarios: { policyId: string; name: string; metrics: Metrics; neighborhoods: { name: string; before: number; after: number }[] }[];
  neighborhoods: { name: string; happiness: number; previous: number | null }[];
  residents: VoicePersona[];
  event?: string; question?: string;
}
export interface CityInsight {
  id: string; source: 'nemotron' | 'scripted'; model: string | null; notice?: string; facts: InsightFacts; commentary: Commentary;
  /** Who actually wrote `commentary.mayorSpeech`. Gemini transcribes Nemotron's (or the scripted) records into the spoken address; if Gemini is unavailable the records' own mayorSpeech is spoken as-is. */
  speechSource: 'gemini' | 'scripted';
  speechNotice?: string;
}

/* -------------------------------------------------------------------------- */
/* Event pipeline: Gemini supervisor selection + Nemotron effect decision      */
/* -------------------------------------------------------------------------- */

/** Gemini supervisor's response: which scraped signals to turn into events. */
export const eventSelectionSchema = z.object({
  selections: z.array(z.object({
    signalId: z.string().min(1),
    rationale: z.string().trim().min(1).max(300),
  }).strict()).min(1).max(5),
}).strict();
export type EventSelection = z.infer<typeof eventSelectionSchema>;

export function parseEventSelection(raw: string, candidateIds: Set<string>): EventSelection {
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '').trim();
  const result = eventSelectionSchema.parse(JSON.parse(clean));
  if (result.selections.some(s => !candidateIds.has(s.signalId))) throw new Error('Unknown signalId in supervisor response');
  if (new Set(result.selections.map(s => s.signalId)).size !== result.selections.length) throw new Error('Repeated signalId in supervisor response');
  return result;
}

// Mirrors the *EffectTarget unions in database/types/database.ts. Kept in
// sync by hand, same convention as the runtime whitelist in
// database/simulation/applyPolicyEffects.ts (which enforces this again at
// apply time regardless of what this schema lets through).
const effectOpSchema = z.union([
  z.object({ op: z.literal('set'), value: z.number().finite() }).strict(),
  z.object({ op: z.literal('multiply'), value: z.number().finite() }).strict(),
  z.object({ op: z.literal('add'), value: z.number().finite() }).strict(),
]);
const cityTargets = ['revenue', 'expenses', 'debt', 'treasury', 'happiness', 'approval', 'unemployment'] as const;
const neighborhoodTargets = ['property_value', 'housing_supply', 'jobs', 'transit_access', 'happiness'] as const;
const residentTargets = ['income', 'housing_cost', 'commute_minutes', 'government_trust', 'happiness'] as const;
const neighborhoodSelectorSchema = z.object({
  names: z.array(z.string()).optional(),
  transit_access_lt: z.number().optional(),
  transit_access_gte: z.number().optional(),
  average_income_lt: z.number().optional(),
  average_income_gte: z.number().optional(),
}).strict();
const residentSelectorSchema = z.object({
  archetypes: z.array(z.enum(RESIDENT_ARCHETYPES)).optional(),
  housing_statuses: z.array(z.enum(HOUSING_STATUSES)).optional(),
  neighborhood_names: z.array(z.string()).optional(),
  income_lt: z.number().optional(),
  income_gte: z.number().optional(),
  age_lt: z.number().optional(),
  age_gte: z.number().optional(),
}).strict();

/** The same `policies.effects` JSON contract, validated for Nemotron's event-effect output. */
export const eventEffectsSchema = z.object({
  version: z.literal(1),
  ramp_turns: z.number().optional(),
  city: z.partialRecord(z.enum(cityTargets), effectOpSchema).optional(),
  neighborhoods: z.array(z.object({
    where: neighborhoodSelectorSchema.optional(),
    set: z.partialRecord(z.enum(neighborhoodTargets), effectOpSchema),
  }).strict()).max(6).optional(),
  residents: z.array(z.object({
    where: residentSelectorSchema.optional(),
    set: z.partialRecord(z.enum(residentTargets), effectOpSchema),
  }).strict()).max(6).optional(),
}).strict();
export type EventEffects = z.infer<typeof eventEffectsSchema>;

export function parseEventEffects(raw: string): EventEffects {
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '').trim();
  return eventEffectsSchema.parse(JSON.parse(clean));
}

export function parseCommentary(raw: string, facts: InsightFacts): Commentary {
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '').trim();
  const result = commentarySchema.parse(JSON.parse(clean));
  const ids = new Set(facts.residents.map(r => r.id));
  if (result.residents.some(r => !ids.has(r.residentId)) || result.conversation.some(r => !ids.has(r.residentId))) throw new Error('Unknown resident in model response');
  if (new Set(result.residents.map(r => r.residentId)).size !== result.residents.length) throw new Error('Repeated resident');
  return result;
}
