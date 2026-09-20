import { buildDecisions } from "../lib/signals/build-decisions";

buildDecisions().then(({ batches, candidates }) => {
  console.log(`Built ${candidates} decision candidates from ${batches} extracted batches in data/signals/decisions/. No model calls made.`);
}).catch((error: unknown) => {
  console.error("Decision build failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
