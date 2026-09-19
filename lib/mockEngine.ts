// ============================================================
// CityPulse — Mock Simulation Engine
// Pure functions only — no side effects, no store imports.
// This is the seam where the real backend plugs in.
// ============================================================

import {
  City, Neighborhood, Policy, PolicyEffect, GameEvent,
  SimulationSnapshot, QueuedEffect, AgentGroup,
  Season, WeatherCondition, EventSeverity,
} from './types';

// ------ SEASON / DATE UTILITIES -----------------------------

const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];

export function advanceSeason(season: Season): Season {
  const i = SEASONS.indexOf(season);
  return SEASONS[(i + 1) % 4];
}

export function advanceDate(
  day: number, season: Season, year: number
): { day: number; season: Season; year: number } {
  if (day < 30) return { day: day + 1, season, year };
  const nextSeason = advanceSeason(season);
  const nextYear = nextSeason === 'spring' ? year + 1 : year;
  return { day: 1, season: nextSeason, year: nextYear };
}

// ------ WEATHER (Pittsburgh-realistic skew) -----------------

const WEATHER_BY_SEASON: Record<Season, WeatherCondition[]> = {
  spring: ['overcast', 'overcast', 'rain', 'partly_cloudy', 'sunny', 'fog'],
  summer: ['sunny', 'sunny', 'partly_cloudy', 'overcast', 'rain', 'partly_cloudy'],
  fall:   ['overcast', 'partly_cloudy', 'rain', 'fog', 'sunny', 'overcast'],
  winter: ['snow', 'overcast', 'snow', 'fog', 'overcast', 'partly_cloudy'],
};

export function rollWeather(season: Season): { condition: WeatherCondition; tempC: number } {
  const pool = WEATHER_BY_SEASON[season];
  const condition = pool[Math.floor(Math.random() * pool.length)];
  const baseTemps: Record<Season, [number, number]> = {
    spring: [8, 18], summer: [22, 32], fall: [5, 16], winter: [-4, 4],
  };
  const [lo, hi] = baseTemps[season];
  const tempC = Math.round(lo + Math.random() * (hi - lo));
  return { condition, tempC };
}

// ------ POLICY ENACT ----------------------------------------

/**
 * Immediately applies upfront costs and returns queued delayed effects.
 * Does NOT mutate — returns new city/neighborhood state.
 */
export function enactPolicy(
  city: City,
  neighborhoods: Neighborhood[],
  policy: Policy,
  currentTurn: number,
): {
  updatedCity: City;
  updatedNeighborhoods: Neighborhood[];
  queuedEffects: QueuedEffect[];
} {
  let updatedCity = { ...city };
  let updatedNeighborhoods = [...neighborhoods];
  const queuedEffects: QueuedEffect[] = [];

  // Apply immediate effects (turnsDelay === 0)
  // Queue delayed effects
  for (const effect of policy.effects) {
    if (effect.turnsDelay === 0) {
      const result = applyEffect(updatedCity, updatedNeighborhoods, effect);
      updatedCity = result.city;
      updatedNeighborhoods = result.neighborhoods;
    } else {
      queuedEffects.push({
        id: `qe-${policy.id}-${effect.field}-${currentTurn}`,
        sourcePolicyId: policy.id,
        turnsRemaining: effect.turnsDelay,
        effects: [effect],
        description: `${policy.name}: ${effect.label}`,
      });
    }
  }

  // Deduct upfront cost immediately
  updatedCity = {
    ...updatedCity,
    treasury: updatedCity.treasury - policy.upfrontCost,
  };

  return { updatedCity, updatedNeighborhoods, queuedEffects };
}

// ------ APPLY SINGLE EFFECT ---------------------------------

function applyEffect(
  city: City,
  neighborhoods: Neighborhood[],
  effect: PolicyEffect,
): { city: City; neighborhoods: Neighborhood[] } {
  let c = { ...city };
  let ns = [...neighborhoods];

  const { field, delta, affectedNeighborhoods } = effect;

  if (affectedNeighborhoods.length === 0) {
    // City-wide numeric field
    c = applyDeltaToCity(c, field, delta);
  } else {
    // Neighborhood-specific
    ns = ns.map(n => {
      if (!affectedNeighborhoods.includes(n.id)) return n;
      return applyDeltaToNeighborhood(n, field, delta);
    });
    // Also apply to city composite if relevant
    if (['happiness', 'transitScore', 'safetyScore', 'environmentScore'].includes(field)) {
      const avg = ns.reduce((sum, n) => sum + (n.happiness ?? 0), 0) / ns.length;
      c = { ...c, happiness: clamp(Math.round(avg), 0, 100) };
    }
  }

  return { city: c, neighborhoods: ns };
}

