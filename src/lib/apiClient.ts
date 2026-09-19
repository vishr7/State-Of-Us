/**
 * Frontend API client — thin typed `fetch` wrappers around the routes in
 * app/api/. No UI here; this is the layer future components call into so
 * they never construct URLs or parse response shapes themselves.
 *
 * Uses relative paths (`/api/...`), so it works from any browser context in
 * this Next.js app (client or server components) without a configured base
 * URL. Every write goes through the server routes — this file has no direct
 * database access, matching the architecture rule (only the server mutates
 * canonical state).
 */
import type { AppliedDecision, City, Decision, Neighborhood, Policy, Resident } from '@database/types/database';

/** What GET /api/city/:id returns — City minus its timestamps (see that route). */
export type CitySummary = Omit<City, 'created_at' | 'updated_at'>;

export interface ResolveTurnResponse {
  city: City;
  previous_turn: number;
  turn: number;
  applied_decisions: AppliedDecision[];
}

/** Thrown for any non-2xx response. Carries the HTTP status for callers that want to branch on it (e.g. 409 on a duplicate decision). */
export class ApiClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Request to ${path} failed with status ${response.status}`;
    throw new ApiClientError(message, response.status);
  }

  return payload as T;
}

/** What GET /api/city returns per city — enough to find one by name. */
export type CityListItem = Pick<City, 'id' | 'name' | 'current_turn'>;

export function listCities(): Promise<CityListItem[]> {
  return request<CityListItem[]>('/api/city');
}

export function getCity(id: string): Promise<CitySummary> {
  return request<CitySummary>(`/api/city/${id}`);
}

export function getNeighborhoods(id: string): Promise<Neighborhood[]> {
  return request<Neighborhood[]>(`/api/city/${id}/neighborhoods`);
}

export function getResidents(id: string): Promise<Resident[]> {
  return request<Resident[]>(`/api/city/${id}/residents`);
}

export function getPolicies(): Promise<Policy[]> {
  return request<Policy[]>('/api/policies');
}

/** Every decision the city has recorded, oldest first. */
export function getDecisions(cityId: string): Promise<Decision[]> {
  return request<Decision[]>(`/api/city/${cityId}/decisions`);
}

/** Queues a policy decision for the city's current turn. Does not apply it — call resolveTurn() for that. */
export function createDecision(cityId: string, policyId: string, playerReasoning?: string): Promise<Decision> {
  return request<Decision>(`/api/city/${cityId}/decisions`, {
    method: 'POST',
    body: JSON.stringify({ policy_id: policyId, player_reasoning: playerReasoning }),
  });
}

/** Applies all decisions queued for the current turn and advances to the next one. */
export function resolveTurn(cityId: string): Promise<ResolveTurnResponse> {
  return request<ResolveTurnResponse>(`/api/city/${cityId}/resolve-turn`, { method: 'POST' });
}
