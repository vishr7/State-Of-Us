import { interviewDialogue } from '@/lib/dialogue/interviewDialogue';
import { interviewImpact, selectInterviewees } from '@/lib/dialogue/interviewSelection';
import { districtNameFor, fallbackInterview, jobLabel, personaBackground, personaToDbResident } from '@/lib/dialogue/personaInterviews';
import { personaResidents } from '@/lib/personas';
import { z } from 'zod';
import { withTransaction } from '@database/lib/db';
import { loadTurnState } from '@database/simulation/loadTurnState';
import { applyPolicyEffects } from '@database/simulation/applyPolicyEffects';

export const runtime = 'nodejs';
/**
 * Preview effects and reserve unique interviewees for this game day.
 *
 * The interviewees are the people who walk the map (the persona residents), not anonymous
 * database households. Each is expressed in the engine's resident shape so the SAME policy
 * effects preview their own housing cost, commute and income; what they say is then written
 * from their supplied background (biography, interests, skills).
 *
 * The two people chosen for a day are reserved in game_days.generation_metadata, so repeating
 * the request returns the same people and nobody is interviewed twice on different days.
 */
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

      const districtIdByName = new Map(state.neighborhoods.map(n => [n.name, n.id]));
      const residents = personaResidents.flatMap(persona => {
        const neighborhoodId = districtIdByName.get(districtNameFor(persona));
        return neighborhoodId ? [{ persona, row: personaToDbResident(persona, neighborhoodId) }] : [];
      });
      if (!residents.length) throw new Error('No residents are available to interview.');

      const preview = applyPolicyEffects({ city: state.city, neighborhoods: state.neighborhoods, residents: residents.map(r => r.row), effects: policy.effects });
      const candidates = residents.flatMap(({ persona, row }) => {
        const district = state.neighborhoods.find(n => n.id === row.neighborhood_id);
        const next = preview.residents.find(r => r.id === row.id);
        const local = preview.neighborhoods.find(n => n.id === row.neighborhood_id);
        if (!district || !next || !local) return [];
        return [{ persona, resident: row, district, next, local, ...interviewImpact(row, next, district, local) }];
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

    const generated = await interviewDialogue(
      context.people.map(({ persona, resident, district, next, local, mood, reason }) => ({
        resident, persona: personaBackground(persona), district: district.name, next, local, mood, reason,
      })),
      context.policy,
    );
    const lines = context.people.flatMap(({ persona, resident, district, next, local, mood, reason }, index) => {
      const dialogue = generated?.find(d => d.residentId === resident.id);
      const impacts: string[] = [];
      if (next.housing_cost !== resident.housing_cost) impacts.push(`my monthly housing costs would ${next.housing_cost < resident.housing_cost ? 'fall' : 'rise'} by $${Math.abs(next.housing_cost - resident.housing_cost).toFixed(0)}`);
      if (next.commute_minutes !== resident.commute_minutes) impacts.push(`my commute would ${next.commute_minutes < resident.commute_minutes ? 'shorten' : 'lengthen'} by ${Math.abs(next.commute_minutes - resident.commute_minutes).toFixed(1)} minutes`);
      if (next.income !== resident.income) impacts.push(`my annual income would ${next.income > resident.income ? 'rise' : 'fall'} by $${Math.abs(next.income - resident.income).toFixed(0)}`);
      const neighborhoodNote = local.transit_access !== district.transit_access ? 'The change to local transit access matters to this neighborhood.' : local.housing_supply !== district.housing_supply ? 'The change in local housing supply is something I’ll be watching.' : 'I’ll be watching whether our neighborhood benefits as the plan takes effect.';
      const spoken = fallbackInterview({ persona, district: district.name, policyName: context.policy.name, mood, reason, impacts, neighborhoodNote, index });
      const common = { tour: `district:${district.name}`, turn: turn + 1, kind: 'info' as const };
      return [
        // The reporter's introduction is always ours: it reliably names the person, the district and the policy.
        { ...common, speaker: 'news', text: spoken.question },
        // residentId is the map walker's id, so the client can show their figure and fly the camera to them.
        { ...common, speaker: 'resident', residentId: persona.id, residentAge: persona.age, label: `${persona.name} · ${jobLabel(persona.occupation)} · ${district.name}`, text: dialogue?.answer ?? spoken.answer },
      ];
    });
    return Response.json({ lines });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Interviews unavailable.' }, { status: 409 });
  }
}
