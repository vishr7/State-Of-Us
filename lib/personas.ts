import sample from '../data/personas/nemotron-usa.json';
import type { Resident } from './types';

// Source traits stay separate from deliberately synthetic game economics.
function seed(text: string) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
const colors = ['#e4ad62', '#75adcb', '#ba89b9', '#83b494', '#d87864', '#cad1dd'];
export const personaResidents: Resident[] = sample.residents.map((persona, index) => {
  const value = seed(persona.uuid);
  const incomeGroup = (['lower', 'middle', 'higher'] as const)[value % 3];
  const annualIncome = ({ lower: 28000, middle: 56000, higher: 104000 })[incomeGroup] + (value % 15) * 1000;
  const neighborhood = ['homewood', 'lawrenceville', 'shadyside', 'golden_triangle'][index % 4];
  const isHomeowner = value % 5 < 2;
  const commuteMode = (['bus', 'car', 'walk', 'bike'] as const)[(value >>> 4) % 4];
  return {
    id: `nemotron-${persona.uuid}`, name: persona.name, age: persona.age,
    occupation: persona.occupation.replace(/_/g, ' '), neighborhood,
    incomeGroup, annualIncome, isHomeowner, housingCost: Math.round(annualIncome * 0.28 / 12),
    commuteMins: 10 + value % 35, commuteMode, familySize: 1 + value % 4,
    taxSensitivity: 0.35 + (value % 40) / 100, housingSensitivity: isHomeowner ? 0.4 : 0.85,
    transitSensitivity: commuteMode === 'bus' ? 0.9 : 0.4, environmentSensitivity: 0.4 + (value % 45) / 100,
    governmentTrust: 0.5, happiness: 60, mood: 'neutral', policySupport: {}, archetype: 'synthetic_resident',
    portraitColor: colors[index % colors.length], portraitInitials: persona.name.split(' ').slice(0, 2).map(part => part[0]).join(''),
    memories: [], currentQuote: 'I want a city that is affordable, connected, and welcoming.',
    persona: { dataset: sample.dataset, uuid: persona.uuid, education: persona.education, sourceCity: persona.sourceCity, sourceState: persona.sourceState, biography: persona.biography, interests: persona.interests, skills: persona.skills },
  };
});
