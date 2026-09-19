// ============================================================
// CityPulse — Backend adapter
// Maps the database's canonical state (snake_case rows served by
// app/api/*) onto the frontend's presentation types (lib/types.ts).
//
// Division of labour when connected:
//   DB / engine (canonical)  city finances + scores, neighborhood aggregates,
//                            the policy effects that move them, the turn count
//   Client only              map layout, descriptions, bridges, events, weather,
//                            calendar, Town Hall personas, agent groups
//
// The two sides are joined by NAME, never by id: frontend ids are slugs
// ('homewood', 'pol-landbank'), database ids are UUIDs. Neighborhood names and
// policy names are emitted from lib/mockData.ts into the Pittsburgh seed by
// scripts/generate-pittsburgh-seed.ts, so they cannot drift.
// ============================================================

import {
  getCity, getDecisions, getNeighborhoods, getPolicies, listCities,
} from '@/src/lib/apiClient';
import type { CitySummary } from '@/src/lib/apiClient';
import type { Neighborhood as DbNeighborhood } from '@database/types/database';
import type { AgentGroup, City, Neighborhood, Policy } from './types';

/** Which database city this app plays. Override with NEXT_PUBLIC_CITY_NAME. */
export const BACKEND_CITY_NAME = process.env.NEXT_PUBLIC_CITY_NAME ?? 'Pittsburgh';

/** How the local (frontend) world lines up with the database's. Built once at connect time. */
export interface BackendLink {
  cityId: string;
  /** frontend policy id -> database policy uuid. Policies with no DB counterpart are absent (they fall back to the local engine). */
  policyIdByLocalId: Record<string, string>;
  /** database policy uuid -> frontend policy id. */
  localIdByPolicyId: Record<string, string>;
  /**
   * The database holds a household SAMPLE (~160 rows), not 300k residents, so
   * raw `population` would show ~300 people. Each population is multiplied by
   * (frontend seed population / database population), captured once at
   * connect time from the frontend's opening state. Only counts are scaled;
   * every rate, score and price is used as-is.
   */
  cityPopulationScale: number;
  populationScaleByLocalId: Record<string, number>;
}

export interface ConnectedWorld {
  link: BackendLink;
  city: City;
  neighborhoods: Neighborhood[];
  /** Local policy ids the database already has a decision recorded for (in force, or queued for the next turn). */
  decidedLocalPolicyIds: Map<string, number>;
}

/** The frontend counts turns from 1; the database's `current_turn` starts at 0. */
export const toDisplayTurn = (dbTurn: number) => dbTurn + 1;

/**
 * Loads the database world and lines it up with the local one. Throws if the
 * API is unreachable or the configured city does not exist — the caller falls
 * back to the local simulation.
 */
export async function connectToBackend(
  local: { city: City; neighborhoods: Neighborhood[]; policies: Policy[] },
): Promise<ConnectedWorld> {
  const cities = await listCities();
  const match = cities.find(c => c.name === BACKEND_CITY_NAME);
  if (!match) {
    throw new Error(`No city named "${BACKEND_CITY_NAME}" in the database (has seed_pittsburgh.sql been applied?)`);
  }

  const [dbCity, dbNeighborhoods, dbPolicies, decisions] = await Promise.all([
    getCity(match.id),
    getNeighborhoods(match.id),
    getPolicies(),
    getDecisions(match.id),
  ]);

  const dbPolicyIdByName = new Map(dbPolicies.map(p => [p.name, p.id]));
  const policyIdByLocalId: Record<string, string> = {};
  const localIdByPolicyId: Record<string, string> = {};
  for (const policy of local.policies) {
    const dbId = dbPolicyIdByName.get(policy.name);
    if (dbId) {
      policyIdByLocalId[policy.id] = dbId;
      localIdByPolicyId[dbId] = policy.id;
    }
  }

  const dbByName = new Map(dbNeighborhoods.map(n => [n.name, n]));
  const populationScaleByLocalId: Record<string, number> = {};
  for (const n of local.neighborhoods) {
    const db = dbByName.get(n.name);
    if (db && db.population > 0) populationScaleByLocalId[n.id] = n.population / db.population;
  }

  const link: BackendLink = {
    cityId: match.id,
    policyIdByLocalId,
    localIdByPolicyId,
    cityPopulationScale: dbCity.population > 0 ? local.city.population / dbCity.population : 1,
    populationScaleByLocalId,
  };

  // A policy may have been decided in several turns; the first turn is when it took effect.
  const decidedLocalPolicyIds = new Map<string, number>();
  for (const d of decisions) {
    const localId = localIdByPolicyId[d.policy_id];
    if (localId && !decidedLocalPolicyIds.has(localId)) decidedLocalPolicyIds.set(localId, toDisplayTurn(d.turn));
  }

  return {
    link,
    city: overlayCity(local.city, dbCity, link),
    neighborhoods: overlayNeighborhoods(local.neighborhoods, dbNeighborhoods, link),
    decidedLocalPolicyIds,
  };
}

/** Database city -> frontend city. Fields the database does not model keep their local values. */
export function overlayCity(local: City, db: CitySummary, link: BackendLink): City {
  return {
    ...local,
    turn: toDisplayTurn(db.current_turn),
    population: Math.round(db.population * link.cityPopulationScale),
    treasury: Math.round(db.treasury),
    revenue: Math.round(db.revenue),
    expenses: Math.round(db.expenses),
    happiness: Math.round(db.happiness),
    approval: Math.round(db.approval),
    unemploymentRate: db.unemployment / 100,
    averageRent: Math.round(db.average_rent),
  };
}

/** Database neighborhoods -> frontend neighborhoods, matched by name. Unmatched ones are left untouched. */
export function overlayNeighborhoods(
  local: Neighborhood[],
  db: DbNeighborhood[],
  link: BackendLink,
): Neighborhood[] {
  const dbByName = new Map(db.map(n => [n.name, n]));
  return local.map(n => {
    const row = dbByName.get(n.name);
    if (!row) return n;
    return {
      ...n,
      population: Math.round(row.population * (link.populationScaleByLocalId[n.id] ?? 1)),
      medianIncome: Math.round(row.average_income),
      averageRent: Math.round(row.average_rent),
      happiness: Math.round(row.happiness),
      propertyValue: Math.round(row.property_value),
      housingUnits: row.housing_supply,
      jobs: row.jobs,
      transitAccess: Math.round(row.transit_access),
    };
  });
}

/** Client-side agent-group sentiment: the mean happiness of the neighborhoods in the group's income band. */
export function updateAgentGroups(groups: AgentGroup[], neighborhoods: Neighborhood[]): AgentGroup[] {
  return groups.map(group => {
    const inBand = neighborhoods.filter(n => n.incomeGroup === group.incomeGroup);
    if (inBand.length === 0) return group;
    const mean = Math.round(inBand.reduce((sum, n) => sum + n.happiness, 0) / inBand.length);
    return { ...group, currentSentiment: Math.min(100, Math.max(0, mean)) };
  });
}
