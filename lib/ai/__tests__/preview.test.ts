import { describe, expect, it } from 'vitest';
import type { City, Neighborhood, Resident, Policy } from '../../../database/types/database';
import { previewPolicy } from '../preview';
function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'city-1',
    name: 'Test City',
    current_turn: 0,
    population: 100,
    treasury: 1_000_000,
    revenue: 500_000,
    expenses: 400_000,
    debt: 0,
    happiness: 50,
    approval: 50,
    unemployment: 5,
    average_rent: 1000,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeNeighborhood(overrides: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id: 'n-1',
    city_id: 'city-1',
    name: 'Test Hood',
    population: 50,
    average_income: 60000,
    average_rent: 1500,
    property_value: 300000,
    housing_supply: 20,
    jobs: 10,
    transit_access: 40,
    happiness: 55,
    ...overrides,
  };
}

function makeResident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: 'r-1',
    neighborhood_id: 'n-1',
    age: 30,
    income: 50000,
    occupation: 'teacher',
    housing_status: 'renter',
    housing_cost: 1200,
    commute_minutes: 20,
    family_size: 2,
    tax_sensitivity: 0.5,
    housing_sensitivity: 0.5,
    transit_sensitivity: 0.5,
    government_trust: 0.5,
    happiness: 60,
    archetype: 'young_professional',
    ...overrides,
  };
}


describe('read-only policy comparisons', () => {
  it('compares independent copies without mutating the baseline', () => {
    const base = { city: makeCity(), neighborhoods: [makeNeighborhood()], residents: [makeResident()] };
    const original = structuredClone(base);
    const a = { id: 'a', name: 'A', effects: { version: 1, residents: [{ set: { happiness: { op: 'add', value: 5 } } }] } } as Policy;
    const b = { id: 'b', name: 'B', effects: { version: 1, residents: [{ set: { happiness: { op: 'add', value: -2 } } }] } } as Policy;
    expect(previewPolicy(base,a).metrics.happiness).toBe(65);
    expect(previewPolicy(base,b).metrics.happiness).toBe(58);
    expect(base).toEqual(original);
    expect(previewPolicy(base,a).metrics.happiness).toBe(65);
  });
  it('uses resident aggregation rather than an invented city-level happiness delta', () => {
    const base = { city: makeCity(), neighborhoods: [makeNeighborhood()], residents: [makeResident()] };
    const policy = { id: 'a', name: 'A', effects: { version: 1, city: { happiness: { op: 'add', value: 40 } } } } as Policy;
    expect(previewPolicy(base,policy).metrics.happiness).toBe(60);
  });
});
