import { create } from 'zustand';
import { classifyTile, GW, GH } from '../map/cityMapData';

export interface DemolitionSegment { id: string; tx: number; ty: number }
interface AnimationState {
  queue: DemolitionSegment[];
  removed: Record<string, boolean>;
  seen: Record<string, boolean>;
  demolish: (segment: DemolitionSegment) => void;
  impact: (segment: DemolitionSegment) => void;
  finish: (id: string) => void;
}
export const tileKey = (tx: number, ty: number) => `${tx},${ty}`;
export const useAnimationStore = create<AnimationState>((set) => ({
  queue: [], removed: {}, seen: {},
  demolish: segment => set(state => {
    if (!Number.isInteger(segment.tx) || !Number.isInteger(segment.ty) || segment.tx < 0 || segment.ty < 0 || segment.tx >= GW || segment.ty >= GH) return state;
    const tile = classifyTile(segment.tx, segment.ty);
    if (!tile.building || tile.tree || tile.cathedral || tile.landmarkSprite || state.seen[segment.id] || state.removed[tileKey(segment.tx, segment.ty)] || state.queue.some(item => item.tx === segment.tx && item.ty === segment.ty)) return state;
    return { queue: [...state.queue, segment], seen: { ...state.seen, [segment.id]: true } };
  }),
  impact: segment => set(state => ({ removed: { ...state.removed, [tileKey(segment.tx, segment.ty)]: true } })),
  finish: id => set(state => ({ queue: state.queue.filter(item => item.id !== id) })),
}));
