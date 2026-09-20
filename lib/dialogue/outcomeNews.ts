import type { GameDayOutcome } from '../../database/gameplay/contracts';
import type { ResidentAnnouncement } from '../store';

export function outcomeNews(outcome: GameDayOutcome): Omit<ResidentAnnouncement, 'id'>[] {
  const lines: Omit<ResidentAnnouncement, 'id'>[] = [];
  const candidates = outcome.reactions.map(reaction => ({ reaction, resident: outcome.after.residents.find(r => r.id === reaction.residentId) })).filter(item => !!item.resident);
  const selected: typeof candidates = [];
  const backgrounds = new Set<string>();
  const districts = new Set<string>();
  // First cover distinct districts and household backgrounds, then fill missing backgrounds.
  for (const item of candidates) {
    const r = item.resident!;
    const background = `${r.housing_status}:${r.archetype}`;
    if (!districts.has(r.neighborhood_id) || !backgrounds.has(background)) {
      selected.push(item); districts.add(r.neighborhood_id); backgrounds.add(background);
    }
    if (selected.length === 5) break;
  }
  for (const { resident, reaction } of selected) {
    const district = outcome.after.neighborhoods.find(n => n.id === resident!.neighborhood_id);
    if (!district) continue;
    const before = outcome.before.neighborhoods.find(n => n.id === district.id);
    const changes = before ? [
      ['transit access', district.transit_access - before.transit_access],
      ['housing supply', district.housing_supply - before.housing_supply],
      ['jobs', district.jobs - before.jobs],
      ['average rent', district.average_rent - before.average_rent],
    ].filter(([, value]) => value !== 0).slice(0, 2).map(([name, value]) => `${name} ${Number(value) > 0 ? 'rose' : 'fell'} by ${Math.abs(Number(value)).toFixed(1)}`) : [];
    const tour = `district:${district.name}`;
    const common = { tour, turn: outcome.turn + 2, kind: 'info' as const };
    lines.push({ ...common, speaker: 'news', text: `We’re in ${district.name}, following ${outcome.candidate.title}. ${changes.length ? `The recorded changes here: ${changes.join(', and ')}.` : 'The district’s housing, jobs, rent and transit measures have not changed.'} We’re speaking with a ${resident!.occupation}, a ${resident!.housing_status}. What has this meant for you?` });
    lines.push({ ...common, speaker: 'resident', label: `${resident!.occupation} · ${district.name}`, text: `${reaction.reaction} ${reaction.mainReason}`.slice(0, 900) });
    lines.push({ ...common, speaker: 'news', text: `Their main considerations are ${reaction.keyFactors.slice(0, 2).map(f => f.reason).join(' ')} These are this resident’s views, rather than a poll of the whole district.`.slice(0, 900) });
  }
  if (lines.length) lines.push({ speaker: 'assistant', kind: 'info', turn: outcome.turn + 2, tour: 'choices', text: 'Those are some of the different experiences across the city. Here are your next plans—open a card to compare the costs and tradeoffs.' });
  return lines;
}
