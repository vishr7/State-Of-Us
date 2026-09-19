import { runSignalPipeline } from "../lib/signals/pipeline";
import { getPool, closePool } from "../database/lib/db";
import { persistExternalSignals } from "../database/simulation/persistExternalSignals";

// Run from the repository root: npm run ingest:signal
async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("Missing ANTHROPIC_API_KEY. Add it to .env.local.");
  }
  const result = await runSignalPipeline();
  const pool = getPool();
  const { inserted, skipped } = await persistExternalSignals(pool, result.signals);
  console.log(
    `Document ${result.documentId}: ${inserted} signal(s) inserted, ${skipped} already present.`
  );
}

main()
  .catch((error: unknown) => {
    console.error("Signal ingestion failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(closePool);
