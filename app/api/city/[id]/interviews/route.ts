import { interviewAnswers } from '@/lib/dialogue/interviewAnswers';
import type { InterviewOption, InterviewSubject } from '@/lib/dialogue/geminiInterview';
import { interviewImpact, pickRandomInterviewees } from '@/lib/dialogue/interviewSelection';
import { describeChanges, districtNameFor, fallbackInterview, jobLabel, personaBackground, personaToDbResident } from '@/lib/dialogue/personaInterviews';
import { personaResidents } from '@/lib/personas';
import type { GeneratedEventCandidate } from '@/lib/signals/generated-events';
import { z } from 'zod';
import { withTransaction } from '@database/lib/db';
import { loadTurnState } from '@database/simulation/loadTurnState';
import { applyPolicyEffects } from '@database/simulation/applyPolicyEffects';

export const runtime = 'nodejs';
// Gemini can take several seconds per request; give the route room to try Gemini, then Nemotron.
export const maxDuration = 60;

const clip = (text: string | undefined, max: number) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Preview effects and reserve unique interviewees for this game day.
 *
 * The interviewees are the people who walk the map (the persona residents), not anonymous
 * database households. Each is expressed in the engine's resident shape so the SAME policy
 * effects preview their own housing cost, commute and income.
 *
 * What they say is written live by Gemini (falling back to Nemotron, then to an answer built from
 * their own profile) from three things: their Nemotron persona, the OPTION the player selected, and
 * what that option changes for them. See lib/dialogue/geminiInterview.ts.
 *
 * The anchor picks two residents at random (from different districts when possible). They are reserved in
 * game_days.generation_metadata, so repeating the request returns the same people and nobody is
 * interviewed twice on different days.
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
      // Match createWalkers' visible resident pool, so every interview has a map figure.
      const residents = personaResidents.slice(0, 100).flatMap(persona => {
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
        : pickRandomInterviewees(candidates, used);
      if (people.length < 2) throw new Error('Not enough new residents are available for two distinct interviews.');
      if (!saved) {
        const reservation = await db.query(
          "update game_days set generation_metadata=jsonb_set(generation_metadata,'{interviewResidentIds}',$3::jsonb) where city_id=$1 and turn=$2 returning id",
          [id, turn, JSON.stringify(people.map(p => p.resident.id))]);
        if (!reservation.rows.length) throw new Error('Prepare this game day before starting interviews.');
      }

      // The option the player actually selected: the day's candidate plan (title, description, benefits, risks)
      // on top of the policy that carries out its effects.
      const candidateId = (decision as { candidate_id?: string | null }).candidate_id;
      const pool = (await db.query<{ candidate_pool: GeneratedEventCandidate[] | null }>(
        'select candidate_pool from game_days where city_id=$1 and turn=$2', [id, turn])).rows[0]?.candidate_pool ?? [];
      const candidate = candidateId ? pool.find(c => c.id === candidateId) : undefined;
      const option: InterviewOption = {
        title: candidate?.title ?? policy.name,
        description: clip(candidate?.description, 500),
        proposedAction: clip(candidate?.proposedAction, 300),
        benefits: (candidate?.supportedBenefits ?? []).slice(0, 3).map(b => clip(b, 200)!),
        risks: (candidate?.supportedRisks ?? []).slice(0, 3).map(r => clip(r, 200)!),
        policy: { name: policy.name, category: policy.category, description: clip(policy.description, 400)!, upfrontCost: Number(policy.upfront_cost), recurringCost: Number(policy.recurring_cost) },
      };
      return { people, policy, option };
    });

    const subjects: InterviewSubject[] = context.people.map(({ persona, resident, district, next, local, mood, reason }) => {
      const { impacts, neighborhoodNote } = describeChanges(resident, next, district, local);
      return {
        residentId: resident.id, persona: personaBackground(persona), neighborhood: district.name, housing: resident.housing_status,
        mood, feeling: reason, changes: impacts, neighborhoodNote,
      };
    });
    const generated = await interviewAnswers(subjects, context.option);

    const lines = context.people.flatMap(({ persona, resident, district, mood, reason }, index) => {
      const { changes: impacts, neighborhoodNote } = subjects[index];
      const spoken = fallbackInterview({ persona, district: district.name, policyName: context.option.title, mood, reason, impacts, neighborhoodNote, index });
      const answer = generated.get(resident.id);
      const common = { tour: `district:${district.name}`, turn: turn + 1, kind: 'info' as const };
      return [
        // The reporter's introduction is always ours: it reliably names the person, the district and the option.
        { ...common, speaker: 'news', text: spoken.question },
        // residentId is the map walker's id, so the client can show their figure and fly the camera to them.
        { ...common, speaker: 'resident', residentId: persona.id, residentAge: persona.age, label: `${persona.name} · ${jobLabel(persona.occupation)} · ${district.name}`, text: answer?.answer ?? spoken.answer, source: answer?.source ?? 'scripted' },
      ];
    });
    return Response.json({ lines });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Interviews unavailable.' }, { status: 409 });
  }
}
