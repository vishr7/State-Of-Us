import { afterEach, expect, it, vi } from 'vitest';
import { addsBusService, playTransit, useTransitAnimation } from '../transit';
import type { GeneratedEventCandidate } from '@/lib/signals/generated-events';

afterEach(() => { vi.useRealTimers(); useTransitAnimation.setState({ services: [], spotlight: null }); });
it('recognizes bus expansion but not unrelated or cancelled projects', () => {
  for (const name of ['Expand Transit', 'East Busway Expansion', 'Add new bus routes']) expect(addsBusService(name)).toBe(true);
  for (const name of ['Build Affordable Housing', 'Cut bus service', 'Raise Property Tax']) expect(addsBusService(name)).toBe(false);
});
it('keeps buses after the cinematic and avoids duplicate launches on retry', async () => {
  vi.useFakeTimers();
  const project = { id: 'busway', title: 'East Busway Expansion', actionKey: 'expand_busway' } as GeneratedEventCandidate;
  let done = false;
  const work = playTransit(project, 'city:1').then(() => { done = true; });
  expect(useTransitAnimation.getState().spotlight).toBeTruthy();
  await vi.advanceTimersByTimeAsync(2999);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await work;
  expect(useTransitAnimation.getState().spotlight).toBeNull();
  expect(useTransitAnimation.getState().services).toHaveLength(1);
  await playTransit(project, 'city:1');
  expect(useTransitAnimation.getState().services).toHaveLength(1);
});
