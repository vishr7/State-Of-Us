import { z } from "zod";

export interface GeminiRequest<T> { system: string; input: unknown; schema: z.ZodType<T>; model?: string }
export type GeminiClient = <T>(request: GeminiRequest<T>) => Promise<T>;

/** Server-only transport. Strict local parsing is required even with provider JSON schema mode. */
export const geminiJson: GeminiClient = async ({ system, input, schema, model = process.env.GEMINI_MODEL }) => {
  if (typeof window !== "undefined") throw new Error("Gemini is server-only.");
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || !model?.trim()) throw new Error("Configure GEMINI_API_KEY and GEMINI_MODEL.");
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal: AbortSignal.timeout(90_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(schema), temperature: 0, maxOutputTokens: 12000 } }),
    });
  } catch { throw new Error("Gemini request failed or timed out."); }
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}.`);
  const body = z.object({ candidates: z.array(z.object({ finishReason: z.literal("STOP"), content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }) })).length(1) }).parse(await response.json());
  const text = body.candidates[0].content.parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
  try { return schema.parse(JSON.parse(text)); }
  catch { throw new Error("Gemini returned invalid structured JSON."); }
};
