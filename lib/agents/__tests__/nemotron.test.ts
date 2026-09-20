import { afterEach, describe, expect, it, vi } from "vitest";
import { buildResidentOutcomePrompt, generateResidentReactions, validateResidentReaction, residentReactionSchema, type NemotronInput, type ResidentReaction } from "../nemotron";
import { nemotronJson } from "../nemotron-provider";
import type { GeneratedEventCandidate } from "../../signals/generated-events";
import type { Resident, SimulationState } from "../../../database/types/database";

const residentId = "88888888-8888-4888-8888-000000000001";
const neighborhoodId = "88888888-8888-4888-8888-000000000002";
const cityId = "77777777-7777-4777-8777-000000000001";
function fixture(): NemotronInput {
  const resident: Resident = { id: residentId, neighborhood_id: neighborhoodId, age: 34, income: 28000, occupation: "service worker", housing_status: "renter", housing_cost: 1000, commute_minutes: 60, family_size: 3, tax_sensitivity: 0.7, housing_sensitivity: 0.9, transit_sensitivity: 0.95, government_trust: 0.5, happiness: 50, archetype: "service_worker" };
  const before: SimulationState = { version: 1, turn: 0, city: { id: cityId, name: "Pittsburgh", current_turn: 0, population: 3, treasury: 10000, revenue: 10000, expenses: 9000, debt: 0, happiness: 50, approval: 50, unemployment: 5, average_rent: 1000 },
    neighborhoods: [{ id: neighborhoodId, city_id: cityId, name: "Homewood", population: 3, average_income: 28000, average_rent: 1000, property_value: 150000, housing_supply: 5, jobs: 5, transit_access: 40, happiness: 50 }], residents: [resident], applied_decisions: [] };
  const after = structuredClone(before); after.turn = 1; after.city.current_turn = 1;
  after.applied_decisions = [{ decision_id: "decision", policy_id: "policy", policy_name: "Authored program" }];
  return { residents: [structuredClone(resident)], before, after,
    policy: { id: "policy", name: "Authored program", description: "A fixture program", category: "housing", upfront_cost: 1000, recurring_cost: 0, effects: { version: 1 } },
    candidate: { id: "candidate", title: "Authored program", description: "An announced local program", problem: "Residents face costs", proposedAction: "Run the authored program", category: "housing", affectedGroups: [], supportedBenefits: [], supportedRisks: [], evidence: [], estimatedDurationDays: 4 } as unknown as GeneratedEventCandidate };
}
function reaction(overrides: Partial<ResidentReaction> = {}): ResidentReaction {
  return { residentId, supportScore: 55, sentiment: "mixed", satisfaction: "mixed", mainReason: "I am weighing the local changes against the city finances.", reaction: "I have mixed feelings about what this means for my household.", personalImpact: "neutral", neighborhoodImpact: "neutral", financialImpact: "neutral", executionAssessment: "unknown", keyFactors: [{ factor: "city.treasury", effect: "neutral", reason: "The city finances are part of the picture." }], ...overrides };
}
async function evaluate(input: NemotronInput, expected: ResidentReaction) {
  const untouched = structuredClone(input);
  const provider = vi.fn(async () => expected);
  const [result] = await generateResidentReactions(input, provider);
  expect(result).toEqual(expected); expect(input).toEqual(untouched);
  return provider.mock.calls[0] as unknown as [ReturnType<typeof buildResidentOutcomePrompt>];
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("resident outcome prompt and contrasting grounded evaluations", () => {
  it("preserves a low-income renter's meaningful benefit despite an over-budget project", async () => {
    const input = fixture(); input.after.residents[0].housing_cost = 800; input.after.city.treasury = 8800; input.execution = { actualCost: 1200 };
    const [prompt] = await evaluate(input, reaction({ supportScore: 78, sentiment: "positive", satisfaction: "happy", personalImpact: "positive", financialImpact: "positive", executionAssessment: "mixed", reaction: "My rent is lower, which really helps my family, even though the project was over budget.", keyFactors: [{ factor: "resident.housing_cost", effect: "positive", reason: "Lower rent helps my household." }, { factor: "execution.budgetStatus", effect: "negative", reason: "The project was over budget." }] }));
    expect(prompt.execution.budgetStatus).toBe("over_budget");
    expect(prompt.outcome.resident.housing_cost).toEqual({ before: 1000, after: 800, delta: -200 });
    expect(prompt.resident.income).toBe(28000);
  });
  it("gives a wealthy homeowner property gains and worsening city finances without inventing personal wealth", async () => {
    const input = fixture(); input.before.residents[0].income = input.after.residents[0].income = 180000; input.before.residents[0].housing_status = input.after.residents[0].housing_status = "owner";
    input.after.neighborhoods[0].property_value = 200000; input.after.city.treasury = 7000;
    const [prompt] = await evaluate(input, reaction({ personalImpact: "positive", neighborhoodImpact: "positive", financialImpact: "negative", reaction: "Property values nearby are improving, but I worry about the city's shrinking treasury.", keyFactors: [{ factor: "neighborhood.property_value", effect: "positive", reason: "As a homeowner, I value stronger local property values." }, { factor: "city.treasury", effect: "negative", reason: "The city's treasury fell." }] }));
    expect(prompt.outcome.neighborhood.property_value.delta).toBe(50000);
    expect(prompt.execution.budgetStatus).toBe("unknown");
  });
  it("supplies substantial commute/transit improvement for a worker without guessing commute mode", async () => {
    const input = fixture(); input.after.residents[0].commute_minutes = 25; input.after.neighborhoods[0].transit_access = 70;
    const [prompt] = await evaluate(input, reaction({ supportScore: 90, sentiment: "very_positive", satisfaction: "happy", personalImpact: "positive", neighborhoodImpact: "positive", reaction: "My shorter commute makes getting to work much easier.", keyFactors: [{ factor: "resident.commute_minutes", effect: "positive", reason: "I spend less time commuting." }] }));
    expect(prompt.outcome.resident.commute_minutes.delta).toBe(-35);
    expect(prompt.resident.transit_sensitivity).toBe(0.95); expect(prompt.resident.commuteMode).toBeNull();
  });
  it("allows low support when a costly city-wide project gives little direct benefit", async () => {
    const input = fixture(); input.after.city.treasury = 7000; input.execution = { actualCost: 3000 };
    await evaluate(input, reaction({ supportScore: 30, sentiment: "negative", satisfaction: "unhappy", financialImpact: "negative", executionAssessment: "poor", reaction: "I haven't seen a change for my household, and the city's spending worries me.", keyFactors: [{ factor: "city.treasury", effect: "negative", reason: "The treasury fell without a direct change for my household." }] }));
  });
  it("does not equate under budget with success when authored goals underperform", async () => {
    const input = fixture(); input.after.residents[0].housing_cost = 950; input.execution = { actualCost: 800, goals: [{ scope: "resident", metric: "housing_cost", targetDelta: -100 }] };
    const [prompt] = await evaluate(input, reaction({ supportScore: 40, sentiment: "mixed", personalImpact: "positive", executionAssessment: "poor", reaction: "The project was under budget, but it underperformed its rent goal and left me disappointed.", keyFactors: [{ factor: "execution.goalStatus", effect: "negative", reason: "The rent goal underperformed." }] }));
    expect(prompt.execution).toMatchObject({ budgetStatus: "under_budget", goalStatus: "underperformed" });
  });
  it("allows strong support for over-budget delivery that exceeds goals and benefits the resident", async () => {
    const input = fixture(); input.after.residents[0].housing_cost = 800; input.execution = { actualCost: 1200, goals: [{ scope: "resident", metric: "housing_cost", targetDelta: -100 }] };
    const [prompt] = await evaluate(input, reaction({ supportScore: 85, sentiment: "very_positive", satisfaction: "happy", personalImpact: "positive", financialImpact: "positive", executionAssessment: "good", reaction: "The rent relief exceeded the goal and really helps us, even though the project was over budget.", keyFactors: [{ factor: "resident.housing_cost", effect: "positive", reason: "My rent is lower." }, { factor: "execution.budgetStatus", effect: "negative", reason: "The project was over budget." }] }));
    expect(prompt.execution).toMatchObject({ budgetStatus: "over_budget", goalStatus: "exceeded_expectations" });
  });
  it("requires mixed sentiment for personal benefit alongside neighborhood harm", async () => {
    const input = fixture(); input.after.residents[0].housing_cost = 800; input.after.neighborhoods[0].happiness = 40;
    const expected = reaction({ personalImpact: "positive", neighborhoodImpact: "negative", reaction: "My rent is lower, but it's hard to celebrate when my neighborhood is doing worse.", keyFactors: [{ factor: "resident.housing_cost", effect: "positive", reason: "My rent fell." }, { factor: "neighborhood.happiness", effect: "negative", reason: "My neighbors are doing worse." }] });
    await evaluate(input, expected);
    expect(() => validateResidentReaction({ ...expected, sentiment: "positive" }, buildResidentOutcomePrompt(input, residentId))).toThrow("mixed sentiment");
  });
  it("rejects invented budget/goal claims when their status is unknown", () => {
    const prompt = buildResidentOutcomePrompt(fixture(), residentId);
    for (const prose of ["It was over budget.", "It was under-budget.", "It came in within budget.", "The project failed to meet its goals."]) {
      expect(() => validateResidentReaction(reaction({ reaction: prose }), prompt)).toThrow();
    }
    expect(() => validateResidentReaction(reaction({ executionAssessment: "good" }), prompt)).toThrow("unknown");
    expect(validateResidentReaction(reaction(), prompt)).toBeDefined();
  });
  it("attributes only an isolated authored treasury debit and never treats turn count as project duration", () => {
    const input = fixture(); input.policy.effects.city = { treasury: { op: "add", value: -1000 } }; input.after.city.treasury = 9000;
    expect(buildResidentOutcomePrompt(input, residentId).execution).toMatchObject({ actualCost: 1000, budgetStatus: "on_budget", actualDurationDays: null, status: "resolved", goalStatus: "unknown" });
    input.after.applied_decisions.push({ decision_id: "other", policy_id: "other", policy_name: "Other" });
    expect(buildResidentOutcomePrompt(input, residentId).execution.budgetStatus).toBe("unknown");
  });
  it("rejects unsupported numbers, identities, impact claims and extra mutation fields", () => {
    const prompt = buildResidentOutcomePrompt(fixture(), residentId);
    expect(() => validateResidentReaction(reaction({ reaction: "I gained 999999 dollars." }), prompt)).toThrow("number");
    expect(() => validateResidentReaction(reaction({ residentId: cityId }), prompt)).toThrow("resident");
    expect(() => validateResidentReaction(reaction({ personalImpact: "positive" }), prompt)).toThrow("No direct change");
    expect(() => residentReactionSchema.parse({ ...reaction(), treasury: 500 })).toThrow();
    expect(() => residentReactionSchema.parse(reaction({ supportScore: 99, sentiment: "negative" }))).toThrow();
  });
});

describe("isolated Nemotron provider", () => {
  it("sends one resident prompt and safely parses JSON", async () => {
    vi.stubEnv("NEMOTRON_BASE_URL", "https://example.org/v1"); vi.stubEnv("NEMOTRON_API_KEY", "secret"); vi.stubEnv("NEMOTRON_MODEL", "fixture");
    const fetch = vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reaction()) } }] })); vi.stubGlobal("fetch", fetch);
    expect(await generateResidentReactions(fixture())).toEqual([reaction()]);
    const call = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(JSON.parse(body.messages[1].content).resident.id).toBe(residentId);
    expect(body.messages[0].content).toContain("ONE resident");
    expect(JSON.parse(body.messages[1].content)).not.toHaveProperty("policy.effects");
  });
  it("rejects malformed JSON, truncation, HTTP errors and provider failures without mutating input", async () => {
    vi.stubEnv("NEMOTRON_BASE_URL", "https://example.org/v1"); vi.stubEnv("NEMOTRON_API_KEY", "secret"); vi.stubEnv("NEMOTRON_MODEL", "fixture");
    const input = fixture(); const before = structuredClone(input);
    for (const response of [Response.json({ choices: [{ finish_reason: "stop", message: { content: "```json invalid" } }] }), Response.json({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }), new Response("secret", { status: 503 })]) {
      vi.stubGlobal("fetch", vi.fn(async () => response));
      await expect(generateResidentReactions(input)).rejects.toThrow();
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("secret"); }));
    await expect(nemotronJson(buildResidentOutcomePrompt(input, residentId))).rejects.toThrow("failed or timed out");
    expect(input).toEqual(before);
  });
});
