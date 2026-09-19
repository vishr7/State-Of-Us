// ============================================================
// CityPulse — Complete Data Model
// Mirrors the planning-doc database schema exactly.
// Pittsburgh-specific fields are annotated with // [PGH]
// ============================================================

// ------ Enumerations ----------------------------------------

export type IncomeGroup = 'lower' | 'middle' | 'higher';
export type PolicyStatus = 'proposed' | 'active' | 'expired' | 'rejected';
export type AgentMood = 'hopeful' | 'content' | 'frustrated' | 'angry' | 'neutral';
export type WeatherCondition = 'overcast' | 'fog' | 'sunny' | 'rain' | 'snow' | 'partly_cloudy';
export type EventSeverity = 'low' | 'medium' | 'high' | 'critical';
export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export type CategoryId =
  | 'housing'
  | 'transit'
  | 'taxes'
  | 'safety'
  | 'business'
  | 'environment';

// ------ City ------------------------------------------------

export interface City {
  id: string;
  name: string;
  // Time
  turn: number;
  year: number;
  day: number;            // 1–30 within the season
  season: Season;
  // Population
  population: number;
  metroPopulation: number;
  unemploymentRate: number;   // 0–1
  // Finance
  treasury: number;       // current cash balance
  revenue: number;        // per-turn income
  expenses: number;       // per-turn outgoings
  // Composite scores  0–100
  happiness: number;
  approval: number;
  transitScore: number;
  safetyScore: number;
  environmentScore: number;
  // Housing market
  housingSupply: number;      // total units
  averageRent: number;        // $/month
  // Pittsburgh-specific                                      // [PGH]
  bridgeConditionAvg: number;   // 0–100 avg condition of all bridges
  riverFloodRisk: number;       // 0–1 probability per turn
  airQualityIndex: number;      // 0–500 (AQI standard)
  taxExemptPropertyShare: number; // 0–1 fraction of assessed value that is tax-exempt
}

// ------ Neighborhood ----------------------------------------

export interface Neighborhood {
  id: string;
  name: string;
  // Location on isometric map (normalised 0–1 within canvas)
  mapX: number;
  mapY: number;
  // Demographics
  population: number;
  incomeGroup: IncomeGroup;
  medianIncome: number;         // $ annual
  renterFraction: number;       // 0–1
  // Housing
  averageRent: number;
  propertyValue: number;
  housingUnits: number;
  vacancyRate: number;          // 0–1                       // [PGH]
  // Economy
  jobs: number;
  // Scores 0–100
  happiness: number;
  transitAccess: number;
  safetyScore: number;
  // Pittsburgh-specific                                      // [PGH]
  hillsideRisk: number;         // 0–1 landslide probability
  transitDependence: number;    // 0–1 fraction commuting by transit
  bridgeCondition: number;      // 0–100 condition of primary access bridges
  taxExemptPropertyShare: number; // 0–1
  gentrificationPressure: number; // 0–1 rate of rent increase pressure
  // Lore / description
  description: string;
  historicalNote: string;       // one-line Pittsburgh-specific context
}

// ------ Agent / Resident ------------------------------------

export interface Resident {
  id: string;
  name: string;
  age: number;
  occupation: string;
  neighborhood: string;         // neighborhood id
  incomeGroup: IncomeGroup;
  annualIncome: number;
  isHomeowner: boolean;
  housingCost: number;          // $/month
  commuteMins: number;
  commuteMode: 'bus' | 'car' | 'walk' | 'incline' | 'bike';
  familySize: number;
  // Sensitivities 0–1
  taxSensitivity: number;
  housingSensitivity: number;
  transitSensitivity: number;
  environmentSensitivity: number;
  // State
  governmentTrust: number;      // 0–1
  happiness: number;            // 0–100
  mood: AgentMood;
  policySupport: Record<string, number>; // policyId → support 0–1
  // Personality
  archetype: string;            // e.g. "veteran_union_member"
  portraitColor: string;        // Hex for avatar fallback
  portraitInitials: string;     // e.g. "DK"
  avatarUrl?: string;           // Optional pixel art avatar URL
  memories: AgentMemory[];
  currentQuote: string;
}

// ------ Agent Group (sentiment aggregation) -----------------

export interface AgentGroup {
  id: string;
  label: string;
  incomeGroup: IncomeGroup;
  populationRepresented: number;
  medianIncome: number;
  renterFraction: number;
  currentSentiment: number;     // 0–100
  policyPreferences: Record<CategoryId, number>;
  currentQuote: string;
  avatarColor: string;
  avatarUrl?: string;           // Optional pixel art avatar URL
}

