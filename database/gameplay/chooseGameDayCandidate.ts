import { validCatalogChoice } from './catalogChoices';
import { getPool, withTransaction } from "../lib/db";
import type { City, Policy } from "../types/database";
import { bindExecutableActions, policyFingerprint } from "../simulation/bindExecutableActions";
import { GameplayError, type GameDayDecision, type GameDayRow } from "./contracts";
import { checkAffordability, insufficientFundsMessage } from "../simulation/affordability";
import { generatedEventSchema } from "../../lib/signals/generated-events";

export async function chooseGameDayCandidate(cityId: string, turn: number, candidateId: string, playerReasoning?: string): Promise<GameDayDecision> {
  return withTransaction(async (db) => {
    const city = (await db.query<City>("select * from cities where id=$1 for update", [cityId])).rows[0];
    if (!city) throw new GameplayError("City not found.", 404);
    const day = (await db.query<GameDayRow>("select * from game_days where city_id=$1 and turn=$2 and status='ready'", [cityId, turn])).rows[0];
    if (!day || !day.selected_ids.includes(candidateId)) throw new GameplayError("Today's choices have changed. Refresh the agenda before choosing a plan.", 409);
    const prior = (await db.query<GameDayDecision>("select * from decisions where game_day_id=$1", [day.id])).rows[0];
    if (prior?.candidate_id === candidateId) return prior;
    if (prior || city.current_turn !== turn) throw new GameplayError("Turn is no longer available for this choice.");
    const candidate = generatedEventSchema.parse(day.candidate_pool.find((item) => item.id === candidateId));
    if (!candidate.executable || !candidate.policyId) throw new GameplayError("Candidate has no executable binding.", 400);
    const policy = (await db.query<Policy>("select * from policies where id=$1", [candidate.policyId])).rows[0];
    if (!policy || !(validCatalogChoice(candidate, policy) || bindExecutableActions([candidate], [policy])[0].executable) || day.policy_hashes[policy.id] !== policyFingerprint(policy)) throw new GameplayError("Authored binding changed; choice rejected.");
    const pending = await db.query("select id from decisions where city_id=$1 and turn=$2", [cityId, turn]);
    if (pending.rows.length) throw new GameplayError("A decision is already queued for this turn.");
    // The treasury may never go below $0: refuse a plan the city can't pay for.
    const affordability = checkAffordability(city.treasury, policy.effects);
    if (!affordability.affordable) throw new GameplayError(insufficientFundsMessage(policy.name, city.treasury, affordability), 422);
    return (await db.query<GameDayDecision>("insert into decisions(city_id,policy_id,turn,player_reasoning,game_day_id,candidate_id) values($1,$2,$3,$4,$5,$6) returning *", [cityId, policy.id, turn, playerReasoning ?? null, day.id, candidateId])).rows[0];
  });
}

export async function findChosenDecision(cityId: string, turn: number) {
  return (await getPool().query<GameDayDecision>("select * from decisions where city_id=$1 and turn=$2 and game_day_id is not null", [cityId, turn])).rows[0];
}
