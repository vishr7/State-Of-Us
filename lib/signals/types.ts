import { z } from "zod";

export interface SourceReference {
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
}

export interface NormalizedDocument {
  id: string;
  source: SourceReference;
  sourceType: "html";
  text: string;
  provenance: {
    retrievedAt: string;
    adapterVersion: string;
    contentHash: string;
  };
}

export const signalDraftSchema = z.object({
  category: z.enum(["employment", "housing", "infrastructure", "public_finance", "policy"]),
  headline: z.string().min(1),
  summary: z.string().min(1),
  geography: z.object({
    name: z.string().min(1),
    scope: z.enum(["city", "county", "metro", "state", "national"]),
  }).strict(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  status: z.enum(["proposed", "announced", "in_progress", "completed"]),
  evidence: z.array(z.object({ quote: z.string().min(1) }).strict()).min(1),
}).strict();

export const extractionSchema = z.object({ signals: z.array(signalDraftSchema) }).strict();
export type SignalDraft = z.infer<typeof signalDraftSchema>;

export interface ExternalSignal extends SignalDraft {
  id: string;
  documentId: string;
  source: SourceReference;
  provenance: NormalizedDocument["provenance"] & {
    extractedAt: string;
    model: string;
    promptVersion: string;
  };
}
