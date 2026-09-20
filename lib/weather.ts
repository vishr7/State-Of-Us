import type { WeatherCondition } from './types';
/** Stable daily weather: reloading cannot reroll the forecast. */
export function dailyWeather(day: number, cityId = 'pittsburgh'): { condition: WeatherCondition; tempC: number } {
  let hash = 2166136261;
  for (const char of `${cityId}:weather:${day}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  const rainy = day === 3 || (day > 3 && (hash >>> 0) / 4294967296 < .1);
  return { condition: rainy ? 'rain' : 'sunny', tempC: rainy ? 15 : 20 };
}
