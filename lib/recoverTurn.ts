import { getCity } from '@/src/lib/apiClient';

/** A failed response may follow a committed turn. Read before considering any retry. */
export async function recoverTurn(cityId: string, expectedTurn: number, refresh: () => Promise<void>) {
  const saved = await getCity(cityId);
  if (saved.current_turn === expectedTurn) return false;
  // Also handles a demo reset in another tab. Never submit another resolve here.
  await refresh();
  return true;
}
