import type { Policy } from '../types/database';

// A feeder failure affects lower-income Homewood households, not the whole city.
const where = { neighborhood_names: ['Homewood'], income_lt: 40000 };
export const POWER_OUTAGE_POLICIES: Policy[] = [
  {
    id: 'ae000004-0000-4000-8000-000000000001',
    name: 'Fund emergency power restoration',
    description: 'Spend $180,000 on repair crews and temporary backup power for Homewood households earning under $40,000. Affected households gain 5 happiness and 0.06 trust. Other households receive no direct benefit. No recurring cost.',
    category: 'services', upfront_cost: 180000, recurring_cost: 0,
    effects: { version: 1, city: { treasury: { op: 'add', value: -180000 } },
      residents: [{ where, set: { happiness: { op: 'add', value: 5 }, government_trust: { op: 'add', value: .06 } } }] },
  },
  {
    id: 'ae000004-0000-4000-8000-000000000002',
    name: 'Wait for standard utility repairs',
    description: 'Spend $0 and wait for the utility’s regular repair schedule. Lower-income Homewood households endure a longer outage: 8 happiness and 0.08 trust lost. Other households are unaffected. Power returns by the next day, but frustration remains.',
    category: 'services', upfront_cost: 0, recurring_cost: 0,
    effects: { version: 1, residents: [{ where, set: { happiness: { op: 'add', value: -8 }, government_trust: { op: 'add', value: -.08 } } }] },
  },
];
