import { z } from "zod";
import { externalSignalSchema } from "./decisions";

export const evidenceReferenceSchema = z.object({ sourceSignalId: z.string().min(1), evidenceIndex: z.number().int().nonnegative(), quote: z.string().min(1) }).strict();
export const groundedClaimSchema = z.object({ text: z.string().min(1), evidence: z.array(evidenceReferenceSchema).min(1) }).strict();
export const eventDraftSchema = z.object({
  sourceSignalIds: z.array(z.string().min(1)).min(1),
  actionKey: z.string().min(1),
  category: z.enum(["public_finance", "housing", "transit", "infrastructure", "employment", "environment", "public_safety", "development", "business", "community", "policy"]),
  title: groundedClaimSchema, description: groundedClaimSchema, problem: groundedClaimSchema,
  proposedAction: groundedClaimSchema.nullable(),
  supportedBenefits: z.array(groundedClaimSchema), supportedRisks: z.array(groundedClaimSchema), affectedGroups: z.array(groundedClaimSchema),
}).strict();
export const eventDraftBatchSchema = z.object({ candidates: z.array(eventDraftSchema).max(10) }).strict();
export const generatedEventSchema = z.object({
  id: z.string().min(1), sourceSignalIds: z.array(z.string()).min(1), actionKey: z.string(), category: eventDraftSchema.shape.category,
  title: z.string(), description: z.string(), problem: z.string(), proposedAction: z.string().optional(),
  supportedBenefits: z.array(z.string()), supportedRisks: z.array(z.string()), affectedGroups: z.array(z.string()),
  claims: eventDraftSchema,
  sourceRefs: z.array(externalSignalSchema.shape.source),
  provenance: z.array(z.object({ signalId: z.string(), documentId: z.string(), source: externalSignalSchema.shape.source, extraction: externalSignalSchema.shape.provenance }).strict()),
  evidence: z.array(evidenceReferenceSchema),
  generation: z.object({ model: z.string(), promptVersion: z.string() }).strict(),
  executable: z.boolean(), policyId: z.string().uuid().nullable(), bindingVersion: z.string().nullable(),
  scale: z.enum(["major", "large", "medium", "small", "minor"]).nullable(),
  resourceTier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
  estimatedDurationDays: z.number().int().positive().nullable(),
}).strict();
export type GeneratedEventCandidate = z.infer<typeof generatedEventSchema>;
export const generatedSlateSchema = z.object({
  cityId: z.string().uuid(), turn: z.number().int().nonnegative(),
  candidatePoolIds: z.array(z.string()), selectedDecisionIds: z.array(z.string()).max(5),
  decisions: z.array(generatedEventSchema).max(5), generatedAt: z.string(), selectionVersion: z.string(),
}).strict();
export type GeneratedGameDaySlate = z.infer<typeof generatedSlateSchema>;
