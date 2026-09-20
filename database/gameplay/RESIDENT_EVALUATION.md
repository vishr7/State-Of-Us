# Resident outcome evaluation

`resolveGameDay` commits the deterministic turn before evaluating residents. It reuses the saved before/after snapshots, chosen grounded candidate and authored policy. The provider receives one resident per request. The existing sample is at most five changed households, ordered by ID; it is not a statistically representative sample.

## Input contract

`NemotronInput` reuses `GeneratedEventCandidate`, `Policy`, `Resident[]` and two `SimulationState` snapshots. Optional trusted `ExecutionMeasurements` supplies actualCost, actualDurationDays, status (`resolved | in_progress | completed | unknown`), and goals (`{scope: resident | neighborhood | city, metric: string, targetDelta: number}[]`). These measurements must come from application records, never the player or model.

`buildResidentOutcomePrompt(input, residentId)` produces the exact provider payload:

```ts
{
  resident: Resident & {
    neighborhood: { id: string; name: string };
    transitDependence: null;
    commuteMode: null;
  };
  event: {
    id: string; title: string; description: string; problem: string;
    selectedAction: string | null; category: string;
    affectedGroups: string[]; supportedBenefits: string[]; supportedRisks: string[];
    evidence: GeneratedEventCandidate["evidence"];
    authoredPolicy: { id: string; name: string };
  };
  outcome: {
    resident: Record<ResidentMetric, ValueChange>;
    neighborhood: Record<NeighborhoodMetric, ValueChange>;
    city: Record<CityMetric, ValueChange>;
  };
  execution: {
    plannedCost: number | null; actualCost: number | null;
    costBasis: "execution_ledger" | "isolated_authored_treasury_debit" | "unknown";
    budgetStatus: "under_budget" | "on_budget" | "over_budget" | "unknown";
    goalStatus: "underperformed" | "met_expectations" | "exceeded_expectations" | "unknown";
    goals: { scope: "resident" | "neighborhood" | "city"; metric: string;
      targetDelta: number; actualDelta: number;
      assessment: "underperformed" | "met_expectations" | "exceeded_expectations" }[];
    plannedDurationDays: number | null; actualDurationDays: number | null;
    status: "resolved" | "in_progress" | "completed" | "unknown";
  };
  snapshotRefs: { cityId: string; beforeTurn: number; afterTurn: number };
  units: { income: string; housing_cost: string; commute_minutes: string;
    plannedCost: string; duration: string; scores: string };
}
```

`ValueChange` is `{before: number, after: number, delta: number}`. Metric keys:

- Resident: income, housing_cost, commute_minutes, government_trust, happiness.
- Neighborhood: population, average_income, average_rent, property_value, housing_supply, jobs, transit_access, happiness.
- City: population, treasury, revenue, expenses, debt, happiness, approval, unemployment, average_rent.

`Resident` retains the canonical ID, neighborhood_id, age, income, occupation, housing_status, housing_cost, commute_minutes, family_size, tax_sensitivity, housing_sensitivity, transit_sensitivity, government_trust, happiness and archetype. Transit sensitivity does not establish transit dependence or commute mode.

## Response contract

```ts
type Impact = "negative" | "neutral" | "positive";
interface ResidentReaction {
  residentId: string; // UUID matching the supplied resident
  supportScore: number; // integer 0..100
  sentiment: "very_negative" | "negative" | "mixed" | "positive" | "very_positive";
  satisfaction: "unhappy" | "mixed" | "happy";
  mainReason: string;
  reaction: string;
  personalImpact: Impact;
  neighborhoodImpact: Impact;
  financialImpact: Impact;
  executionAssessment: "poor" | "mixed" | "good" | "unknown";
  keyFactors: { factor: string; effect: Impact; reason: string }[];
}
```

Zod rejects extra fields, blank explanations, explanations over 1,200 characters and factor arrays outside 1–6 entries. Factors reference supplied metric paths or execution.budgetStatus/execution.goalStatus. Context validation checks resident identity, unknown execution claims, unsupported numeric tokens and conflicting personal/neighborhood sentiment. Score/label consistency bounds are validation constraints, not a scoring formula. Natural-language entailment cannot be fully guaranteed by schema and pattern checks.

## Deterministic facts and model interpretation

Application code computes deltas and compares actual/planned costs in cents. Without an explicit actual cost, it only attributes a cost when a sole applied action has an authored treasury debit matching the committed treasury change. Otherwise budget status is unknown. Signed goal targets are compared with committed deltas: any missed target means underperformed, otherwise any exceeded target means exceeded expectations, otherwise met expectations. No targets means unknown.

Nemotron chooses the holistic support score, sentiment, satisfaction, impact assessments and first-person explanation. These values never feed back into simulation state. A resolved turn does not establish project completion or actual duration. Current gameplay supplies no execution ledger or authored targets, so these remain unknown unless a cost can be narrowly attributed. Future ledger integration can supply the optional measurements.

## Persistence, configuration and failures

Apply `database/supabase/migrations/20260919210000_resident_outcome_evaluation.sql` after the existing game-day migration through the project's normal migration process. It adds nullable `resident_reactions.evaluation` and expands the sentiment constraint. Existing legacy rows remain intact; a later resolve request can regenerate the v2 evaluation. Do not reset an existing database to install this migration.

Set `NEMOTRON_BASE_URL` (API base including `/v1`), `NEMOTRON_API_KEY` and `NEMOTRON_MODEL` on the server. No new scheduling or frontend integration is added. The injectable transport is `lib/agents/nemotron-provider.ts`.

Persisted rows contain the full validated evaluation, snapshot turn references, computed execution metadata, model and `resident-outcome-v2` prompt version. The legacy `support` column stores supportScore / 100 for compatibility; it is not a simulation effect.

Malformed JSON, truncated output, invalid evaluations and provider/network failures fail the reaction batch without reverting or reapplying the committed turn. Reactions are written atomically; no partial batch is accepted. Missing configuration has an explicit unconfigured status. Retrying the same resolve request retries failed reactions only; completed reactions are reused. A process crash while a reaction run is marked running still requires operational recovery; no scheduler or lease-recovery worker exists.

## Verification

```sh
npm test -- lib/agents/__tests__/nemotron.test.ts database/gameplay/__tests__/vertical-slice.test.ts
npm test
npx tsc --noEmit
```

Tests use mocked provider replies and isolated PGlite persistence. They cover contrasting resident circumstances and execution tradeoffs, strict parsing/validation, persistence and post-commit failure isolation. They do not establish live model response quality. The standard npm test command excludes the separate external-database resolveTurn integration suite.
