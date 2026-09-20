'use client';

import type { Resident } from '@/lib/types';
import { residentFacts } from '@/lib/residentFacts';

// At-a-glance facts about the resident who is speaking (age, household size, housing, commute, income, education).
export default function ResidentFacts({ resident }: { resident: Resident }) {
  return (
    <ul className="resident-facts" aria-label={`About ${resident.name}`}>
      {residentFacts(resident).map(fact => <li key={fact}>{fact}</li>)}
    </ul>
  );
}