// ------ Policy ----------------------------------------------

export interface PolicyEffect {
  label: string;
  delta: number;               // positive = beneficial/cost, sign encodes meaning
  field: string;               // which City or Neighborhood field is affected
  isPositive: boolean;         // for green/red display
  turnsDelay: number;          // consequence engine: lands this many turns later
  affectedNeighborhoods: string[]; // empty = city-wide
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  category: CategoryId;
  // Costs
  upfrontCost: number;         // one-time budget hit
  recurringCost: number;       // per-turn drain (negative = revenue)
  // Effects — displayed as bullets and fed to engine
  effects: PolicyEffect[];
  // Metadata
  status: PolicyStatus;
  turnEnacted?: number;
  affectedNeighborhoods: string[]; // ids
  // Pittsburgh context                                       // [PGH]
  pittsburghNote: string;       // one-line real-world grounding
}

// ------ Decision History ------------------------------------

export interface DecisionHistory {
  id: string;
  policyId: string;
  policyName: string;
  turn: number;
  cityStateBefore: Partial<City>;
  cityStateAfter: Partial<City>;
  residentReactions: AgentReaction[];
  economicSummary: string;
  playerReasoning?: string;
}

export interface AgentReaction {
  residentId: string;
  residentName: string;
  support: number;              // 0–1
  reason: string;
  trustChange: number;          // −1 to +1
}

// ------ Events ----------------------------------------------

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  category: CategoryId | 'disaster' | 'economy' | 'political';
  severity: EventSeverity;
  affectedNeighborhoods: string[];
  startTurn: number;
  endTurn?: number;
  effects: PolicyEffect[];
  resolved: boolean;
  // Pittsburgh-specific                                      // [PGH]
  pittsburghFlavor: string;     // news-headline-style text
}

// ------ Agent Memory ----------------------------------------

export interface AgentMemory {
  id: string;
  residentId: string;
  turn: number;
  summary: string;              // "Mayor raised transit fares"
  trustDelta: number;
  hapinessDelta: number;
  relatedPolicyId?: string;
  relatedEventId?: string;
}

// ------ Simulation Snapshot ---------------------------------

export interface SimulationSnapshot {
  turn: number;
  // City-level series for Recharts
  treasury: number;
  revenue: number;
  expenses: number;
  happiness: number;
  approval: number;
  population: number;
  averageRent: number;
  // Per-neighborhood sentiment for equity chart
  neighborhoodHappiness: Record<string, number>;
  neighborhoodRent: Record<string, number>;
  // Active events at this turn
  activeEventIds: string[];
}

// ------ Consequence Queue -----------------------------------

export interface QueuedEffect {
  id: string;
  sourcePolicyId: string;
  turnsRemaining: number;
  effects: PolicyEffect[];
  description: string;         // "Transit ridership improves"
}

// ------ Bridge ----------------------------------------------

export interface Bridge {
  id: string;
  name: string;
  condition: number;            // 0–100                     // [PGH]
  repairCost: number;
  type: 'suspension' | 'arch' | 'truss' | 'cable_stay';
  isThreeSisters: boolean;      // the three parallel gold bridges // [PGH]
  mapX: number;
  mapY: number;
  affectedNeighborhoods: string[];
  lastInspectionTurn: number;
}

// ------ Nemotron / Mock Agent Output ------------------------

export interface AgentReasoning {
  residentId: string;
  policyId: string;
  support: number;              // 0–1 — exact Nemotron output shape
  reason: string;               // short paragraph
  trustChange: number;          // −1 to +1
  suggestedPriority?: string;   // what the agent wants instead
}

// ------ UI State --------------------------------------------

export interface UIState {
  activeCategoryId: CategoryId;
  isPlaying: boolean;
  selectedNeighborhoodId: string | null;
  selectedBridgeId: string | null;
  selectedResidentId: string | null;
  showPolicyBrowser: boolean;
  showAnalytics: boolean;
  showTownHall: boolean;
  toastMessage: string | null;
  toastType: 'success' | 'warning' | 'error' | 'info';
  mapViewport: { x: number; y: number; zoom: number; containerW?: number; containerH?: number };
}

// ------ Root Game State (for Zustand) -----------------------

export interface GameState {
  city: City;
  neighborhoods: Neighborhood[];
  residents: Resident[];
  agentGroups: AgentGroup[];
  policies: Policy[];
  bridges: Bridge[];
  activeEvents: GameEvent[];
  eventLog: GameEvent[];
  decisionHistory: DecisionHistory[];
  snapshots: SimulationSnapshot[];
  consequenceQueue: QueuedEffect[];
  ui: UIState;
}
