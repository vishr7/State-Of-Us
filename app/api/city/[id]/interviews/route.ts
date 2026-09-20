import { interviewDialogue } from '@/lib/dialogue/interviewDialogue';
import { residentIdentity } from '@/lib/dialogue/residentIdentity';
import { interviewImpact, selectInterviewees } from '@/lib/dialogue/interviewSelection';
import { z } from 'zod';
import { withTransaction } from '@database/lib/db';
import { loadTurnState } from '@database/simulation/loadTurnState';
import { applyPolicyEffects } from '@database/simulation/applyPolicyEffects';

export const runtime = 'nodejs';
/** Preview effects and reserve unique interviewees for this game day. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    z.uuid().parse(id);
    const { turn } = z.object({ turn: z.number().int().nonnegative() }).parse(await request.json());
    const context = await withTransaction(async db => {
      const state = await loadTurnState(db, id);
      if (state.city.current_turn !== turn) throw new Error('The day changed. Reload before continuing.');
      const decision = state.decisions[0];
      const policy = decision && state.policyByDecisionId.get(decision.id);
      if (!policy) throw new Error('Choose a plan before starting interviews.');
      const preview = applyPolicyEffects({ city: state.city, neighborhoods: state.neighborhoods, residents: state.residents, effects: policy.effects });
      const candidates = state.residents.flatMap(resident => {
        const district = state.neighborhoods.find(n => n.id === resident.neighborhood_id);
        const next = preview.residents.find(r => r.id === resident.id);
        const local = preview.neighborhoods.find(n => n.id === resident.neighborhood_id);
        if (!district || !next || !local) return [];
        return [{ resident, district, next, local, ...interviewImpact(resident, next, district, local) }];
      });
      const days = (await db.query<{ turn: number; generation_metadata: { interviewResidentIds?: string[] } }>(
        'select turn,generation_metadata from game_days where city_id=$1 order by turn', [id])).rows;
      const saved = days.find(day => day.turn === turn)?.generation_metadata.interviewResidentIds;
      const used = new Set(days.filter(day => day.turn !== turn).flatMap(day => day.generation_metadata.interviewResidentIds ?? []));
      const people = saved
        ? saved.flatMap(id => { const person = candidates.find(p => p.resident.id === id); return person ? [person] : []; })
        : selectInterviewees(candidates, used);
      if (people.length < 2) throw new Error('Not enough new residents are available for two distinct interviews.');
      if (!saved) {
        const reservation = await db.query(
          "update game_days set generation_metadata=jsonb_set(generation_metadata,'{interviewResidentIds}',$3::jsonb) where city_id=$1 and turn=$2 returning id",
          [id, turn, JSON.stringify(people.map(p => p.resident.id))]);
        if (!reservation.rows.length) throw new Error('Prepare this game day before starting interviews.');
      }
      return { people, policy };
    });
    const generated = await interviewDialogue(context.people, context.policy);
    const lines = context.people.flatMap(({ resident, district, next, local, mood, reason }, index) => {
        const identity = residentIdentity(resident.id);
        const dialogue = generated?.find(d => d.residentId === resident.id);
        const job = resident.occupation.replaceAll('_', ' ');
        const impacts: string[] = [];
        if (next.housing_cost !== resident.housing_cost) impacts.push(`my monthly housing costs would ${next.housing_cost < resident.housing_cost ? 'fall' : 'rise'} by $${Math.abs(next.housing_cost - resident.housing_cost).toFixed(0)}`);
        if (next.commute_minutes !== resident.commute_minutes) impacts.push(`my commute would ${next.commute_minutes < resident.commute_minutes ? 'shorten' : 'lengthen'} by ${Math.abs(next.commute_minutes - resident.commute_minutes).toFixed(1)} minutes`);
        if (next.income !== resident.income) impacts.push(`my annual income would ${next.income > resident.income ? 'rise' : 'fall'} by $${Math.abs(next.income - resident.income).toFixed(0)}`);
        const neighborhood = local.transit_access !== district.transit_access ? 'The change to local transit access matters to this neighborhood.' : local.housing_supply !== district.housing_supply ? 'The change in local housing supply is something I’ll be watching.' : 'I’ll be watching whether our neighborhood benefits as the plan takes effect.';
        const common = { tour: `district:${district.name}`, turn: turn + 1, kind: 'info' as const };
        return [
          { ...common, speaker: 'news', text: dialogue?.question ?? `We’re in ${district.name}. The city has chosen ${context.policy.name}. Before it takes effect, we’re asking a ${job} who is a ${resident.housing_status}: ${index === 0 ? 'what would this mean for your household?' : 'what matters most to you about this decision?'}` },
          { ...common, speaker: 'resident', residentId: resident.id, residentAge: resident.age, label: `${identity.name} · ${job} · ${district.name}`, text: dialogue?.answer ?? (impacts.length ? `${reason} Under this plan, ${impacts.slice(0, 2).join(', and ')}.` : `${index === 0 ? 'My immediate concern is keeping everyday costs manageable.' : 'I’m looking beyond my own doorstep here.'} ${neighborhood} ${index === 0 ? 'I want to know whether this is worth the cost.' : 'Who gets the benefit matters as much as the overall price.'}`) },
        ];
      });
    return Response.json({ lines });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Interviews unavailable.' }, { status: 409 });
  }
}
