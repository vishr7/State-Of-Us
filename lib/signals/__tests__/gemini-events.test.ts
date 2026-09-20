import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { geminiJson, type GeminiClient } from "../../agents/gemini";
import { generateEventCandidates, type GenerateEventsInput } from "../generate-event-candidates";
import { selectEventsWithGemini } from "../select-events-with-gemini";
import { bindExecutableActions, TRANSIT_POLICY_ID } from "../../../database/simulation/bindExecutableActions";
import { validateReactions } from "../../agents/nemotron";
import type { ExternalSignal } from "../types";
import type { Policy, SimulationState } from "../../../database/types/database";

export const text = "Expand transit";
export const fixtureSignal: ExternalSignal = { id: "signal-transit", documentId: "doc-transit", category: "infrastructure", headline: text, summary: text, status: "proposed", geography: { name: "Pittsburgh", scope: "city" }, eventDate: "2026-09-19", evidence: [{ quote: text }], source: { title: text, url: "https://example.org/transit", publisher: "Example", publishedAt: "2026-09-19" }, provenance: { retrievedAt: "2026-09-19T12:00:00Z", extractedAt: "2026-09-19T12:00:01Z", contentHash: "hash", adapterVersion: "fixture", model: "claude-fixture", promptVersion: "fixture" } };
export const fixtureClaim = { text, evidence: [{ sourceSignalId: fixtureSignal.id, evidenceIndex: 0, quote: text }] };
export const fixtureDraft = { sourceSignalIds: [fixtureSignal.id], actionKey: "expand_transit", category: "transit", title: fixtureClaim, description: fixtureClaim, problem: fixtureClaim, proposedAction: fixtureClaim, supportedBenefits: [], supportedRisks: [], affectedGroups: [] };
const context = { id: "77777777-7777-4777-8777-000000000001" } as SimulationState["city"];
export const fixtureInput: GenerateEventsInput = { cityId: context.id, turn: 0, signals: [fixtureSignal], cityContext: context, targetCount: 10 };
const policy: Policy = { id: TRANSIT_POLICY_ID, name: "Expand Transit", description: "", category: "transit", upfront_cost: 1200000, recurring_cost: 60000, effects: { version: 1 } };
const outputClient = (output: unknown): GeminiClient => async ({ schema }) => schema.parse(output);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Gemini generation, binding and selection", () => {
  it("validates source claims, server lineage and explicit authored bindings", async () => {
    vi.stubEnv("GEMINI_MODEL", "fixture-model");
    const candidates = await generateEventCandidates(fixtureInput, outputClient({ candidates: [fixtureDraft] }));
    expect(candidates[0]).toMatchObject({ executable: false, sourceRefs: [fixtureSignal.source], provenance: [{ signalId: fixtureSignal.id, extraction: fixtureSignal.provenance }] });
    expect(bindExecutableActions(candidates, [policy])[0]).toMatchObject({ executable: true, policyId: TRANSIT_POLICY_ID, resourceTier: 4 });
    expect(bindExecutableActions([{ ...candidates[0], actionKey: "similar_expand_transit" }], [policy])[0].executable).toBe(false);
    expect(bindExecutableActions(candidates, [])[0].executable).toBe(false);
  });
  it("rejects unsupported claims, evidence, IDs, provenance and model effects", async () => {
    vi.stubEnv("GEMINI_MODEL", "fixture-model");
    const invalid = [
      { ...fixtureDraft, sourceSignalIds: ["unknown"] },
      { ...fixtureDraft, description: { ...fixtureClaim, text: "Everyone gets rich" } },
      { ...fixtureDraft, title: { ...fixtureClaim, evidence: [{ ...fixtureClaim.evidence[0], quote: "Invented" }] } },
      { ...fixtureDraft, provenance: {} }, { ...fixtureDraft, effects: { treasury: 200 } },
    ];
    for (const draft of invalid) await expect(generateEventCandidates(fixtureInput, outputClient({ candidates: [draft] }))).rejects.toThrow();
  });
  it("allows fictional proposals while preserving source-grounded problems", async () => {
    vi.stubEnv("GEMINI_MODEL", "fixture-model");
    const draft = { ...fixtureDraft, title: { ...fixtureClaim, text: "Pittsburgh Connections" }, proposedAction: { ...fixtureClaim, text: "Launch a new bus line with more frequent trains." } };
    const candidates = await generateEventCandidates(fixtureInput, outputClient({ candidates: [draft] }));
    expect(candidates[0].title).toBe("Pittsburgh Connections");
    expect(bindExecutableActions(candidates, [policy])[0].executable).toBe(true);
  });
  it("selector only accepts exact eligible IDs and retries at most once", async () => {
    vi.stubEnv("GEMINI_MODEL", "fixture-model");
    const candidates = bindExecutableActions(await generateEventCandidates(fixtureInput, outputClient({ candidates: [fixtureDraft] })), [policy]);
    const mock = vi.fn(outputClient({ selectedDecisionIds: ["invented"] }));
    const invalidClient: GeminiClient = async (request) => request.schema.parse(await mock(request));
    await expect(selectEventsWithGemini({ candidates, cityContext: context, previouslyShownIds: [] }, invalidClient)).rejects.toThrow("two attempts");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(await selectEventsWithGemini({ candidates, cityContext: context, previouslyShownIds: [] }, outputClient({ selectedDecisionIds: [candidates[0].id] }))).toEqual([candidates[0].id]);
    expect(await selectEventsWithGemini({ candidates, cityContext: context, previouslyShownIds: [candidates[0].id] }, invalidClient)).toEqual([]);
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("rejects reaction mutations and out-of-range support", () => {
    expect(() => validateReactions({ reactions: [{ residentId: "fake", support: 2, sentiment: "positive", reaction: "Hi", mainReason: "Hi", treasury: 500 }] }, [])).toThrow();
  });
});

describe("Gemini transport", () => {
  it("requests schema JSON and validates provider output", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-secret"); vi.stubEnv("GEMINI_MODEL", "fixture-model");
    const fetch = vi.fn(async () => Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"ok":true}' }] }] }));
    vi.stubGlobal("fetch", fetch);
    expect(await geminiJson({ system: "Test", input: {}, schema: z.object({ ok: z.boolean() }).strict() })).toEqual({ ok: true });
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).response_format.mime_type).toBe("application/json");
  });
  it("fails on malformed or incomplete provider responses and HTTP/network errors", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-secret"); vi.stubEnv("GEMINI_MODEL", "fixture-model");
    for (const response of [Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "invalid" }] } }] }), Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }), new Response("secret", { status: 503 })]) {
      vi.stubGlobal("fetch", vi.fn(async () => response));
      await expect(geminiJson({ system: "Test", input: {}, schema: z.object({ ok: z.boolean() }) })).rejects.toThrow();
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("test-secret"); }));
    await expect(geminiJson({ system: "Test", input: {}, schema: z.object({ ok: z.boolean() }) })).rejects.toThrow("failed or timed out");
  });
});
