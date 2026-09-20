/**
 * State of Us — database types.
 *
 * Hand-maintained mirror of `supabase/migrations/20260919120000_initial_schema.sql`.
 * If you change the migration, change this file in the same commit.
 *
 * ARCHITECTURE RULE
 *   The database and the deterministic simulation engine are the source of
 *   truth. The only field in this entire file an LLM may author is
 *   `Decision.player_reasoning`. Nothing else accepts model output, and no
 *   engine code should ever read that field.
 *
 * NUMERIC COLUMNS
 *   PostgREST serialises `numeric` as a JSON number, so Supabase returns these
 *   as `number` (not `string`, which is what node-postgres would give you).
 *   They are typed `number` here accordingly. Values carry more precision than
 *   IEEE-754 cents in principle — do currency arithmetic in the engine with
 *   integers or a decimal library, not by summing these directly.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const POLICY_CATEGORIES = [
  'housing',
  'transit',
  'taxation',
  'employment',
  'services',
  'environment',
  'safety',
] as const;
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

export const HOUSING_STATUSES = [
  'owner',
  'renter',
  'subsidized',
  'living_with_family',
  'unhoused',
] as const;
export type HousingStatus = (typeof HOUSING_STATUSES)[number];

export const RESIDENT_ARCHETYPES = [
  'student',
  'young_professional',
  'service_worker',
  'mid_career_renter',
  'family_household',
  'long_time_homeowner',
  'small_business_owner',
  'senior_fixed_income',
] as const;
export type ResidentArchetype = (typeof RESIDENT_ARCHETYPES)[number];

export const SIGNAL_CATEGORIES = [
  'employment',
  'housing',
  'infrastructure',
  'public_finance',
  'policy',
] as const;
export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export const SIGNAL_GEOGRAPHY_SCOPES = ['city', 'county', 'metro', 'state', 'national'] as const;
export type SignalGeographyScope = (typeof SIGNAL_GEOGRAPHY_SCOPES)[number];

export const SIGNAL_STATUSES = ['proposed', 'announced', 'in_progress', 'completed'] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                  */
/* -------------------------------------------------------------------------- */

/** A play session. Aggregate fields are rewritten by the engine every turn. */
export interface City {
  id: string;
  name: string;
  /** Next turn to resolve. Incremented only after that turn's snapshot commits. */
  current_turn: number;
  /** Sum of `family_size` across all residents in the city. */
  population: number;
  /** Cash on hand; may be negative. */
  treasury: number;
  /** Annual, >= 0. */
  revenue: number;
  /** Annual, >= 0. */
  expenses: number;
  /** Outstanding principal, >= 0. */
  debt: number;
  /** 0-100. */
  happiness: number;
  /** 0-100. */
  approval: number;
  /** 0-100, percent of the labour force (excludes retired and students). */
  unemployment: number;
  /** Mean monthly housing_cost of renting + subsidised households. */
  average_rent: number;
  created_at: string;
  updated_at: string;
}

export interface Neighborhood {
  id: string;
  city_id: string;
  /** Unique within a city; the stable handle used by policy effect selectors. */
  name: string;
  /** Derived: sum of `family_size` of its residents. */
  population: number;
  /** Derived: mean annual household income. */
  average_income: number;
  /** Derived: mean monthly housing_cost of renting + subsidised households. */
  average_rent: number;
  /** Derived: mean resident happiness, 0-100. */
  happiness: number;
  /** Authored / policy-driven: median home value. */
  property_value: number;
  /** Authored / policy-driven: dwelling units. */
  housing_supply: number;
  /** Authored / policy-driven: jobs located here. */
  jobs: number;
  /** Authored / policy-driven: 0-100 index. */
  transit_access: number;
}

/** One row = one household, represented by its head. */
export interface Resident {
  id: string;
  neighborhood_id: string;
  age: number;
  /** Annual gross household income. */
  income: number;
  /** Free-form; `unemployed`, `retired` and `student` are reserved values. */
  occupation: string;
  housing_status: HousingStatus;
  /** Monthly rent or mortgage payment; 0 when unhoused. */
  housing_cost: number;
  commute_minutes: number;
  /** People this row stands for. `population = sum(family_size)`. */
  family_size: number;
  /** 0-1 behavioural weight. */
  tax_sensitivity: number;
  /** 0-1 behavioural weight. */
  housing_sensitivity: number;
  /** 0-1 behavioural weight. */
  transit_sensitivity: number;
  /** 0-1. */
  government_trust: number;
  /** 0-100. */
  happiness: number;
  archetype: ResidentArchetype;
}

