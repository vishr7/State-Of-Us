/**
 * Street interviews with the people who actually walk the map.
 *
 * The map's residents are Nemotron personas (name, age, occupation, biography,
 * interests, skills). The simulation engine, though, works on database
 * households. To interview a persona we express them in the engine's row shape
 * and run the SAME policy effects over them, so what they say about their own
 * housing cost, commute or income is the engine's preview, not invented.
 *
 * Pure: no I/O. Used by app/api/city/[id]/interviews/route.ts.
 */
import type { Neighborhood, Resident as DbResident, ResidentArchetype } from '../../database/types/database';
import type { Resident as Persona } from '../types';

/** Persona neighborhood id ('golden_triangle') -> database neighborhood name ('Golden Triangle'). */
export const districtNameFor = (persona: Persona) =>
  persona.neighborhood.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export const jobLabel = (occupation: string) => {
  const job = occupation.replace(/_/g, ' ').trim();
  return job === 'not in workforce' ? 'not in the workforce' : job;
};

/** Mirrors the seed's household archetype cascade (database/supabase/seed.sql). */
export function archetypeFor(persona: Persona): ResidentArchetype {
  const notWorking = /not in workforce|student/.test(persona.occupation.replace(/_/g, ' '));
  if (persona.age >= 66) return 'senior_fixed_income';
  if (persona.age < 25 && notWorking) return 'student';
  if (persona.familySize >= 3) return 'family_household';
  if (persona.isHomeowner && persona.age >= 40) return 'long_time_homeowner';
  if (persona.annualIncome < 52000) return 'service_worker';
  if (persona.age <= 39) return 'young_professional';
  return 'mid_career_renter';
}

/** A persona in the engine's resident shape, placed in one of the city's real neighborhoods. */
export function personaToDbResident(persona: Persona, neighborhoodId: string): DbResident {
  return {
    id: persona.id,
    neighborhood_id: neighborhoodId,
    age: persona.age,
    income: persona.annualIncome,
    occupation: persona.occupation,
    housing_status: persona.isHomeowner ? 'owner' : 'renter',
    housing_cost: persona.housingCost,
    commute_minutes: persona.commuteMins,
    family_size: persona.familySize,
    tax_sensitivity: persona.taxSensitivity,
    housing_sensitivity: persona.housingSensitivity,
    transit_sensitivity: persona.transitSensitivity,
    government_trust: persona.governmentTrust,
    happiness: persona.happiness,
    archetype: archetypeFor(persona),
  };
}

/** What the AI is allowed to know about the person: their supplied background, nothing more. */
export function personaBackground(persona: Persona) {
  return {
    name: persona.name,
    age: persona.age,
    occupation: jobLabel(persona.occupation),
    education: persona.persona?.education.replace(/_/g, ' '),
    biography: persona.persona?.biography,
    interests: persona.persona?.interests ?? [],
    skills: persona.persona?.skills ?? [],
  };
}

export type PersonaBackground = ReturnType<typeof personaBackground>;

/**
 * What the chosen option would concretely change for this person and their neighborhood, in
 * first-person words. Shared by the AI prompt and the offline fallback so both say the same true things.
 */
export function describeChanges(before: DbResident, after: DbResident, district: Neighborhood, nextDistrict: Neighborhood) {
  const impacts: string[] = [];
  if (after.housing_cost !== before.housing_cost) impacts.push(`my monthly housing costs would ${after.housing_cost < before.housing_cost ? 'fall' : 'rise'} by $${Math.abs(after.housing_cost - before.housing_cost).toFixed(0)}`);
  if (after.commute_minutes !== before.commute_minutes) impacts.push(`my commute would ${after.commute_minutes < before.commute_minutes ? 'shorten' : 'lengthen'} by ${Math.abs(after.commute_minutes - before.commute_minutes).toFixed(1)} minutes`);
  if (after.income !== before.income) impacts.push(`my annual income would ${after.income > before.income ? 'rise' : 'fall'} by $${Math.abs(after.income - before.income).toFixed(0)}`);
  const neighborhoodNote = nextDistrict.transit_access !== district.transit_access
    ? 'The change to local transit access matters to this neighborhood.'
    : nextDistrict.housing_supply !== district.housing_supply
      ? 'The change in local housing supply is something I’ll be watching.'
      : 'I’ll be watching whether our neighborhood benefits as the plan takes effect.';
  return { impacts, neighborhoodNote };
}

/* ------------------------------------------------------------------ */
/* Offline fallback: an in-character answer built from the same background */
/* ------------------------------------------------------------------ */

