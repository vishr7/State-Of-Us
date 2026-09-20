import { parseArgs } from "node:util";
import { buildDailyWorld } from "../lib/signals/build-daily-world";

async function main() {
  const { values } = parseArgs({ options: { day: { type: "string" }, limit: { type: "string", default: "5" } } });
  for (const value of [values.day, values.limit]) {
    if (value !== undefined && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)) throw new Error("--day and --limit must be positive integers.");
  }
  await buildDailyWorld({ day: values.day === undefined ? undefined : Number(values.day), limit: Number(values.limit) });
}
main().catch((error: unknown) => {
  console.error("Daily-world build failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
