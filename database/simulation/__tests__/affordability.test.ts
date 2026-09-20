import { describe, expect, it } from 'vitest';
import type { PolicyEffects } from '../../types/database';
import { checkAffordability, insufficientFundsMessage, projectTreasury } from '../affordability';

const spend = (amount: number): PolicyEffects => ({ version: 1, city: { treasury: { op: 'add', value: -amount } } });

describe('affordability', () => {
  it('allows a policy the city can pay for', () => {
    expect(checkAffordability(2_000_000, spend(800_000))).toEqual({ affordable: true, projectedTreasury: 1_200_000, shortfall: 0 });
  });

  it('allows spending exactly all the cash — the floor is $0, not $1', () => {
    expect(checkAffordability(800_000, spend(800_000))).toMatchObject({ affordable: true, projectedTreasury: 0 });
  });

  it('refuses a policy that would overdraw the treasury and reports the shortfall', () => {
    expect(checkAffordability(500_000, spend(1_200_000))).toEqual({ affordable: false, projectedTreasury: -700_000, shortfall: 700_000 });
  });

  it('always allows policies that do not touch cash or that bring cash in', () => {
    expect(checkAffordability(0, { version: 1, city: { revenue: { op: 'add', value: 600_000 } } }).affordable).toBe(true);
    expect(checkAffordability(0, { version: 1 }).affordable).toBe(true);
    expect(checkAffordability(0, { version: 1, city: { treasury: { op: 'add', value: 250_000 } } }).affordable).toBe(true);
  });

  it('handles set and multiply ops on treasury', () => {
    expect(projectTreasury(1_000, { version: 1, city: { treasury: { op: 'set', value: 50 } } })).toBe(50);
    expect(projectTreasury(1_000, { version: 1, city: { treasury: { op: 'multiply', value: 0.5 } } })).toBe(500);
    expect(checkAffordability(1_000, { version: 1, city: { treasury: { op: 'set', value: -1 } } }).affordable).toBe(false);
  });

  it('a city already in the red can afford nothing that costs money', () => {
    expect(checkAffordability(-100, spend(1)).affordable).toBe(false);
  });

  it('explains the refusal in player terms', () => {
    const result = checkAffordability(500_000, spend(1_200_000));
    expect(insufficientFundsMessage('Expand Transit', 500_000, result)).toBe(
      'Not enough cash for "Expand Transit": $1,200,000 needed, $500,000 available.',
    );
    // Legacy overdrawn city: never advertises negative cash as "available".
    expect(insufficientFundsMessage('X', -2_520_000, checkAffordability(-2_520_000, spend(100_000)))).toContain('$0 available');
  });
});
