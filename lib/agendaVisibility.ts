/** Pending optional analysis must not hide a playable agenda. */
export function agendaHidden(state: { announcements: { tour?: string }[]; resolvingTurn: boolean }) {
  return state.announcements[0]?.tour !== 'choices' && (state.announcements.length > 0 || state.resolvingTurn);
}
