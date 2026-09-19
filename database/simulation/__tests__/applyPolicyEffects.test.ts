import { describe, expect, it } from 'vitest';
import type { City, Neighborhood, PolicyEffects, Resident } from '../../types/database';
import { applyPolicyEffects } from '../applyPolicyEffects';
import { MalformedPolicyEffectsError, UnsupportedEffectsVersionError } from '../errors';

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

describe('applyPolicyEffects', () => {
  it('applies an "add" op to a city field', () => {
    const effects: PolicyEffects = { version: 1, city: { revenue: { op: 'add', value: 260000 } } };
    const result = applyPolicyEffects({ city: makeCity(), neighborhoods: [], residents: [], effects });
    expect(result.city.revenue).toBe(500_000 + 260_000);
    // Untouched fields carry through unchanged.
    expect(result.city.treasury).toBe(1_000_000);
  });

  it('applies a "multiply" op to a neighborhood field', () => {
    const effects: PolicyEffects = {
      version: 1,
      neighborhoods: [{ set: { transit_access: { op: 'multiply', value: 1.5 } } }],
    };
    const result = applyPolicyEffects({
      city: makeCity(),
      neighborhoods: [makeNeighborhood({ transit_access: 40 })],
      residents: [],
      effects,
    });
    expect(result.neighborhoods[0].transit_access).toBe(60);
  });

  it('applies a "set" op to a resident field', () => {
    const effects: PolicyEffects = {
      version: 1,
      residents: [{ set: { government_trust: { op: 'set', value: 0.9 } } }],
    };
    const result = applyPolicyEffects({
      city: makeCity(),
      neighborhoods: [],
      residents: [makeResident({ government_trust: 0.3 })],
      effects,
    });
    expect(result.residents[0].government_trust).toBe(0.9);
  });

  it('only mutates residents matching the selector', () => {
    const renter = makeResident({ id: 'r-renter', housing_status: 'renter', income: 40000, housing_cost: 1000 });
    const owner = makeResident({ id: 'r-owner', housing_status: 'owner', income: 90000, housing_cost: 2000 });
    const effects: PolicyEffects = {
      version: 1,
      residents: [
        {
          where: { housing_statuses: ['renter'], income_lt: 55000 },
          set: { housing_cost: { op: 'multiply', value: 0.78 } },
        },
      ],
    };

    const result = applyPolicyEffects({ city: makeCity(), neighborhoods: [], residents: [renter, owner], effects });

    const updatedRenter = result.residents.find((r) => r.id === 'r-renter')!;
    const updatedOwner = result.residents.find((r) => r.id === 'r-owner')!;
    expect(updatedRenter.housing_cost).toBeCloseTo(780);
    expect(updatedOwner.housing_cost).toBe(2000); // unaffected: fails housing_statuses selector
  });

  it('only mutates neighborhoods matching the selector', () => {
    const highIncome = makeNeighborhood({ id: 'n-high', average_income: 120000, housing_supply: 20 });
    const lowIncome = makeNeighborhood({ id: 'n-low', average_income: 40000, housing_supply: 20 });
    const effects: PolicyEffects = {
      version: 1,
      neighborhoods: [
        {
          where: { average_income_gte: 70000 },
          set: { housing_supply: { op: 'add', value: 3 } },
        },
      ],
    };

    const result = applyPolicyEffects({
      city: makeCity(),
      neighborhoods: [highIncome, lowIncome],
      residents: [],
      effects,
    });

    expect(result.neighborhoods.find((n) => n.id === 'n-high')!.housing_supply).toBe(23);
    expect(result.neighborhoods.find((n) => n.id === 'n-low')!.housing_supply).toBe(20);
  });

  it('rounds an integer-column target (e.g. commute_minutes) to a whole number', () => {
    const effects: PolicyEffects = {
      version: 1,
      residents: [{ set: { commute_minutes: { op: 'multiply', value: 0.82 } } }],
    };
    const result = applyPolicyEffects({
      city: makeCity(),
      neighborhoods: [],
      residents: [makeResident({ commute_minutes: 38 })],
      effects,
    });
    expect(result.residents[0].commute_minutes).toBe(Math.round(38 * 0.82));
    expect(Number.isInteger(result.residents[0].commute_minutes)).toBe(true);
  });

  it('rejects effects that target a derived/non-permitted field', () => {
    const effects = {
      version: 1,
      neighborhoods: [{ set: { population: { op: 'add', value: 10 } } }],
    } as unknown as PolicyEffects;

    expect(() =>
      applyPolicyEffects({ city: makeCity(), neighborhoods: [makeNeighborhood()], residents: [], effects })
    ).toThrow(MalformedPolicyEffectsError);
  });

  it('throws on an unsupported effects version', () => {
    const effects = { version: 2 } as unknown as PolicyEffects;
    expect(() => applyPolicyEffects({ city: makeCity(), neighborhoods: [], residents: [], effects })).toThrow(
      UnsupportedEffectsVersionError
    );
  });
});
