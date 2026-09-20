import { getPool } from '../../database/lib/db';
import type { City, Neighborhood, Resident, Policy, Decision, SimulationState } from '../../database/types/database';
import { personaResidents } from '../personas';
import { initialNeighborhoods } from '../mockData';
import type { InsightFacts, InsightRequest } from './contracts';
import { metrics, previewPolicy } from './preview';

export async function loadInsightFacts(cityId: string, request: InsightRequest): Promise<InsightFacts> {
  const client = await getPool().connect();
  try {
    // All context and both previews share a single consistent, read-only snapshot.
    await client.query('begin isolation level repeatable read read only');
    const city = (await client.query<City>('select * from cities where id=$1', [cityId])).rows[0];
    if (!city) throw new Error('CITY_NOT_FOUND');
    const neighborhoods = (await client.query<Neighborhood>('select * from neighborhoods where city_id=$1 order by name', [cityId])).rows;
    const residents = (await client.query<Resident>('select r.* from residents r join neighborhoods n on n.id=r.neighborhood_id where n.city_id=$1 order by r.id', [cityId])).rows;
    const previous = (await client.query<{ state: SimulationState }>('select state from simulation_snapshots where city_id=$1 and turn=$2', [cityId, city.current_turn - 1])).rows[0]?.state;
    const assessment = (await client.query<{ state: SimulationState }>('select state from simulation_snapshots where city_id=$1 and turn=$2', [cityId, city.current_turn])).rows[0]?.state.assessment;
    const decisions = (await client.query<Decision>('select * from decisions where city_id=$1 order by turn desc, created_at desc', [cityId])).rows;
    const ids = request.policyIds.length ? request.policyIds : [...new Set(decisions.filter(d => d.turn >= city.current_turn - 1).map(d => d.policy_id))].slice(0, 2);
    const policies = ids.length ? (await client.query<Policy>('select * from policies where id=any($1::uuid[])', [ids])).rows : [];
    if (request.policyIds.some(id => !policies.some(p => p.id === id))) throw new Error('POLICY_NOT_FOUND');
    await client.query('commit');
    const selected = request.residentId ? personaResidents.find(r => r.id === request.residentId) : undefined;
    if (request.residentId && !selected) throw new Error('RESIDENT_NOT_FOUND');
    const cast = [selected, ...(['lower', 'middle', 'higher'] as const).map(band => personaResidents.find(r => r.incomeGroup === band && r.id !== selected?.id))].filter((r): r is typeof personaResidents[number] => !!r).slice(0, 4);
    const uniqueCast = [...new Map(cast.map(r => [r.id, r])).values()];
    const orderedPolicies = ids.map(id => policies.find(p => p.id === id)!).filter(Boolean);
    return {
      assessment,
      cityName: city.name, turn: city.current_turn + 1, mode: request.mode,
      current: metrics(city), previous: previous ? metrics(previous.city) : null,
      policies: orderedPolicies.map(p => ({ id: p.id, name: p.name, description: p.description, status: decisions.some(d => d.policy_id === p.id && d.turn >= city.current_turn) ? 'queued' : decisions.some(d => d.policy_id === p.id) ? 'applied' : 'proposed' })),
      scenarios: ['compare', 'resident', 'debate', 'decision'].includes(request.mode) ? orderedPolicies.map(p => previewPolicy({ city, neighborhoods, residents }, p)) : [],
      neighborhoods: neighborhoods.map(n => ({ name: n.name, happiness: n.happiness, previous: previous?.neighborhoods.find(b => b.id === n.id)?.happiness ?? null })),
      residents: uniqueCast.map(r => {
        const name = initialNeighborhoods.find(n => n.id === r.neighborhood)?.name ?? r.neighborhood;
        return { id: r.id, name: r.name, occupation: r.occupation, neighborhood: name, income: r.annualIncome, housing: r.isHomeowner ? 'homeowner' : 'renter', priorities: [r.housingSensitivity > .6 ? 'housing affordability' : 'household stability', r.transitSensitivity > .6 ? 'reliable transit' : 'access to jobs'], neighborhoodHappiness: neighborhoods.find(n => n.name === name)?.happiness ?? null };
      }),
      event: request.event, question: request.question,
    };
  } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
  finally { client.release(); }
}
