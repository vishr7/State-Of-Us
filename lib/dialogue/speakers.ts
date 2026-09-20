export type CitySpeaker = 'mayor' | 'assistant' | 'news';
export function briefingSpeaker(day: number, mode: string): CitySpeaker {
  if (mode === 'event') return 'news';
  return (day === 1 || day % 3 === 0) && ['briefing', 'outcome'].includes(mode) ? 'mayor' : 'assistant';
}
