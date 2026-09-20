/**
 * The at-a-glance facts shown next to a resident who is speaking: age, household size, housing, commute,
 * income and education. Pure, so it can be tested against every resident on the map.
 */
import type { Resident } from './types';

const EDUCATION: Record<string, string> = {
  less_than_9th: 'Less than 9th grade',
  '9th_12th_no_diploma': 'No high school diploma',
  high_school: 'High school',
  some_college: 'Some college',
  associates: 'Associate’s degree',
  bachelors: 'Bachelor’s degree',
  graduate: 'Graduate degree',
};

const COMMUTE_MODE: Record<Resident['commuteMode'], string> = {
  bus: 'by bus', car: 'by car', walk: 'on foot', bike: 'by bike', incline: 'by incline',
};

/** "high_school" -> "High school"; anything unknown is made readable instead of dropped. */
export function educationLabel(education: string | undefined): string | null {
  if (!education) return null;
  const known = EDUCATION[education];
  if (known) return known;
  const words = education.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : null;
}

export const householdLabel = (size: number) => (size <= 1 ? 'Lives alone' : `Household of ${size}`);

export const incomeLabel = (annual: number) => (annual >= 1000 ? `$${Math.round(annual / 1000)}K a year` : `$${Math.round(annual)} a year`);

export function residentFacts(resident: Resident): string[] {
  const facts = [
    `Age ${resident.age}`,
    householdLabel(resident.familySize),
    resident.isHomeowner ? 'Homeowner' : 'Renter',
    `${resident.commuteMins} min commute ${COMMUTE_MODE[resident.commuteMode] ?? ''}`.trim(),
    incomeLabel(resident.annualIncome),
  ];
  const education = educationLabel(resident.persona?.education);
  if (education) facts.push(education);
  return facts;
}