function hash(text: string) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
/**
 * The personas come from people elsewhere in the US, so some interests name a place
 * ("Running around Lake Mendota"). A Pittsburgher shouldn't cite those, so only place-free ones are used.
 */
const isPlaceFree = (text: string) => !/\b[A-Z][a-z]+/.test(text.slice(1));

export interface InterviewInput {
  persona: Persona;
  district: string;
  policyName: string;
  mood: string;
  /** First-person sentence from interviewImpact() explaining their feeling. */
  reason: string;
  /** Concrete before/after changes for THIS person, e.g. "my commute would shorten by 4 minutes". */
  impacts: string[];
  /** Sentence about the neighborhood-level change, if any. */
  neighborhoodNote: string;
  /** 0 for the first interviewee, 1 for the second. */
  index: number;
}

/** A sentence that ties the answer to who they are (skills / interests from their own profile). */
export function backgroundSentence(persona: Persona, policyName: string, index: number): string {
  const skills = (persona.persona?.skills ?? []).filter(isPlaceFree);
  const interests = (persona.persona?.interests ?? []).filter(isPlaceFree);
  const working = jobLabel(persona.occupation) !== 'not in the workforce';
  const pick = <T,>(items: T[], salt: string) => items[hash(`${persona.id}:${policyName}:${salt}`) % items.length];
  const useSkill = skills.length > 0 && (interests.length === 0 || (hash(`${persona.id}:${policyName}`) + index) % 2 === 0);

  if (useSkill) {
    const skill = lowerFirst(pick(skills, 'skill'));
    return pick(working ? [
      `My work involves ${skill}. I want the practical details of this plan, not just the headline.`,
      `I spend a lot of my working day on ${skill}. That’s the experience I bring to this decision.`,
      `With my background in ${skill}, I pay attention to how a plan would work day to day.`,
    ] : [
      `I’ve built up skills like ${skill}. I’d like to understand how this plan would be carried out.`,
      `My experience with ${skill} shapes the questions I have about this decision.`,
    ], 'skill-wording');
  }
  if (interests.length) {
    const interest = lowerFirst(pick(interests, 'interest'));
    return pick([
      `I’m interested in ${interest}. I look at city decisions through the everyday life I want here.`,
      `Outside my responsibilities, I make room for ${interest}. There’s more to a neighborhood than its budget.`,
      `For me, ${interest} is part of what makes life enjoyable. I want that everyday side of the city considered too.`,
    ], 'interest-wording');
  }
  return working
    ? `Working as a ${jobLabel(persona.occupation)}, I see how these decisions land on ordinary people.`
    : 'I’m paying close attention to how these decisions land on ordinary people.';
}

export function fallbackInterview(input: InterviewInput): { question: string; answer: string } {
  const { persona, district, policyName, mood, reason, impacts, neighborhoodNote, index } = input;
  const first = persona.name.split(' ')[0];
  const question = `We’re in ${district} with ${persona.name}. The city has chosen ${policyName}, which hasn’t taken effect yet. ${first}, ${index === 0 ? 'what would this mean for you?' : 'what matters most to you about this decision?'}`;

  const variant = hash(`${persona.id}:${policyName}:${index}`);
  const priorities = [
    `I ${persona.isHomeowner ? 'own my home' : 'rent my home'} in ${district}, and housing takes $${Math.round(persona.housingCost).toLocaleString('en-US')} out of my monthly budget.`,
    `My usual commute is ${persona.commuteMins} minutes ${persona.commuteMode === 'walk' ? 'on foot' : `by ${persona.commuteMode}`}. That’s one part of my daily routine I weigh when I hear a plan like this.`,
    `There ${persona.familySize === 1 ? 'is one person' : `are ${persona.familySize} people`} in my household. I’m thinking about how this fits into our everyday costs.`,
  ];
  const lead = mood === 'uncertain' ? [
    'I’m still making up my mind; this option doesn’t directly change my bills or commute.',
    'I don’t see a direct household benefit yet. I’d like to hear why this should be the priority.',
    'For my own situation, the practical effects are still limited. I’m interested in what it would do for the neighborhood.',
  ][variant % 3] : reason;
  const personal = impacts.length ? `If it goes ahead, ${impacts.slice(0, 2).join(', and ')}.` : '';
  // The lead sentence often already says what the neighborhood note would (e.g. better local transit access).
  const noteRepeatsLead = /local transit access|local housing|homes locally/.test(lead) && /transit access|housing supply/.test(neighborhoodNote);
  const answer = [
    priorities[variant % priorities.length],
    backgroundSentence(persona, policyName, index),
    lead,
    personal,
    noteRepeatsLead ? '' : neighborhoodNote,
  ].filter(Boolean).join(' ');
  return { question, answer };
}
