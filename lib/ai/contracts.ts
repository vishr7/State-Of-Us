import { z } from 'zod';

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
  cityName: string; turn: number; mode: InsightRequest['mode'];
  current: Metrics; previous: Metrics | null;
  policies: { id: string; name: string; description: string; status: 'proposed' | 'queued' | 'applied' }[];
  scenarios: { policyId: string; name: string; metrics: Metrics; neighborhoods: { name: string; before: number; after: number }[] }[];
  neighborhoods: { name: string; happiness: number; previous: number | null }[];
  residents: VoicePersona[];
  event?: string; question?: string;
}
export interface CityInsight { id: string; source: 'nemotron' | 'scripted'; model: string | null; notice?: string; facts: InsightFacts; commentary: Commentary }

export function parseCommentary(raw: string, facts: InsightFacts): Commentary {
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '').trim();
  const result = commentarySchema.parse(JSON.parse(clean));
  const ids = new Set(facts.residents.map(r => r.id));
  if (result.residents.some(r => !ids.has(r.residentId)) || result.conversation.some(r => !ids.has(r.residentId))) throw new Error('Unknown resident in model response');
  if (new Set(result.residents.map(r => r.residentId)).size !== result.residents.length) throw new Error('Repeated resident');
  return result;
}
