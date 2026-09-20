/**
 * Which resident is featured on a given game day.
 *
 * Deterministic (same day -> same resident, across reloads and devices) and
 * fair: the pick steps through the roster with a stride that shares no factor
 * with its length, so every resident is featured exactly once before anyone
 * repeats, and back-to-back days land on people far apart in the list (i.e.
 * usually different neighborhoods) instead of neighbors.
 *
 * Day 1 is the first resident; `day` is the game's display turn (1, 2, 3, ...).
 */
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** A stride near the golden ratio of the roster length that is coprime with it. */
export function featuredStride(length: number): number {
  if (length <= 2) return 1;
  let stride = Math.max(1, Math.round(length * 0.618));
  while (gcd(stride, length) !== 1) stride++;
  return stride;
}

export function featuredResidentIndex(length: number, day: number): number {
  if (length <= 0) return -1;
  const daysElapsed = Math.max(0, Math.floor(day) - 1);
  return (daysElapsed * featuredStride(length)) % length;
}

export function featuredResidentForDay<T>(residents: readonly T[], day: number): T | undefined {
  const index = featuredResidentIndex(residents.length, day);
  return index < 0 ? undefined : residents[index];
}