/** Global catalogue entry. Not city-scoped — every city draws from the same deck. */
export interface Policy {
  id: string;
  name: string;
  description: string;
  /** One-off, >= 0. */
  upfront_cost: number;
  /** Per-turn. Negative means the policy is net revenue-positive. */
  recurring_cost: number;
  category: PolicyCategory;
  effects: PolicyEffects;
}

/** Append-only log. A decision at turn N is applied when turn N is resolved. */
export interface Decision {
  id: string;
  city_id: string;
  policy_id: string;
  turn: number;
  /**
   * The ONLY LLM-writable field in the schema. Narrative only — never read by
   * the simulation engine, never used to derive canonical state.
   */
  player_reasoning: string | null;
  created_at: string;
}

/** Immutable canonical state at the START of `turn`. Replay source of truth. */
export interface SimulationSnapshot {
  id: string;
  city_id: string;
  turn: number;
  state: SimulationState;
  created_at: string;
}

/**
 * LLM-extracted fact scraped from an external source. Reference/audit data
 * only — not city-scoped, no foreign key into canonical state, never read by
 * the simulation engine. Mirrors `ExternalSignal` in lib/signals/types.ts.
 */
export interface ExternalSignalRow {
  /** sha256([documentId, model, promptVersion, draft]) — stable across re-ingestion. */
  id: string;
  document_id: string;
  category: SignalCategory;
  headline: string;
  summary: string;
  geography_name: string;
  geography_scope: SignalGeographyScope;
  event_date: string | null;
  status: SignalStatus;
  /** Array of { quote: string }, verified verbatim against the source at extraction time. */
  evidence: Json;
  /** SourceReference: { title, url, publisher, publishedAt }. */
  source: Json;
  /** NormalizedDocument['provenance'] plus extractedAt/model/promptVersion. */
  provenance: Json;
  created_at: string;
}

/**
 * One row = one scraped `ExternalSignalRow` the Gemini supervisor selected as
 * one of that run's five events, plus the `PolicyEffects` Nemotron decided
 * and `applyPolicyEffects.ts` already applied in the same transaction this
 * row was written in. Audit trail for the UI event feed — never re-read as
 * engine input (unlike `policies.effects`, which IS live engine input).
 */
