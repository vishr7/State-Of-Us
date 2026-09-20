import { selectEmotionResidents, type EmotionalMemory } from '../../lib/agents/emotion-context';
import { getPool, withTransaction } from "../lib/db";
import type { Policy, SimulationState } from "../types/database";
import { resolveTurn } from "../simulation/resolveTurn";
import { policyFingerprint } from "../simulation/bindExecutableActions";
import { findChosenDecision } from "./chooseGameDayCandidate";
import { GameplayError, type GameDayOutcome, type GameDayRow } from "./contracts";
import { generateResidentReactions, validateReactions, residentReactionSchema, buildResidentOutcomePrompt, REACTION_PROMPT_VERSION, NemotronUnconfiguredError, type NemotronInput } from "../../lib/agents/nemotron";
import { generatedEventSchema } from "../../lib/signals/generated-events";

export async function readGameDayOutcome(cityId: string, turn: number): Promise<GameDayOutcome> {
  const decision = await findChosenDecision(cityId, turn);
  if (!decision) throw new GameplayError("No chosen game-day decision.", 404);
  const day = (await getPool().query<GameDayRow>("select * from game_days where id=$1", [decision.game_day_id])).rows[0];
  const candidate = generatedEventSchema.parse(day.candidate_pool.find((item) => item.id === decision.candidate_id));
  const snapshots = (await getPool().query<{ turn: number; state: SimulationState }>("select turn,state from simulation_snapshots where city_id=$1 and turn in ($2,$3) order by turn", [cityId, turn, turn + 1])).rows;
  if (snapshots.length !== 2) throw new GameplayError("Decision has not resolved yet.");
  const run = (await getPool().query<{ status: GameDayOutcome["reactionStatus"] }>("select status from reaction_runs where decision_id=$1", [decision.id])).rows[0];
  const rows = (await getPool().query<{ evaluation: unknown | null }>("select evaluation from resident_reactions where decision_id=$1 order by resident_id", [decision.id])).rows;
  return { cityId, turn, decision, candidate, before: snapshots[0].state, after: snapshots[1].state, reactionStatus: rows.some((row) => row.evaluation === null) ? "pending" : run?.status ?? "pending", reactions: rows.filter((row) => row.evaluation !== null).map((row) => residentReactionSchema.parse(row.evaluation)) };
}

export async function resolveGameDay(cityId: string, turn: number, react: typeof generateResidentReactions = generateResidentReactions): Promise<GameDayOutcome> {
  const decision = await findChosenDecision(cityId, turn);
  if (!decision) throw new GameplayError("Choose a game-day candidate first.", 400);
  // The engine owns the transaction and expected-turn replay; no provider runs inside it.
  await resolveTurn(cityId, turn);
  return generateGameDayReactions(cityId, turn, react);
}

export async function generateGameDayReactions(cityId: string, turn: number, react: typeof generateResidentReactions = generateResidentReactions): Promise<GameDayOutcome> {
  const outcome = await readGameDayOutcome(cityId, turn);
  const decision = outcome.decision;
  await getPool().query("insert into reaction_runs(decision_id,status,prompt_version) values($1,'pending',$2) on conflict(decision_id) do update set status='pending',prompt_version=$2 where reaction_runs.prompt_version<>$2 and reaction_runs.status<>'running'", [decision.id, REACTION_PROMPT_VERSION]);
  const claimed = await getPool().query("update reaction_runs set status='running',model=$2,started_at=now(),error=null where decision_id=$1 and status in ('pending','failed','unconfigured') returning decision_id", [decision.id, process.env.NEMOTRON_MODEL ?? null]);
  if (!claimed.rows.length) return readGameDayOutcome(cityId, turn);
  try {
    const policy = (await getPool().query<Policy>("select * from policies where id=$1", [decision.policy_id])).rows[0];
    const day = (await getPool().query<GameDayRow>("select * from game_days where id=$1", [decision.game_day_id])).rows[0];
    if (day.policy_hashes[policy.id] !== policyFingerprint(policy)) throw new Error("Policy changed after resolution.");
    const residents = selectEmotionResidents(outcome.before, outcome.after);
    const history = (await getPool().query<{ resident_id: string; turn: number; evaluation: unknown }>(
      'select resident_id,turn,evaluation from resident_reactions where city_id=$1 and turn<$2 and evaluation is not null order by turn desc', [cityId, turn])).rows;
    const memories: Record<string, EmotionalMemory[]> = {};
    for (const row of history) {
      const previous = residentReactionSchema.safeParse(row.evaluation);
      if (!previous.success || (memories[row.resident_id]?.length ?? 0) >= 3) continue;
      (memories[row.resident_id] ??= []).push({ turn: row.turn, supportScore: previous.data.supportScore, reaction: previous.data.reaction, emotions: previous.data.emotions });
    }
    const input: NemotronInput = { candidate: outcome.candidate, policy, residents, before: outcome.before, after: outcome.after, memories };
    const generated = await react(input);
    input.socialVoices = generated.map(r => ({ residentId: r.residentId, neighborhood: '', supportScore: r.supportScore, reaction: r.reaction }));
    const reactions = validateReactions({ reactions: generated }, residents, input);
    await withTransaction(async (db) => {
      for (const reaction of reactions) await db.query("insert into resident_reactions(city_id,turn,decision_id,game_day_id,candidate_id,resident_id,support,sentiment,reaction,main_reason,provenance,evaluation) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb) on conflict(decision_id,resident_id) do update set support=excluded.support,sentiment=excluded.sentiment,reaction=excluded.reaction,main_reason=excluded.main_reason,provenance=excluded.provenance,evaluation=excluded.evaluation", [cityId, turn, decision.id, decision.game_day_id, decision.candidate_id, reaction.residentId, reaction.supportScore / 100, reaction.sentiment, reaction.reaction, reaction.mainReason, JSON.stringify({ model: process.env.NEMOTRON_MODEL ?? null, promptVersion: REACTION_PROMPT_VERSION, beforeTurn: turn, afterTurn: turn + 1, execution: buildResidentOutcomePrompt(input, reaction.residentId).execution }), JSON.stringify(reaction)]);
      await db.query("update reaction_runs set status='completed',completed_at=now() where decision_id=$1", [decision.id]);
    });
  } catch (error) {
    await getPool().query("update reaction_runs set status=$2,error=$3,completed_at=now() where decision_id=$1", [decision.id, error instanceof NemotronUnconfiguredError ? "unconfigured" : "failed", error instanceof NemotronUnconfiguredError ? "Configure Nemotron to generate reactions." : "Reaction generation failed validation or provider access; simulation remains committed."]);
  }
  return readGameDayOutcome(cityId, turn);
}
