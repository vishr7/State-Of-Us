import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { externalSignalSchema, toDecisionCandidate, validateDecisionCandidate, DECISION_TRANSFORM_VERSION } from "./decisions";
import { readJson, writeJson } from "./processed";

export async function buildDecisions(directory = join(process.cwd(), "data/signals")) {
  const files = (await readdir(join(directory, "extracted"))).filter((file) => file.endsWith(".json")).sort();
  // Validate all input before writing any output. An invalid batch must not be silently skipped.
  const outputs = await Promise.all(files.map(async (file) => {
    const batch = z.object({ signals: z.array(externalSignalSchema) }).parse(await readJson(join(directory, "extracted", file)));
    const decisions = batch.signals.map((signal) => validateDecisionCandidate(toDecisionCandidate(signal), signal));
    return { file, value: { transformVersion: DECISION_TRANSFORM_VERSION, sourceBatch: file, decisions } };
  }));
  await mkdir(join(directory, "decisions"), { recursive: true });
  for (const { file, value } of outputs) await writeJson(join(directory, "decisions", file), value);
  return { batches: outputs.length, candidates: outputs.reduce((sum, output) => sum + output.value.decisions.length, 0) };
}
