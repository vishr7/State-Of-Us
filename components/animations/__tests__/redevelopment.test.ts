import { afterEach, expect, it, vi } from 'vitest';
import { isHousingConstruction, playRedevelopment } from '../redevelopment';
import { useAnimationStore } from '../store';
import type { GeneratedEventCandidate } from '@/lib/signals/generated-events';

afterEach(() => {
  vi.useRealTimers();
  useAnimationStore.setState({ queue: [], seen: {}, removed: {}, replacements: {} });
});

it('only builds for construction policies, not financial housing support', () => {
  for (const title of ['Fund City Land Bank', 'Build Affordable Housing'])
    expect(isHousingConstruction({ title, actionKey: '' })).toBe(true);
  for (const title of ['Rental Assistance Program', 'Raise Property Tax', 'Expand Transit'])
    expect(isHousingConstruction({ title, actionKey: '' })).toBe(false);
});

it('waits for two distinct lots and does not repeat a finished day', async () => {
  vi.useFakeTimers();
  const project = { id: 'land-bank', title: 'Fund City Land Bank', actionKey: '', description: 'Affordable homes in Homewood' } as GeneratedEventCandidate;
  let completed = false;
  const work = playRedevelopment(project, 'city:2').then(() => { completed = true; });
  const first = useAnimationStore.getState().queue[0];
  expect(first).toBeDefined();
  expect(completed).toBe(false);
  useAnimationStore.getState().finish(first.id);
  await Promise.resolve();
  const second = useAnimationStore.getState().queue[0];
  expect(second).toBeDefined();
  expect([second.tx, second.ty]).not.toEqual([first.tx, first.ty]);
  expect(completed).toBe(false);
  useAnimationStore.getState().finish(second.id);
  await work;
  expect(Object.keys(useAnimationStore.getState().replacements)).toHaveLength(2);
  await playRedevelopment(project, 'city:2');
  expect(useAnimationStore.getState().queue).toHaveLength(0);
});
