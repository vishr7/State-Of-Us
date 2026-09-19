import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runSignalPipeline } from "../lib/signals/pipeline";

// Run from the repository root: npm run ingest:signal
async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("Missing ANTHROPIC_API_KEY. Add it to .env.local.");
  }
  const runId = randomUUID();
  const root = resolve("data/signals");
  await mkdir(resolve(root, "documents"), { recursive: true });
  await mkdir(resolve(root, "extracted"), { recursive: true });
  const result = await runSignalPipeline(async (document) => {
    const path = resolve(root, "documents", `${document.id}-${runId}.json`);
    await writeFile(path, JSON.stringify(document, null, 2) + "\n", { flag: "wx" });
    console.log(`Saved normalized document: ${path}`);
  });
  const path = resolve(root, "extracted", `${result.documentId}-${runId}.json`);
  await writeFile(path, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(`Saved ${result.signals.length} validated signal(s): ${path}`);
}

main().catch((error: unknown) => {
  console.error("Signal ingestion failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
