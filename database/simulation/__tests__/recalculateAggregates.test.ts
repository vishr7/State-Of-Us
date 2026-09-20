import { describe, expect, it } from 'vitest';
import type { City, Neighborhood, Resident } from '../../types/database';
import { recalculateCityAggregates, recalculateNeighborhoodAggregates } from '../recalculateAggregates';

function makeResident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: 'r-1',
    neighborhood_id: 'n-1',
    age: 30,
    income: 50000,
    occupation: 'teacher',
    housing_status: 'renter',
    housing_cost: 1000,
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

function makeNeighborhood(overrides: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id: 'n-1',
    city_id: 'city-1',
    name: 'Test Hood',
    population: 0,
    average_income: 0,
    average_rent: 0,
    property_value: 300000,
    housing_supply: 20,
    jobs: 10,
    transit_access: 40,
    happiness: 0,
    ...overrides,
  };
}

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'city-1',
    name: 'Test City',
    current_turn: 0,
    population: 0,
    treasury: 1_000_000,
    revenue: 500_000,
    expenses: 400_000,
    debt: 0,
    happiness: 0,
    approval: 0,
    unemployment: 0,
    average_rent: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('recalculateNeighborhoodAggregates', () => {
  it('sums family_size for population, not resident row count', () => {
    const residents = [
      makeResident({ id: 'r-1', family_size: 3 }),
      makeResident({ id: 'r-2', family_size: 4 }),
    ];
    const result = recalculateNeighborhoodAggregates(makeNeighborhood(), residents);
    expect(result.population).toBe(7); // not 2
  });

  it('averages rent only over renter/subsidized households', () => {
    const residents = [
      makeResident({ id: 'r-1', housing_status: 'renter', housing_cost: 1000 }),
      makeResident({ id: 'r-2', housing_status: 'owner', housing_cost: 2000 }),
    ];
    const result = recalculateNeighborhoodAggregates(makeNeighborhood(), residents);
    expect(result.average_rent).toBe(1000); // owner's cost excluded
  });
});

describe('recalculateCityAggregates', () => {
  it('excludes retired and student residents from the unemployment denominator', () => {
    const residents = [
      makeResident({ id: 'r-1', occupation: 'unemployed' }),
      makeResident({ id: 'r-2', occupation: 'retired' }),
      makeResident({ id: 'r-3', occupation: 'student' }),
      makeResident({ id: 'r-4', occupation: 'teacher' }),
    ];
    const result = recalculateCityAggregates(makeCity(), residents);
    // Labor force = { r-1 (unemployed), r-4 (teacher) } = 2; unemployed = 1 -> 50%.
    expect(result.unemployment).toBe(50);
  });

  it('floors an overdrawn treasury at 0 (heals a city saved before the rule existed)', () => {
    const result = recalculateCityAggregates(makeCity({ treasury: -2_520_000 }), []);
    expect(result.treasury).toBe(0);
  });

  it('leaves treasury/revenue/expenses/debt untouched (not derived)', () => {
    const city = makeCity({ treasury: 42, revenue: 7, expenses: 3, debt: 1 });
    const result = recalculateCityAggregates(city, [makeResident()]);
    expect(result.treasury).toBe(42);
    expect(result.revenue).toBe(7);
    expect(result.expenses).toBe(3);
    expect(result.debt).toBe(1);
  });
});
