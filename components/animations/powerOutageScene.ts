export const OUTAGE_SECONDS = 4.5;

/** Window glass coordinates inside apartment atlas cell 4 (320 × 320). */
export const OUTAGE_WINDOWS = [
  { x: 115, y: 103, side: 1, circuit: 0 },
  { x: 115, y: 134, side: 1, circuit: 1 },
  { x: 115, y: 166, side: 1, circuit: 0 },
  { x: 115, y: 197, side: 1, circuit: 2 },
  { x: 178, y: 125, side: 1, circuit: 1 },
  { x: 178, y: 157, side: 1, circuit: 2 },
  { x: 178, y: 189, side: 1, circuit: 1 },
  { x: 178, y: 221, side: 1, circuit: 0 },
  { x: 211, y: 124, side: -1, circuit: 2 },
  { x: 211, y: 157, side: -1, circuit: 0 },
  { x: 211, y: 190, side: -1, circuit: 2 },
  { x: 211, y: 223, side: -1, circuit: 1 },
  { x: 244, y: 106, side: -1, circuit: 1 },
  { x: 244, y: 137, side: -1, circuit: 2 },
] as const;
export const OUTAGE_LAMPS = [
  { x: 163, y: 255, off: 2.25 },
  { x: 196, y: 246, off: 2.85 },
] as const;

const ramp = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const smooth = (t: number, a: number, b: number) => { const p = ramp(t, a, b); return p * p * (3 - 2 * p); };
// Two low-amplitude dips, separated in time. Never flash the whole scene.
function dip(t: number, start: number) {
  return smooth(t, start, start + .13) * (1 - smooth(t, start + .19, start + .38));
}
export function powerOutageFrame(seconds: number) {
  const t = Math.max(0, Math.min(OUTAGE_SECONDS, seconds));
  const warning = 1 - .38 * dip(t, .7) - .48 * dip(t, 1.35);
  return {
    shade: .27 + .32 * smooth(t, 1.8, 3.7),
    windows: OUTAGE_WINDOWS.map((window, index) => warning * (1 - smooth(t,
      1.85 + window.circuit * .43 + index % 3 * .06,
      2.08 + window.circuit * .43 + index % 3 * .06))),
    lamps: OUTAGE_LAMPS.map(lamp => warning * (1 - smooth(t, lamp.off, lamp.off + .28))),
    backup: smooth(t, 3.6, 4.15),
    // One tiny, fading contact spark; no repeated or full-frame flashes.
    spark: smooth(t, 2.9, 2.96) * (1 - smooth(t, 2.96, 3.16)),
  };
}
