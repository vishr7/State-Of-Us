import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decisionCandidateSchema, toDecisionCandidate, validateDecisionCandidate } from "../decisions";
import { buildDecisions } from "../build-decisions";
import type { ExternalSignal } from "../types";

function signal(text = "The city reports a budget deficit."): ExternalSignal {
  return {
    id: "signal-1", documentId: "document-1", category: "public_finance", headline: text, summary: text,
    geography: { name: "Pittsburgh", scope: "city" }, eventDate: "2026-03-12", status: "announced",
    evidence: [{ quote: text }],
    source: { title: "Budget report", url: "https://example.org/budget", publisher: "City", publishedAt: "2026-03-12" },
    provenance: { retrievedAt: "2026-09-19T12:00:00Z", adapterVersion: "test-v1", contentHash: "hash", extractedAt: "2026-09-19T12:00:01Z", model: "existing-model", promptVersion: "existing-prompt" },
  };
}
const directories: string[] = [];
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "decision-test-")); directories.push(dir);
  await mkdir(join(dir, "extracted")); return dir;
}

describe("decision transformation", () => {
  it.each([
    "The city reports a budget deficit.", "Water shortages affect the city.", "The bridge is closed.",
    "Officials declared a state of emergency.", "A power outage affects the city.", "The water system reports a failure.",
    "Essential repairs are critically underfunded.", "The city ended 2025 with an $8.6 million deficit.",
  ])("classifies supported reactive situations: %s", (text) => {
    expect(toDecisionCandidate(signal(text)).type).toBe("required_event");
  });
  it.each([
    "The city proposes a new park.", "The city reports no deficit.", "An outage could affect the city.",
    "The deficit has been resolved.", "The shortage has ended.", "The city will prevent closures.",
    "The city plans for a possible emergency.", "The city reports emergency fund balances.",
    "The city seeks an investment opportunity.", "The city announces a new initiative.",
  ])("defaults ambiguous/discretionary situations to optional: %s", (text) => {
    expect(toDecisionCandidate(signal(text)).type).toBe("optional_policy");
  });
  it("does not classify from unsupported summary keywords or proposed/completed status", () => {
    expect(toDecisionCandidate({ ...signal(), evidence: [{ quote: "The city publishes a report." }] }).type).toBe("optional_policy");
    for (const status of ["proposed", "completed"] as const) expect(toDecisionCandidate({ ...signal(), status }).type).toBe("optional_policy");
  });
  it("recognizes reported actual deficits after a superseded forecast", () => {
    const input = signal();
    input.evidence = [{ quote: "Despite projections last year that the City would end 2025 with a small surplus, the preliminary end-of-year financials indicate an $8.6 million deficit for the year, which includes spending $20 million more in employee overtime than what was budgeted." }];
    expect(toDecisionCandidate(input).type).toBe("required_event");
  });
  it("copies source text, evidence and provenance without mutation or numeric effects", () => {
    const input = signal(); const before = structuredClone(input);
    const result = toDecisionCandidate(input);
    expect(result).toMatchObject({ signalId: input.id, documentId: input.documentId, title: input.headline, problem: input.summary, source: input.source, evidence: input.evidence, provenance: input.provenance, geography: input.geography, eventDate: input.eventDate, status: input.status, urgency: null, supportedBenefits: [], supportedRisks: [], affectedGroups: [] });
    expect(result).not.toHaveProperty("proposedAction");
    expect(input).toEqual(before);
    result.evidence[0].quote = "changed";
    expect(input).toEqual(before);
    expect(toDecisionCandidate(input).id).toBe(toDecisionCandidate(input).id);
    expect(toDecisionCandidate({ ...input, id: "other" }).id).not.toBe(toDecisionCandidate(input).id);
  });
  it("preserves extra provenance metadata", () => {
    const input = { ...signal(), provenance: { ...signal().provenance, additionalMetadata: "retained" } };
    expect(toDecisionCandidate(input).provenance).toEqual(input.provenance);
  });
  it("only assigns high urgency with explicit corroborated urgency language", () => {
    expect(toDecisionCandidate(signal("The outage requires immediate action.")).urgency).toBe("high");
    expect(toDecisionCandidate({ ...signal("The outage requires urgent action."), evidence: [{ quote: "An outage occurred." }] }).urgency).toBeNull();
    expect(toDecisionCandidate(signal("The outage does not require immediate action.")).urgency).toBeNull();
  });
  it("rejects malformed signals, fabricated details, changed evidence, and numeric effects", () => {
    expect(() => toDecisionCandidate({ ...signal(), evidence: [] })).toThrow();
    expect(() => toDecisionCandidate({ ...signal(), headline: " " })).toThrow();
    const input = signal(); const candidate = toDecisionCandidate(input);
    for (const addition of [{ supportedBenefits: ["More jobs"] }, { affectedGroups: ["All residents"] }, { proposedAction: "Raise taxes" }, { urgency: "high" }, { evidence: [{ quote: "Invented" }] }]) {
      expect(() => validateDecisionCandidate({ ...candidate, ...addition }, input)).toThrow();
    }
    expect(() => decisionCandidateSchema.parse({ ...candidate, treasuryChange: 100 })).toThrow();
    expect(validateDecisionCandidate(candidate, input)).toEqual(candidate);
  });
});

describe("decision batch builder", () => {
  it("builds saved batches including empty batches and reruns deterministically", async () => {
    const dir = await directory();
    await writeFile(join(dir, "extracted/a.json"), JSON.stringify({ signals: [signal()] }));
    await writeFile(join(dir, "extracted/empty.json"), JSON.stringify({ signals: [] }));
    expect(await buildDecisions(dir)).toEqual({ batches: 2, candidates: 1 });
    const first = await readFile(join(dir, "decisions/a.json"), "utf8");
    expect(JSON.parse(first).decisions[0]).toEqual(toDecisionCandidate(signal()));
    await buildDecisions(dir);
    expect(await readFile(join(dir, "decisions/a.json"), "utf8")).toBe(first);
  });
  it("rejects invalid batches before writing outputs", async () => {
    const dir = await directory();
    await writeFile(join(dir, "extracted/a.json"), JSON.stringify({ signals: [signal()] }));
    await writeFile(join(dir, "extracted/b.json"), JSON.stringify({ signals: [{ headline: "Invalid" }] }));
    await expect(buildDecisions(dir)).rejects.toThrow();
    expect(await readdir(dir)).toEqual(["extracted"]);
  });
});
