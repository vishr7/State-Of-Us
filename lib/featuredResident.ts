/**
 * Picks the featured resident for a new game day: random, but never someone
 * featured recently, so it feels fresh instead of cycling through the same few
 * people. Pure (the random source is injectable) so it is easy to test.
 */

/** How many previously featured residents are ruled out (capped by the roster size). */
export const RECENT_MEMORY = 12;

export function pickRandomResident<T extends { id: string }>(
  residents: readonly T[],
  recentIds: readonly string[] = [],
  random: () => number = Math.random,
): T | undefined {
  if (residents.length === 0) return undefined;

  let pool = residents.filter(resident => !recentIds.includes(resident.id));
  if (pool.length === 0) {
    // Everyone was recent (tiny roster): only rule out the very latest, if we can.
    const latest = recentIds[recentIds.length - 1];
    pool = residents.filter(resident => resident.id !== latest);
    if (pool.length === 0) pool = [...residents];
  }
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
