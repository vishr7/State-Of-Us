import type { Decision, SimulationState } from "../types/database";
import type { GeneratedEventCandidate, GeneratedGameDaySlate } from "../../lib/signals/generated-events";
import type { ResidentReaction } from "../../lib/agents/nemotron";

export class GameplayError extends Error {
  constructor(message: string, readonly status = 409) { super(message); this.name = "GameplayError"; }
}
export interface GameDayRow {
  id: string; city_id: string; turn: number; status: "preparing" | "ready" | "failed";
  candidate_pool: GeneratedEventCandidate[]; selected_ids: string[]; policy_hashes: Record<string, string>;
  generation_metadata: Record<string, unknown>; error: string | null; created_at: string; completed_at: string | null;
}
export interface GameDayDecision extends Decision { game_day_id: string | null; candidate_id: string | null }
export interface GameDayResponse { gameDayId: string; status: GameDayRow["status"]; slate: GeneratedGameDaySlate }
export interface ReactionRunRow {
  decision_id: string; status: "pending" | "running" | "completed" | "failed" | "unconfigured";
  model: string | null; prompt_version: string; error: string | null; started_at: string | null; completed_at: string | null;
}
export interface ResidentReactionRow {
  id: string; city_id: string; turn: number; decision_id: string; game_day_id: string; candidate_id: string;
  resident_id: string; support: number; sentiment: ResidentReaction["sentiment"] | "neutral"; reaction: string; main_reason: string;
  evaluation: ResidentReaction | null;
  provenance: Record<string, unknown>; created_at: string;
}
export interface GameDayOutcome {
  cityId: string; turn: number; decision: GameDayDecision; candidate: GeneratedEventCandidate;
  before: SimulationState; after: SimulationState;
  reactionStatus: "pending" | "running" | "completed" | "failed" | "unconfigured";
  reactions: ResidentReaction[];
}
