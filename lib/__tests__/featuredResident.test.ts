import { beforeEach, describe, expect, it } from 'vitest';
import { pickRandomResident, RECENT_MEMORY } from '../featuredResident';
import { useCityPulseStore } from '../store';

const people = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}` }));

describe('pickRandomResident', () => {
  it('returns nothing for an empty roster', () => expect(pickRandomResident([], [], () => 0.5)).toBeUndefined());

  it('uses the random source to choose among eligible residents', () => {
    expect(pickRandomResident(people, [], () => 0)?.id).toBe('r0');
    expect(pickRandomResident(people, [], () => 0.999)?.id).toBe('r9');
    expect(pickRandomResident(people, [], () => 0.5)?.id).toBe('r5');
  });

  it('never picks a recently featured resident while others are available', () => {
    const recent = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
    for (const roll of [0, 0.3, 0.7, 0.999]) expect(pickRandomResident(people, recent, () => roll)?.id).toBe('r9');
  });

  it('when everyone is recent, avoids only the latest', () => {
    const all = people.map(p => p.id);
    for (const roll of [0, 0.5, 0.999]) expect(pickRandomResident(people, all, () => roll)?.id).not.toBe('r9');
  });

  it('still works for a roster of one', () => expect(pickRandomResident([{ id: 'only' }], ['only'], () => 0.4)?.id).toBe('only'));

  it('is genuinely random with the default source: many different residents over many days', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(pickRandomResident(people)!.id);
    expect(seen.size).toBe(people.length);
  });
});

describe('featured resident in the store', () => {
  const { residents, city } = useCityPulseStore.getState();
  beforeEach(() => useCityPulseStore.setState({ featured: null, residents, city }));

  it('has no featured resident until one is rolled, then keeps it for the whole day', () => {
    expect(useCityPulseStore.getState().featured).toBeNull();
    useCityPulseStore.getState().rollFeaturedResident();
    const first = useCityPulseStore.getState().featured!;
    expect(first.day).toBe(city.turn);
    for (let i = 0; i < 20; i++) useCityPulseStore.getState().rollFeaturedResident(); // re-renders must not reshuffle
    expect(useCityPulseStore.getState().featured!.residentId).toBe(first.residentId);
  });

  it('picks someone new each day and does not repeat anyone within the memory window', () => {
    const picked: string[] = [];
    for (let day = 1; day <= RECENT_MEMORY + 1; day++) {
      useCityPulseStore.setState({ city: { ...city, turn: day } });
      useCityPulseStore.getState().rollFeaturedResident();
      picked.push(useCityPulseStore.getState().featured!.residentId);
    }
    expect(new Set(picked).size).toBe(picked.length);
  });

  it('keeps the previous resident until the next roll (no flicker at day change)', () => {
    useCityPulseStore.getState().rollFeaturedResident();
    const today = useCityPulseStore.getState().featured!.residentId;
    useCityPulseStore.setState({ city: { ...city, turn: city.turn + 1 } });
    expect(useCityPulseStore.getState().featured!.residentId).toBe(today);
    useCityPulseStore.getState().rollFeaturedResident();
    expect(useCityPulseStore.getState().featured!.residentId).not.toBe(today);
  });
});
