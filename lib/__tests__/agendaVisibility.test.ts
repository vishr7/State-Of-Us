import { expect, it } from 'vitest';
import { agendaHidden } from '../agendaVisibility';

it('keeps choices accessible while optional AI analysis is pending', () => {
  const state = { announcements: [], resolvingTurn: false, insightsPending: 2 };
  expect(agendaHidden(state)).toBe(false);
});
it('preserves active narration and simulation transition visibility', () => {
  expect(agendaHidden({ announcements: [{ tour: 'protest' }], resolvingTurn: false })).toBe(true);
  expect(agendaHidden({ announcements: [], resolvingTurn: true })).toBe(true);
  expect(agendaHidden({ announcements: [{ tour: 'choices' }], resolvingTurn: false })).toBe(false);
});
