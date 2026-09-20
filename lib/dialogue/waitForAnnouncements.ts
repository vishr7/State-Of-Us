/** Narration is presentation: stalled audio must never strand a saved decision. */
export function waitForAnnouncements(
  store: {
    getState: () => { announcements: { id: number }[] };
    subscribe: (listener: (state: { announcements: { id: number }[] }) => void) => () => void;
  },
  ids: Set<number>,
  expire: () => void,
  timeoutMs = 120000,
) {
  return new Promise<void>(resolve => {
    let unsubscribe = () => {};
    const finish = () => { clearTimeout(timer); unsubscribe(); resolve(); };
    const timer = setTimeout(() => { finish(); expire(); }, timeoutMs);
    unsubscribe = store.subscribe(state => {
      if (!state.announcements.some(line => ids.has(line.id))) finish();
    });
    if (!store.getState().announcements.some(line => ids.has(line.id))) finish();
  });
}
