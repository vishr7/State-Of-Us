import { z } from "zod";
import { NEMOTRON_SYSTEM_PROMPT, type ResidentOutcomePrompt } from "./nemotron-prompt";

export class NemotronUnconfiguredError extends Error {}
export type NemotronProvider = (input: ResidentOutcomePrompt) => Promise<unknown>;
/** Isolated OpenAI-compatible NIM transport; no DB handle or writable canonical state. */
export const nemotronJson: NemotronProvider = async (input) => {
  if (typeof window !== "undefined") throw new Error("Nemotron is server-only.");
  const base = process.env.NEMOTRON_BASE_URL?.trim() || 'https://integrate.api.nvidia.com/v1', key = process.env.NEMOTRON_API_KEY?.trim() || process.env.NVIDIA_API_KEY?.trim(), model = process.env.NEMOTRON_MODEL?.trim() || process.env.NVIDIA_NEMOTRON_MODEL?.trim() || 'nvidia/nemotron-3.5-lightning-30b-a3b';
  if (!base || !key || !model) throw new NemotronUnconfiguredError("Nemotron is not configured.");
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, { method: "POST", signal: AbortSignal.timeout(90_000), headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 2000, response_format: { type: "json_object" }, messages: [
        { role: "system", content: NEMOTRON_SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(input) },
      ] }),
    });
  } catch { throw new Error("Nemotron request failed or timed out."); }
  if (!response.ok) throw new Error(`Nemotron returned HTTP ${response.status}.`);
  try {
    const body = z.object({ choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string() }) })).length(1) }).parse(await response.json());
    return JSON.parse(body.choices[0].message.content);
  } catch { throw new Error("Nemotron returned malformed or incomplete JSON."); }
};
