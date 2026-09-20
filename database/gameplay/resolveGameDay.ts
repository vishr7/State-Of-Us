import { isDeepStrictEqual } from "node:util";
import { getPool, withTransaction } from "../lib/db";
import type { Policy, SimulationState } from "../types/database";
import { resolveTurn } from "../simulation/resolveTurn";
import { policyFingerprint } from "../simulation/bindExecutableActions";
import { findChosenDecision } from "./chooseGameDayCandidate";
import { GameplayError, type GameDayOutcome, type GameDayRow } from "./contracts";
import { generateResidentReactions, validateReactions, REACTION_PROMPT_VERSION, NemotronUnconfiguredError } from "../../lib/agents/nemotron";
import { generatedEventSchema } from "../../lib/signals/generated-events";

export async function readGameDayOutcome(cityId: string, turn: number): Promise<GameDayOutcome> {
  const decision = await findChosenDecision(cityId, turn);
  if (!decision) throw new GameplayError("No chosen game-day decision.", 404);
  const day = (await getPool().query<GameDayRow>("select * from game_days where id=$1", [decision.game_day_id])).rows[0];
  const candidate = generatedEventSchema.parse(day.candidate_pool.find((item) => item.id === decision.candidate_id));
  const snapshots = (await getPool().query<{ turn: number; state: SimulationState }>("select turn,state from simulation_snapshots where city_id=$1 and turn in ($2,$3) order by turn", [cityId, turn, turn + 1])).rows;
  if (snapshots.length !== 2) throw new GameplayError("Decision has not resolved yet.");
  const run = (await getPool().query<{ status: GameDayOutcome["reactionStatus"] }>("select status from reaction_runs where decision_id=$1", [decision.id])).rows[0];
  const rows = (await getPool().query<{ resident_id: string; support: number; sentiment: "positive" | "neutral" | "negative"; reaction: string; main_reason: string }>("select * from resident_reactions where decision_id=$1 order by resident_id", [decision.id])).rows;
  return { cityId, turn, decision, candidate, before: snapshots[0].state, after: snapshots[1].state, reactionStatus: run?.status ?? "pending", reactions: rows.map((row) => ({ residentId: row.resident_id, support: row.support, sentiment: row.sentiment, reaction: row.reaction, mainReason: row.main_reason })) };
}

export async function resolveGameDay(cityId: string, turn: number, react: typeof generateResidentReactions = generateResidentReactions): Promise<GameDayOutcome> {
  const decision = await findChosenDecision(cityId, turn);
  if (!decision) throw new GameplayError("Choose a game-day candidate first.", 400);
  // The engine owns the transaction and expected-turn replay; no provider runs inside it.
  await resolveTurn(cityId, turn);
  const outcome = await readGameDayOutcome(cityId, turn);
  await getPool().query("insert into reaction_runs(decision_id,status,prompt_version) values($1,'pending',$2) on conflict do nothing", [decision.id, REACTION_PROMPT_VERSION]);
  const claimed = await getPool().query("update reaction_runs set status='running',model=$2,started_at=now(),error=null where decision_id=$1 and status in ('pending','failed','unconfigured') returning decision_id", [decision.id, process.env.NEMOTRON_MODEL ?? null]);
  if (!claimed.rows.length) return readGameDayOutcome(cityId, turn);
  try {
    const policy = (await getPool().query<Policy>("select * from policies where id=$1", [decision.policy_id])).rows[0];
    const day = (await getPool().query<GameDayRow>("select * from game_days where id=$1", [decision.game_day_id])).rows[0];
    if (day.policy_hashes[policy.id] !== policyFingerprint(policy)) throw new Error("Policy changed after resolution.");
    // Bounded representative sample of canonical affected households, not synthetic personas.
    const residents = outcome.before.residents.filter((resident) => !isDeepStrictEqual(resident, outcome.after.residents.find((after) => after.id === resident.id))).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 5);
    const reactions = validateReactions({ reactions: await react({ candidate: outcome.candidate, policy, residents, before: outcome.before, after: outcome.after }) }, residents);
    await withTransaction(async (db) => {
      for (const reaction of reactions) await db.query("insert into resident_reactions(city_id,turn,decision_id,game_day_id,candidate_id,resident_id,support,sentiment,reaction,main_reason,provenance) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) on conflict(decision_id,resident_id) do nothing", [cityId, turn, decision.id, decision.game_day_id, decision.candidate_id, reaction.residentId, reaction.support, reaction.sentiment, reaction.reaction, reaction.mainReason, JSON.stringify({ model: process.env.NEMOTRON_MODEL ?? null, promptVersion: REACTION_PROMPT_VERSION, beforeTurn: turn, afterTurn: turn + 1 })]);
      await db.query("update reaction_runs set status='completed',completed_at=now() where decision_id=$1", [decision.id]);
    });
  } catch (error) {
    await getPool().query("update reaction_runs set status=$2,error=$3,completed_at=now() where decision_id=$1", [decision.id, error instanceof NemotronUnconfiguredError ? "unconfigured" : "failed", error instanceof NemotronUnconfiguredError ? "Configure Nemotron to generate reactions." : "Reaction generation failed validation or provider access; simulation remains committed."]);
  }
  return readGameDayOutcome(cityId, turn);
}