export interface CityEventRow {
  id: string;
  city_id: string;
  external_signal_id: string;
  /** `cities.current_turn` at the moment this event was applied. */
  turn: number;
  category: SignalCategory;
  headline: string;
  summary: string;
  /** Gemini supervisor's one-sentence reason this signal was picked. */
  supervisor_rationale: string;
  supervisor_source: 'gemini' | 'scripted';
  /** PolicyEffects (version 1) already applied to city/neighborhoods/residents. */
  effects: PolicyEffects;
  effects_source: 'nemotron' | 'scripted';
  effects_model: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* JSONB contract: policies.effects                                            */
/* -------------------------------------------------------------------------- */

/**
 * A single mutation the engine applies to one numeric field.
 * Applied in a fixed order — `set`, then `multiply`, then `add` — so that a
 * policy bundle is order-independent and therefore deterministic.
 */
export type EffectOp =
  | { op: 'set'; value: number }
  | { op: 'multiply'; value: number }
  | { op: 'add'; value: number };

/** City fields a policy may move directly. */
export type CityEffectTarget =
  | 'revenue'
  | 'expenses'
  | 'debt'
  | 'treasury'
  | 'happiness'
  | 'approval'
  | 'unemployment';

/** Neighborhood fields a policy may move. Derived fields are excluded: the
 *  engine recomputes population / average_income / average_rent from residents. */
export type NeighborhoodEffectTarget =
  | 'property_value'
  | 'housing_supply'
  | 'jobs'
  | 'transit_access'
  | 'happiness';

/** Resident fields a policy may move. */
export type ResidentEffectTarget =
  | 'income'
  | 'housing_cost'
  | 'commute_minutes'
  | 'government_trust'
  | 'happiness';

/** All predicates AND together. An empty or omitted selector matches everything. */
export interface NeighborhoodSelector {
  names?: string[];
  transit_access_lt?: number;
  transit_access_gte?: number;
  average_income_lt?: number;
  average_income_gte?: number;
}

/** All predicates AND together. An empty or omitted selector matches everything. */
export interface ResidentSelector {
  archetypes?: ResidentArchetype[];
  housing_statuses?: HousingStatus[];
  neighborhood_names?: string[];
  income_lt?: number;
  income_gte?: number;
  age_lt?: number;
  age_gte?: number;
}

export interface NeighborhoodEffect {
  where?: NeighborhoodSelector;
  set: Partial<Record<NeighborhoodEffectTarget, EffectOp>>;
}

export interface ResidentEffect {
  where?: ResidentSelector;
  set: Partial<Record<ResidentEffectTarget, EffectOp>>;
}

/**
 * Machine-readable effect contract stored in `policies.effects`.
 * Authored by humans, executed by the engine. An LLM must never write this.
 */
export interface PolicyEffects {
  /** Bump when the shape changes; the engine refuses versions it doesn't know. */
  version: 1;
  /** Turns until the effect is fully phased in. 0 or omitted = immediate. */
  ramp_turns?: number;
  city?: Partial<Record<CityEffectTarget, EffectOp>>;
  neighborhoods?: NeighborhoodEffect[];
  residents?: ResidentEffect[];
}

/* -------------------------------------------------------------------------- */
/* JSONB contract: simulation_snapshots.state                                  */
/* -------------------------------------------------------------------------- */

export interface AppliedDecision {
  decision_id: string;
  policy_id: string;
  policy_name: string;
}

/**
 * Full canonical state at the start of a turn — enough to restore the tables
 * verbatim and replay forward.
 *
 * MVP scale note: this embeds every resident row. At 100 households that is a
 * few tens of KB per turn, which is fine. Past a few thousand residents, switch
 * to storing a content hash plus a diff against the previous snapshot.
 */
export interface SimulationState {
  version: 1;
  turn: number;
  city: Omit<City, 'created_at' | 'updated_at'>;
  neighborhoods: Neighborhood[];
  residents: Resident[];
  /** Decisions resolved on the way into this turn. Empty at turn 0. */
  applied_decisions: AppliedDecision[];
}

/* -------------------------------------------------------------------------- */
/* supabase-js Database type                                                   */
/* -------------------------------------------------------------------------- */

/** Columns with a DEFAULT are optional on insert. */
type Insert<T, Optional extends keyof T> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>;

export interface Database {
  public: {
    Tables: {
      cities: {
        Row: City;
        Insert: Insert<
          City,
          | 'id'
          | 'current_turn'
          | 'population'
          | 'treasury'
          | 'revenue'
          | 'expenses'
          | 'debt'
          | 'happiness'
          | 'approval'
          | 'unemployment'
          | 'average_rent'
          | 'created_at'
          | 'updated_at'
        >;
        Update: Partial<City>;
      };
      neighborhoods: {
        Row: Neighborhood;
        Insert: Insert<
          Neighborhood,
          | 'id'
          | 'population'
          | 'average_income'
          | 'average_rent'
          | 'happiness'
          | 'property_value'
          | 'housing_supply'
          | 'jobs'
          | 'transit_access'
        >;
        Update: Partial<Neighborhood>;
      };
      residents: {
        Row: Resident;
        Insert: Insert<
          Resident,
          | 'id'
          | 'income'
          | 'housing_cost'
          | 'commute_minutes'
          | 'family_size'
          | 'happiness'
        >;
        Update: Partial<Resident>;
      };
      policies: {
        Row: Policy;
        Insert: Insert<
          Policy,
          'id' | 'description' | 'upfront_cost' | 'recurring_cost' | 'effects'
        >;
        Update: Partial<Policy>;
      };
      decisions: {
        Row: Decision;
        Insert: Insert<Decision, 'id' | 'player_reasoning' | 'created_at'>;
        Update: Partial<Decision>;
      };
      simulation_snapshots: {
        Row: SimulationSnapshot;
        Insert: Insert<SimulationSnapshot, 'id' | 'created_at'>;
        Update: Partial<SimulationSnapshot>;
      };
      external_signals: {
        Row: ExternalSignalRow;
        Insert: Insert<ExternalSignalRow, 'created_at'>;
        Update: Partial<ExternalSignalRow>;
      };
      city_events: {
        Row: CityEventRow;
        Insert: Insert<CityEventRow, 'id' | 'created_at'>;
        Update: Partial<CityEventRow>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      policy_category: PolicyCategory;
      housing_status: HousingStatus;
      resident_archetype: ResidentArchetype;
      signal_category: SignalCategory;
      signal_geography_scope: SignalGeographyScope;
      signal_status: SignalStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

/* -------------------------------------------------------------------------- */
/* Convenience aliases (mirrors what `supabase gen types` produces)            */
/* -------------------------------------------------------------------------- */

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/** A city with its neighborhoods and residents nested — the engine's working set. */
export interface CityWithGeography extends City {
  neighborhoods: (Neighborhood & { residents: Resident[] })[];
}
