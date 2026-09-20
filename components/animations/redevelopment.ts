import type { GeneratedEventCandidate } from '@/lib/signals/generated-events';
import { classifyTile, GW, GH, NEIGHBORHOOD_MARKERS } from '../map/cityMapData';
import { useAnimationStore, tileKey } from './store';

export function isHousingConstruction(project: Pick<GeneratedEventCandidate, 'title' | 'actionKey'>) {
  return /land[ _-]?bank|build.*(?:housing|homes)|(?:housing|homes).*construction/i.test(`${project.title} ${project.actionKey}`);
}

/** Representative lots, not a second source of financial or resident effects. */
export async function playRedevelopment(project: GeneratedEventCandidate, dayKey: string) {
  if (!isHousingConstruction(project)) return;
  const context = `${project.description} ${project.proposedAction ?? ''}`.toLowerCase();
  const district = NEIGHBORHOOD_MARKERS.find(m => context.includes(m.name.toLowerCase()))
    ?? NEIGHBORHOOD_MARKERS.find(m => m.id === 'homewood')!;
  const state = useAnimationStore.getState();
  const lots: { tx: number; ty: number; distance: number }[] = [];
  for (let ty = 0; ty < GH; ty++) for (let tx = 0; tx < GW; tx++) {
    const tile = classifyTile(tx, ty);
    const distance = Math.hypot(tx - district.tx, ty - district.ty);
    if (distance <= 5 && tile.building && ['lower', 'middle', 'wealthy'].includes(tile.building)
      && !tile.tree && !tile.cathedral && !tile.landmarkSprite && !tile.bridge
      && !state.removed[tileKey(tx, ty)] && state.replacements[tileKey(tx, ty)] === undefined)
      lots.push({ tx, ty, distance });
  }
  lots.sort((a, b) => a.distance - b.distance);
  // Sequential lots keep the camera and wrecking ball focused on one project at a time.
  for (const [index, lot] of lots.slice(0, 2).entries()) {
    const id = `redevelop:${dayKey}:${project.id}:${index}`;
    if (useAnimationStore.getState().seen[id]) continue;
    useAnimationStore.getState().demolish({ id, tx: lot.tx, ty: lot.ty, replacement: index ? 6 : 0, redevelopment: true });
    if (!useAnimationStore.getState().queue.some(s => s.id === id)) continue;
    await new Promise<void>(resolve => {
      const unsubscribe = useAnimationStore.subscribe(s => {
        if (!s.queue.some(item => item.id === id)) { clearTimeout(timeout); unsubscribe(); resolve(); }
      });
      // Background tabs can suspend canvas frames; never strand the turn there.
      const timeout = setTimeout(() => { useAnimationStore.getState().finish(id); }, 20000);
    });
  }
}