function applyDeltaToCity(city: City, field: string, delta: number): City {
  const c = { ...city } as Record<string, unknown>;
  if (typeof c[field] === 'number') {
    c[field] = clamp_field(field, (c[field] as number) + delta);
  }
  return c as unknown as City;
}

function applyDeltaToNeighborhood(n: Neighborhood, field: string, delta: number): Neighborhood {
  const nb = { ...n } as Record<string, unknown>;
  if (typeof nb[field] === 'number') {
    nb[field] = clamp_field(field, (nb[field] as number) + delta);
  }
  return nb as unknown as Neighborhood;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp_field(field: string, v: number): number {
  if (['happiness', 'approval', 'transitScore', 'safetyScore',
       'environmentScore', 'safetyScore', 'transitAccess'].includes(field)) {
    return clamp(v, 0, 100);
  }
  if (['vacancyRate', 'hillsideRisk', 'gentrificationPressure', 'transitDependence',
       'riverFloodRisk', 'taxExemptPropertyShare', 'renterFraction'].includes(field)) {
    return clamp(v, 0, 1);
  }
  if (field === 'airQualityIndex') return clamp(v, 0, 500);
  return v; // treasury, revenue, rent, etc. unbounded
}

// ------ CONSEQUENCE QUEUE TICK ------------------------------

export function tickConsequenceQueue(
  queue: QueuedEffect[],
  city: City,
  neighborhoods: Neighborhood[],
): {
  updatedCity: City;
  updatedNeighborhoods: Neighborhood[];
  remainingQueue: QueuedEffect[];
  firedDescriptions: string[];
} {
  let c = { ...city };
  let ns = [...neighborhoods];
  const remainingQueue: QueuedEffect[] = [];
  const firedDescriptions: string[] = [];

  for (const item of queue) {
    const ticked = { ...item, turnsRemaining: item.turnsRemaining - 1 };
    if (ticked.turnsRemaining <= 0) {
      // Apply all effects in this queued item
      for (const effect of item.effects) {
        const result = applyEffect(c, ns, effect);
        c = result.city;
        ns = result.neighborhoods;
      }
      firedDescriptions.push(ticked.description);
    } else {
      remainingQueue.push(ticked);
    }
  }

  return { updatedCity: c, updatedNeighborhoods: ns, remainingQueue, firedDescriptions };
}

// ------ RENT PRESSURE MODEL (Displacement Loop) -------------

/**
 * Per-turn rent adjustment.
 * Transit investment → property value → rent → renter unhappiness.
 * This is the displacement loop from the planning doc.
 */
export function computeRentPressure(
  neighborhood: Neighborhood,
  transitScoreDelta: number,
): { newRent: number; rentersHappinessDelta: number } {
  // Base demand pressure from transit investment
  const demandPressure = transitScoreDelta * 0.008;
  // Housing supply effect (vacancy rate lowers pressure)
  const supplyEffect = neighborhood.vacancyRate * 0.04;
  // Gentrification multiplier — Lawrenceville bakes this in
  const gentriMultiplier = 1 + neighborhood.gentrificationPressure * 0.5;

  const rentChangePct = (demandPressure - supplyEffect) * gentriMultiplier;
  const newRent = Math.round(neighborhood.averageRent * (1 + rentChangePct));

  // Renters suffer if rent rises
  const renterImpact = neighborhood.renterFraction;
  const rentersHappinessDelta = rentChangePct > 0
    ? Math.round(-rentChangePct * 100 * renterImpact * 15) // displeasure proportional to rent rise
    : Math.round(-rentChangePct * 100 * renterImpact * 8); // mild relief if rent stabilises

  return { newRent, rentersHappinessDelta };
}

// ------ FULL TURN SIMULATION --------------------------------

export interface TurnResult {
  updatedCity: City;
  updatedNeighborhoods: Neighborhood[];
  updatedAgentGroups: AgentGroup[];
  remainingQueue: QueuedEffect[];
  snapshot: SimulationSnapshot;
  firedEffectDescriptions: string[];
  weather: { condition: WeatherCondition; tempC: number };
}

export function simulateTurn(
  city: City,
  neighborhoods: Neighborhood[],
  agentGroups: AgentGroup[],
  activeEvents: GameEvent[],
  consequenceQueue: QueuedEffect[],
): TurnResult {
  // 1. Tick consequence queue
  const {
    updatedCity: cityAfterQueue,
    updatedNeighborhoods: nAfterQueue,
    remainingQueue,
    firedDescriptions,
  } = tickConsequenceQueue(consequenceQueue, city, neighborhoods);

  let c = { ...cityAfterQueue };
  let ns = [...nAfterQueue];

  // 2. Apply recurring costs/revenues from active policies
  //    (handled in store via active policy list — placeholder here)

  // 3. Per-neighborhood rent pressure
  ns = ns.map(n => {
    const { newRent, rentersHappinessDelta } = computeRentPressure(n, 0);
    return {
      ...n,
      averageRent: newRent,
      happiness: clamp(n.happiness + rentersHappinessDelta, 0, 100),
    };
  });

  // 4. Recompute city-wide averages
  c = {
    ...c,
    happiness: clamp(
      Math.round(ns.reduce((sum, n) => sum + n.happiness, 0) / ns.length), 0, 100
    ),
    averageRent: Math.round(ns.reduce((sum, n) => sum + n.averageRent, 0) / ns.length),
    population: c.population + Math.round((Math.random() - 0.3) * 50), // slight drift
    treasury: c.treasury + c.revenue - c.expenses,
    turn: c.turn + 1,
  };

  // Advance approval (random walk ±2, mean-reverting toward 65)
  const approvalDelta = (65 - c.approval) * 0.05 + (Math.random() - 0.5) * 4;
  c = { ...c, approval: clamp(Math.round(c.approval + approvalDelta), 0, 100) };

  // 5. Advance date
  const { day, season, year } = advanceDate(city.day, city.season, city.year);
  c = { ...c, day, season, year };

  // 6. Update agent groups from neighborhood averages
  const updatedAgentGroups: AgentGroup[] = agentGroups.map(group => {
    const groupNeighborhoods = ns.filter(n => n.incomeGroup === group.incomeGroup);
    const avgSentiment = groupNeighborhoods.length
      ? Math.round(groupNeighborhoods.reduce((s, n) => s + n.happiness, 0) / groupNeighborhoods.length)
      : group.currentSentiment;
    return { ...group, currentSentiment: clamp(avgSentiment, 0, 100) };
  });

  // 7. Snapshot
  const snapshot: SimulationSnapshot = {
    turn: c.turn,
    treasury: c.treasury,
    revenue: c.revenue,
    expenses: c.expenses,
    happiness: c.happiness,
    approval: c.approval,
    population: c.population,
    averageRent: c.averageRent,
    neighborhoodHappiness: Object.fromEntries(ns.map(n => [n.id, n.happiness])),
    neighborhoodRent: Object.fromEntries(ns.map(n => [n.id, n.averageRent])),
    activeEventIds: activeEvents.filter(e => !e.resolved).map(e => e.id),
  };

  // 8. Weather
  const weather = rollWeather(c.season);

  return {
    updatedCity: c,
    updatedNeighborhoods: ns,
    updatedAgentGroups,
    remainingQueue,
    snapshot,
    firedEffectDescriptions: firedDescriptions,
    weather,
  };
}

// ------ EVENT ROLLER ----------------------------------------

const PITTSBURGH_EVENTS: Omit<GameEvent, 'id' | 'startTurn' | 'resolved'>[] = [
  {
    title: 'Bridge Fails Inspection',
    description: 'A structurally deficient bridge is closed after emergency inspection, severing a key commute corridor.',
    category: 'disaster',
    severity: 'high' as EventSeverity,
    affectedNeighborhoods: ['mount_washington', 'south_side_flats'],
    pittsburghFlavor: 'BREAKING: Liberty Bridge closes indefinitely after cracks found in main support truss.',
    effects: [
      { label: 'Commute times +18min', delta: -8, field: 'happiness', isPositive: false, turnsDelay: 0, affectedNeighborhoods: ['mount_washington', 'south_side_flats'] },
      { label: 'Bridge condition −20', delta: -20, field: 'bridgeConditionAvg', isPositive: false, turnsDelay: 0, affectedNeighborhoods: [] },
    ],
  },
  {
    title: 'Hillside Landslide',
    description: 'Heavy rain triggers a slope failure in a hilltop neighborhood, damaging homes and closing a road.',
    category: 'disaster',
    severity: 'high' as EventSeverity,
    affectedNeighborhoods: ['mount_washington'],
    pittsburghFlavor: 'Landslide closes Grandview Ave in both directions. Three homes evacuated.',
    effects: [
      { label: 'Mt. Washington happiness −10', delta: -10, field: 'happiness', isPositive: false, turnsDelay: 0, affectedNeighborhoods: ['mount_washington'] },
      { label: 'Emergency costs −$600,000', delta: -600_000, field: 'treasury', isPositive: false, turnsDelay: 0, affectedNeighborhoods: [] },
    ],
  },
  {
    title: 'Hospital System Expands',
    description: 'A major health system announces a $1.2B Oakland expansion — 2,000 new jobs, but more tax-exempt land.',
    category: 'economy',
    severity: 'medium' as EventSeverity,
    affectedNeighborhoods: ['oakland'],
    pittsburghFlavor: 'UPMC announces Mercy expansion — mayor calls it "a great day for Pittsburgh jobs."',
    effects: [
      { label: 'Jobs +2,000', delta: 2000, field: 'jobs', isPositive: true, turnsDelay: 2, affectedNeighborhoods: ['oakland'] },
      { label: 'Tax-exempt property share +3%', delta: 0.03, field: 'taxExemptPropertyShare', isPositive: false, turnsDelay: 2, affectedNeighborhoods: [] },
    ],
  },
  {
    title: 'AV Startup Shuts Down',
    description: 'A self-driving vehicle startup lays off 400 engineers. Several leave for San Francisco.',
    category: 'economy',
    severity: 'medium' as EventSeverity,
    affectedNeighborhoods: ['strip_district', 'lawrenceville'],
    pittsburghFlavor: 'AutoDrive PGH ceases operations. "Pittsburgh isn\'t ready for autonomous," says CEO.',
    effects: [
      { label: 'Jobs −400', delta: -400, field: 'jobs', isPositive: false, turnsDelay: 0, affectedNeighborhoods: ['strip_district'] },
      { label: 'Population −180 (out-migration)', delta: -180, field: 'population', isPositive: false, turnsDelay: 1, affectedNeighborhoods: [] },
    ],
  },
  {
    title: 'Pittsburgh Named Top City',
    description: 'A national magazine names Pittsburgh a top-10 place to live. In-migration spikes — and so do rents.',
    category: 'political',
    severity: 'low' as EventSeverity,
    affectedNeighborhoods: [],
    pittsburghFlavor: 'Condé Nast: "Pittsburgh is the most livable city in America." Lawrenceville landlords celebrate.',
    effects: [
      { label: 'Population +500', delta: 500, field: 'population', isPositive: true, turnsDelay: 1, affectedNeighborhoods: [] },
      { label: 'Approval +8%', delta: 8, field: 'approval', isPositive: true, turnsDelay: 0, affectedNeighborhoods: [] },
      { label: 'Rent pressure +12% (Lawrenceville)', delta: 0.12, field: 'gentrificationPressure', isPositive: false, turnsDelay: 1, affectedNeighborhoods: ['lawrenceville'] },
    ],
  },
  {
    title: 'Winter Storm',
    description: 'A major winter storm drops 14 inches of snow. Hillside streets are impassable; transit delayed city-wide.',
    category: 'disaster',
    severity: 'medium' as EventSeverity,
    affectedNeighborhoods: ['mount_washington', 'homewood', 'hazelwood'],
    pittsburghFlavor: 'Snow emergency declared. Port Authority suspending service on 12 routes.',
    effects: [
      { label: 'Snow removal −$400,000', delta: -400_000, field: 'treasury', isPositive: false, turnsDelay: 0, affectedNeighborhoods: [] },
      { label: 'Happiness −4 (lower-income hilltops)', delta: -4, field: 'happiness', isPositive: false, turnsDelay: 0, affectedNeighborhoods: ['mount_washington', 'homewood'] },
    ],
  },
  {
    title: 'Mon Valley Mill Layoffs',
    description: 'A coke or steel facility in the Mon Valley announces 650 layoffs. Regional unemployment ticks up.',
    category: 'economy',
    severity: 'high' as EventSeverity,
    affectedNeighborhoods: ['hazelwood', 'homewood'],
    pittsburghFlavor: 'U.S. Steel Clairton to cut 650 workers. Union says "same story, different decade."',
    effects: [
      { label: 'Jobs −650', delta: -650, field: 'jobs', isPositive: false, turnsDelay: 0, affectedNeighborhoods: ['hazelwood'] },
      { label: 'Lower-income happiness −8', delta: -8, field: 'happiness', isPositive: false, turnsDelay: 0, affectedNeighborhoods: ['hazelwood', 'homewood'] },
    ],
  },
  {
    title: 'Student Rent Surge',
    description: 'Academic year begins: Pitt and CMU enrollment swells, driving Oakland-area rents up sharply.',
    category: 'economy',
    severity: 'low' as EventSeverity,
    affectedNeighborhoods: ['oakland', 'shadyside'],
    pittsburghFlavor: 'August landlord price spikes prompt Oakland Neighborhood Coalition to demand action.',
    effects: [
      { label: 'Oakland rent +8%', delta: 80, field: 'averageRent', isPositive: false, turnsDelay: 0, affectedNeighborhoods: ['oakland'] },
      { label: 'Middle-income happiness −4 (Oakland)', delta: -4, field: 'happiness', isPositive: false, turnsDelay: 0, affectedNeighborhoods: ['oakland'] },
    ],
  },
  {
    title: 'Community Protests Development',
    description: 'Residents organize against a proposed development in Lawrenceville, citing displacement concerns.',
    category: 'political',
    severity: 'low' as EventSeverity,
    affectedNeighborhoods: ['lawrenceville'],
    pittsburghFlavor: 'Hundreds march on Penn Ave: "We live here. Stop the displacement."',
    effects: [
      { label: 'Approval −5%', delta: -5, field: 'approval', isPositive: false, turnsDelay: 0, affectedNeighborhoods: [] },
      { label: 'Lawrenceville happiness +3 (solidarity)', delta: 3, field: 'happiness', isPositive: true, turnsDelay: 0, affectedNeighborhoods: ['lawrenceville'] },
    ],
  },
  {
    title: 'River Flash Flooding',
    description: 'Heavy upstream rain causes flash flooding along low-lying river routes, damaging infrastructure.',
    category: 'disaster',
    severity: 'medium' as EventSeverity,
    affectedNeighborhoods: ['strip_district', 'south_side_flats', 'hazelwood'],
    pittsburghFlavor: 'ALCOSAN overflow alert issued. River Road flooded; South Side trail closed.',
    effects: [
      { label: 'Flood damage −$750,000', delta: -750_000, field: 'treasury', isPositive: false, turnsDelay: 0, affectedNeighborhoods: [] },
      { label: 'Environment score −5', delta: -5, field: 'environmentScore', isPositive: false, turnsDelay: 0, affectedNeighborhoods: [] },
    ],
  },
];

/**
 * Rolls for a random event. Returns null if no event fires.
 * Probability: ~20% per turn by default.
 */
export function rollEvent(
  currentTurn: number,
  season: Season,
  probability = 0.20,
): GameEvent | null {
  if (Math.random() > probability) return null;

  // Weight winter events in winter
  let pool = [...PITTSBURGH_EVENTS];
  if (season === 'winter') {
    pool = [...pool, PITTSBURGH_EVENTS[5]]; // extra weight on winter storm
  }

  const template = pool[Math.floor(Math.random() * pool.length)];
  return {
    ...template,
    id: `evt-${currentTurn}-${Date.now()}`,
    startTurn: currentTurn,
    resolved: false,
  };
}
