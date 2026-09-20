export const PROTEST_SECONDS = 4.6;
export const PROTESTORS = [
  { x: 117, y: 211, delay: .25, color: '#5683ab', sign: 0, facing: 1 },
  { x: 165, y: 217, delay: .58, color: '#d76255', sign: -1, facing: 1 },
  { x: 215, y: 212, delay: .85, color: '#629a89', sign: 1, facing: -1 },
  { x: 258, y: 218, delay: 1.12, color: '#e8b957', sign: -1, facing: -1 },
  { x: 94, y: 239, delay: 1.4, color: '#9477ae', sign: -1, facing: 1 },
  { x: 143, y: 248, delay: .95, color: '#629a89', sign: 2, facing: 1 },
  { x: 191, y: 243, delay: 1.65, color: '#e8b957', sign: -1, facing: -1 },
  { x: 238, y: 249, delay: 1.85, color: '#5683ab', sign: 0, facing: -1 },
  { x: 281, y: 241, delay: 1.55, color: '#d76255', sign: 1, facing: -1 },
] as const;
const ramp = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const smooth = (t: number, a: number, b: number) => { const p = ramp(t, a, b); return p * p * (3 - 2 * p); };

/** Seconds, fixed positions and independent phases; no wall clock or render-time randomness. */
export function protestFrame(seconds: number, index: number) {
  const person = PROTESTORS[index];
  const t = Math.max(0, Math.min(PROTEST_SECONDS, seconds));
  const arrival = smooth(t, person.delay, person.delay + .85);
  const age = Math.max(0, t - person.delay);
  const settle = 1 - smooth(t, 3.65, PROTEST_SECONDS);
  const idle = Math.sin(age * 9 + index) * .65 * arrival * settle;
  return {
    x: person.x - person.facing * 52 * (1 - arrival),
    y: person.y + 9 * (1 - arrival) + idle,
    opacity: smooth(t, person.delay, person.delay + .2),
    stride: Math.sin(age * 16) * 1.1 * (1 - arrival),
    raise: smooth(t, person.delay + .8, person.delay + 1.35),
    wave: Math.sin(age * 5 + index * 1.7) * .065 * arrival * settle || 0,
  };
}
