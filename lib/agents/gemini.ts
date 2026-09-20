import { z } from "zod";

export interface GeminiRequest<T> { system: string; input: unknown; schema: z.ZodType<T>; model?: string }
export type GeminiClient = <T>(request: GeminiRequest<T>) => Promise<T>;

// Gemini accepts the structural subset; Zod still enforces every constraint locally.
export function geminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (!value || typeof value !== 'object') return value;
  const unsupported = new Set(['$schema','minLength','maxLength','minimum','maximum','minItems','maxItems','additionalProperties']);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !unsupported.has(key)).map(([key, item]) => [key, geminiSchema(item)]));
}

/** Server-only Interactions transport; local validation remains authoritative. */
export const geminiJson: GeminiClient = async ({ system, input, schema, model = process.env.GEMINI_MODEL }) => {
  if (typeof window !== "undefined") throw new Error("Gemini is server-only.");
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || !model?.trim()) throw new Error("Configure GEMINI_API_KEY and GEMINI_MODEL.");
  let response: Response;
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ model: model.trim(), system_instruction: `${system}\nReturn only JSON matching this schema: ${JSON.stringify(z.toJSONSchema(schema))}`, input: JSON.stringify(input), store: false,
        response_format: { type: 'text', mime_type: 'application/json', schema: geminiSchema(z.toJSONSchema(schema)) } }),
    });
  } catch { throw new Error('Gemini request failed or timed out.'); }
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}.`);
  const body = z.object({ status: z.literal('completed'), steps: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })) }).parse(await response.json());
  const text = body.steps.filter(step => step.type === 'model_output').flatMap(step => step.content ?? []).filter(part => part.type === 'text').map(part => part.text ?? '').join('');
  try { return schema.parse(JSON.parse(text)); }
  catch (error) { throw new Error('Gemini returned invalid structured JSON.' + (error instanceof z.ZodError ? ' ' + error.issues.map(issue => `${issue.path.join('.')}: ${issue.code}`).join('; ') : ' JSON parse failed.')); }
};
