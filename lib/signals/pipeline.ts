import { createHash } from "node:crypto";
import { ingestHtml } from "./adapters/html";
import { extractSignals, EXTRACTION_MODEL, PROMPT_VERSION, validateExtraction } from "./extract";
import type { ExternalSignal, NormalizedDocument, SignalDraft } from "./types";

export async function runSignalPipeline(
  onDocument: (document: NormalizedDocument) => Promise<void> = async () => {},
  dependencies: {
    ingest: () => Promise<NormalizedDocument>;
    extract: (document: NormalizedDocument) => Promise<SignalDraft[]>;
  } = { ingest: ingestHtml, extract: extractSignals },
) {
  const document = await dependencies.ingest();
  // Save the source even if model extraction subsequently fails.
  await onDocument(document);
  const drafts = validateExtraction({ signals: await dependencies.extract(document) }, document);
  const extractedAt = new Date().toISOString();
  const provenance = { ...document.provenance, extractedAt, model: EXTRACTION_MODEL, promptVersion: PROMPT_VERSION };
  const signals: ExternalSignal[] = drafts.map((draft) => ({
    ...draft,
    id: createHash("sha256").update(JSON.stringify([document.id, EXTRACTION_MODEL, PROMPT_VERSION, draft])).digest("hex"),
    documentId: document.id,
    source: { ...document.source },
    provenance: { ...provenance },
  }));
  // Batch metadata preserves traceability even when signals is empty.
  return { documentId: document.id, source: document.source, provenance, signals };
}
