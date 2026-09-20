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
import type { Resident as DbResident, ResidentArchetype } from '../../database/types/database';
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
    return working
      ? `Day to day my job comes down to ${skill}, so I tend to look hard at what things really cost.`
      : `I’ve built up skills like ${skill}, so I look closely at whether public money is well spent.`;
  }
  if (interests.length) {
    const interest = lowerFirst(pick(interests, 'interest'));
    return `When I’m off the clock it’s mostly ${interest}, so I notice how a decision like this changes everyday life around here.`;
  }
  return working
    ? `Working as a ${jobLabel(persona.occupation)}, I see how these decisions land on ordinary people.`
    : 'I’m paying close attention to how these decisions land on ordinary people.';
}

export function fallbackInterview(input: InterviewInput): { question: string; answer: string } {
  const { persona, district, policyName, mood, reason, impacts, neighborhoodNote, index } = input;
  const first = persona.name.split(' ')[0];
  const question = `We’re in ${district} with ${persona.name}. The city has chosen ${policyName}, which hasn’t taken effect yet. ${first}, ${index === 0 ? 'what would this mean for you?' : 'what matters most to you about this decision?'}`;

  const lead = mood === 'uncertain'
    ? 'I’m still making up my mind. I can’t see a direct change to my own bills or commute yet, so I want to know what we’re getting for the city’s spending.'
    : reason;
  const personal = impacts.length ? `If it goes ahead, ${impacts.slice(0, 2).join(', and ')}.` : '';
  // The lead sentence often already says what the neighborhood note would (e.g. better local transit access).
  const noteRepeatsLead = /local transit access|local housing|homes locally/.test(lead) && /transit access|housing supply/.test(neighborhoodNote);
  const answer = [
    lead,
    personal,
    backgroundSentence(persona, policyName, index),
    noteRepeatsLead ? '' : neighborhoodNote,
    index === 0 ? 'I want to know this is worth the cost.' : 'Who gets the benefit matters as much as the overall price.',
  ].filter(Boolean).join(' ');
  return { question, answer };
}
