import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { normalizeUrl } from "./adapters/rss";
import { signalDraftSchema } from "./types";

const recordSchema = z.object({
  documentId: z.string().min(1),
  source: z.object({ url: z.string().url() }).passthrough(),
  provenance: z.object({ contentHash: z.string().min(1), model: z.string(), promptVersion: z.string(), extractedAt: z.string() }).passthrough(),
}).passthrough();
export type ProcessedRecord = z.infer<typeof recordSchema>;

export async function readJson(path: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error; // Corruption must never silently reset deduplication.
  }
}

export async function writeJson(path: string, value: unknown) {
  const temp = `${path}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

export class ProcessedStore {
  records: Record<string, ProcessedRecord> = {};
  constructor(readonly directory: string) {}

  async load() {
    await mkdir(join(this.directory, "extracted"), { recursive: true });
    this.records = z.record(z.string(), recordSchema).parse(await readJson(join(this.directory, "processed.json")) ?? {});
    // Recover after output save / index-write interruption, and import manual outputs.
    for (const file of await readdir(join(this.directory, "extracted"))) {
      if (!file.endsWith(".json")) continue;
      const batch = await readJson(join(this.directory, "extracted", file));
      z.object({ signals: z.array(signalDraftSchema.strip()) }).parse(batch);
      const record = recordSchema.parse(batch);
      this.records[normalizeUrl(record.source.url)] = record;
      const aliases = z.object({ discoveredUrls: z.array(z.string()).optional() }).parse(batch).discoveredUrls ?? [];
      for (const url of aliases) this.records[normalizeUrl(url)] = record;
    }
  }

  has(url: string) { return !!this.records[normalizeUrl(url)]; }
  byHash(hash: string) { return Object.values(this.records).find((record) => record.provenance.contentHash === hash); }
  async mark(url: string, record: unknown) {
    this.records[normalizeUrl(url)] = recordSchema.parse(record);
    await writeJson(join(this.directory, "processed.json"), this.records);
  }
}
