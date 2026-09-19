// ============================================================
// CityPulse — Mock Agent Reasoning (Stubbed Nemotron layer)
// Returns the exact output shape the planning doc specifies.
// Swapping in real Nemotron calls = change ONLY this file.
// ============================================================

import { AgentReasoning, Resident, Policy } from './types';

// ------ ARCHETYPE RESPONSE TEMPLATES ------------------------
// Written in recognisably Pittsburgh voices.

interface ResponseTemplate {
  support: number;
  reason: string;
  trustChange: number;
  suggestedPriority?: string;
}

type ArchetypeResponses = {
  [policyCategory: string]: ResponseTemplate;
};

const ARCHETYPE_RESPONSES: Record<string, ArchetypeResponses> = {
  healthcare_worker: {
    housing: {
      support: 0.82,
      reason: "I see patients who've been displaced from Lawrenceville every week. Stable housing keeps people healthier — this is overdue.",
      trustChange: 0.08,
      suggestedPriority: 'housing',
    },
    transit: {
      support: 0.78,
      reason: "I take the 71D to UPMC every morning. Better frequency would change my life — and hundreds of other healthcare workers doing long shifts.",
      trustChange: 0.07,
      suggestedPriority: 'transit',
    },
    taxes: {
      support: 0.44,
      reason: "More revenue is fine if it goes to services, but I've seen promises made and budgets raided before. Show me where it actually lands.",
      trustChange: -0.02,
    },
    safety: {
      support: 0.75,
      reason: "Safe neighborhoods mean healthier ones. I'm for this.",
      trustChange: 0.05,
    },
    business: {
      support: 0.55,
      reason: "Jobs are good, but let's make sure they're good jobs with benefits, not just titles.",
      trustChange: 0.02,
    },
    environment: {
      support: 0.72,
      reason: "The air quality on days when the wind comes up from Clairton is genuinely frightening. I see it in the ER.",
      trustChange: 0.06,
    },
  },

  retired_mill_worker: {
    housing: {
      support: 0.60,
      reason: "I own my house, so I'm fine. But my neighbors' kids can't afford anything nearby. Something's gotta give.",
      trustChange: 0.03,
    },
    transit: {
      support: 0.65,
      reason: "I don't ride much anymore but the young people in this neighborhood need it. Those cuts in 2012 hurt Homewood bad.",
      trustChange: 0.04,
    },
    taxes: {
      support: 0.18,
      reason: "They took the mill, they took the pension, now they want more taxes? I've heard enough promises from City Hall.",
      trustChange: -0.08,
      suggestedPriority: 'housing',
    },
    safety: {
      support: 0.80,
      reason: "This neighborhood used to look out for itself. We need the city to show up too, not just when there's cameras around.",
      trustChange: 0.06,
    },
    business: {
      support: 0.40,
      reason: "Those tech jobs aren't for people like me or my grandkids. I want to see trades work, union work, real work.",
      trustChange: -0.03,
      suggestedPriority: 'business',
    },
    environment: {
      support: 0.35,
      reason: "Look, I worked at that mill. Those were good jobs. It's complicated.",
      trustChange: -0.02,
    },
  },

  tech_professional: {
    housing: {
      support: 0.55,
      reason: "I support more housing supply in general, though I'll admit my Shadyside rent has been pretty stable.",
      trustChange: 0.03,
    },
    transit: {
      support: 0.65,
      reason: "I bike, so transit isn't my daily thing — but I get that it matters for everyone else. Smart investment.",
      trustChange: 0.04,
    },
    taxes: {
      support: 0.70,
      reason: "The PILOT thing is genuinely fascinating from a policy standpoint. Pitt and UPMC have enormous untaxed wealth here.",
      trustChange: 0.06,
      suggestedPriority: 'taxes',
    },
    safety: {
      support: 0.60,
      reason: "Shadyside is pretty safe. But I care about the whole city — good for Pittsburgh, good for my employer recruiting.",
      trustChange: 0.03,
    },
    business: {
      support: 0.88,
      reason: "Keep the CMU talent here. Every good engineer who leaves for SF is a loss for this city. The incentives make sense.",
      trustChange: 0.09,
      suggestedPriority: 'business',
    },
    environment: {
      support: 0.82,
      reason: "Air quality matters. I can work anywhere — a cleaner Pittsburgh makes it easier to recruit colleagues from coastal cities.",
      trustChange: 0.07,
    },
  },

  union_tradesperson: {
    housing: {
      support: 0.58,
      reason: "I own, so I'm not hurting — but my guys on the job sites are seeing rents eat their whole paycheck.",
      trustChange: 0.04,
    },
    transit: {
      support: 0.30,
      reason: "I drive to every job. Bus doesn't go where I need it when I need it.",
      trustChange: -0.01,
    },
    taxes: {
      support: 0.48,
      reason: "Somebody's gotta pay for the city. Just make sure it's fair and you're not squeezing working people.",
      trustChange: 0.01,
    },
    safety: {
      support: 0.85,
      reason: "Those bridges need work. My crew builds things — I know a structural problem when I see one. Fix 'em.",
      trustChange: 0.08,
      suggestedPriority: 'safety',
    },
    business: {
      support: 0.72,
      reason: "Union contracts on those projects and I'm in. Prevailing wage or no deal.",
      trustChange: 0.05,
    },
    environment: {
      support: 0.40,
      reason: "I'm not against clean air — nobody is. Just don't kill the last good-paying industrial jobs we've got left.",
      trustChange: -0.02,
    },
  },

  transit_worker: {
    housing: {
      support: 0.88,
      reason: "Half my riders are on fixed incomes. Displace them to the suburbs and they can't get to the routes I drive. It's a cycle.",
      trustChange: 0.08,
    },
    transit: {
      support: 0.95,
      reason: "I drive the 71C. I see what happens when service gets cut. People lose jobs. Kids miss school. Yes to this.",
      trustChange: 0.12,
      suggestedPriority: 'transit',
    },
    taxes: {
      support: 0.38,
      reason: "More money coming in is good if it funds transit. I've seen too many 'revenue increases' that never made it to the bus.",
      trustChange: -0.01,
    },
    safety: {
      support: 0.72,
      reason: "The neighborhoods I drive through need investment, not just policing.",
      trustChange: 0.05,
    },
    business: {
      support: 0.52,
      reason: "Jobs are good. Let's make sure the bus can actually get workers there.",
      trustChange: 0.02,
    },
    environment: {
      support: 0.65,
      reason: "Electric buses would be a start. But I'll believe it when I see it in the fleet.",
      trustChange: 0.03,
    },
  },

  precarious_academic: {
    housing: {
      support: 0.90,
      reason: "I live in Oakland on $36k a year. The fact that I can still afford this zip code is dumb luck. Affordable housing saves lives.",
      trustChange: 0.09,
      suggestedPriority: 'housing',
    },
    transit: {
      support: 0.88,
      reason: "I walk to Pitt, so transit is my backup for everything else. And my students absolutely depend on it.",
      trustChange: 0.07,
    },
    taxes: {
      support: 0.82,
      reason: "Pitt paid its president $4.2 million last year on tax-exempt land. The PILOT idea is long overdue.",
      trustChange: 0.10,
      suggestedPriority: 'taxes',
    },
    safety: {
      support: 0.62,
      reason: "Safety matters. Though I'd argue that poverty is the biggest safety issue in this city.",
      trustChange: 0.03,
    },
    business: {
      support: 0.42,
      reason: "Another tech corridor? How about funding the university employees who clean those buildings?",
      trustChange: -0.03,
    },
    environment: {
      support: 0.85,
      reason: "Environmental justice is real. The Mon Valley communities breathe air the rest of us don't.",
      trustChange: 0.07,
    },
  },

  small_business_owner: {
    housing: {
      support: 0.68,
      reason: "If my employees can't afford to live in the neighborhood, they can't work at my restaurant. Yes to affordable housing.",
      trustChange: 0.05,
    },
    transit: {
      support: 0.62,
      reason: "My dinner staff needs the late bus. When service gets cut at 11pm, I lose people.",
      trustChange: 0.04,
    },
    taxes: {
      support: 0.28,
      reason: "Don't come for my commercial property tax again. I'm barely making rent as it is.",
      trustChange: -0.08,
      suggestedPriority: 'business',
    },
    safety: {
      support: 0.70,
      reason: "A safer street means more dinner reservations. Straightforward.",
      trustChange: 0.04,
    },
    business: {
      support: 0.92,
      reason: "Finally. Legacy small businesses have been squeezed for years. Those grants would literally keep us open.",
      trustChange: 0.10,
      suggestedPriority: 'business',
    },
    environment: {
      support: 0.55,
      reason: "I'd love to go sustainable. Cost is the barrier. Help with that and I'm in.",
      trustChange: 0.02,
    },
  },

  public_school_teacher: {
    housing: {
      support: 0.85,
      reason: "I've watched my students' families get pushed from Homewood to Wilkins Township and then off the bus route entirely.",
      trustChange: 0.08,
      suggestedPriority: 'housing',
    },
    transit: {
      support: 0.90,
      reason: "The 54C cuts hurt my school more than anything else the city did in the past decade. Attendance tracks the bus schedule.",
      trustChange: 0.10,
    },
    taxes: {
      support: 0.62,
      reason: "More revenue, fine. Just fund the schools too — not just the infrastructure.",
      trustChange: 0.03,
    },
    safety: {
      support: 0.78,
      reason: "The kids I teach don't feel safe getting to school. That matters more than anything on a test.",
      trustChange: 0.06,
    },
    business: {
      support: 0.55,
      reason: "Jobs help families, which helps kids. But those tech jobs need a pipeline from public schools, not just CMU.",
      trustChange: 0.02,
    },
    environment: {
      support: 0.72,
      reason: "My students in Hazelwood have asthma rates twice the city average. This is an environmental justice issue.",
      trustChange: 0.06,
    },
  },
};

// ------ MAIN EXPORTED FUNCTION ------------------------------

/**
 * Returns stubbed Nemotron-style reasoning for a resident reacting to a policy.
 * Output shape matches the planning doc exactly:
 *   { residentId, policyId, support, reason, trustChange, suggestedPriority? }
 */
export function getAgentReasoning(
  resident: Resident,
  policy: Policy,
): AgentReasoning {
  const archetypeResponses = ARCHETYPE_RESPONSES[resident.archetype];

  let template: ResponseTemplate | undefined;
  if (archetypeResponses) {
    template = archetypeResponses[policy.category];
  }

  // Fallback if archetype or category not mapped
  if (!template) {
    template = generateFallbackResponse(resident, policy);
  }

  // Personalise support based on resident sensitivities
  let support = template.support;
  if (policy.category === 'housing') support *= (0.5 + resident.housingSensitivity * 0.5);
  if (policy.category === 'transit') support *= (0.5 + resident.transitSensitivity * 0.5);
  if (policy.category === 'taxes')   support *= (1.5 - resident.taxSensitivity);
  if (policy.category === 'environment') support *= (0.5 + resident.environmentSensitivity * 0.5);
  support = Math.min(1, Math.max(0, support));

  // Trust change is modulated by current trust
  const trustChange = template.trustChange * (1 - resident.governmentTrust * 0.3);

  return {
    residentId: resident.id,
    policyId: policy.id,
    support: Math.round(support * 100) / 100,
    reason: template.reason,
    trustChange: Math.round(trustChange * 100) / 100,
    suggestedPriority: template.suggestedPriority,
  };
}

function generateFallbackResponse(resident: Resident, policy: Policy): ResponseTemplate {
  const support = 0.5 + (Math.random() - 0.5) * 0.3;
  return {
    support,
    reason: `This policy affects my neighborhood. I'm cautiously ${support > 0.5 ? 'supportive' : 'skeptical'}, but I want to see results before trusting the city on this.`,
    trustChange: support > 0.5 ? 0.02 : -0.02,
  };
}

// ------ BATCH REASONING (for policy enactment) -------------

export function getGroupReactions(
  residents: Resident[],
  policy: Policy,
): Array<{ residentId: string; residentName: string; support: number; reason: string; trustChange: number }> {
  return residents.map(resident => {
    const reasoning = getAgentReasoning(resident, policy);
    return {
      residentId: resident.id,
      residentName: resident.name,
      support: reasoning.support,
      reason: reasoning.reason,
      trustChange: reasoning.trustChange,
    };
  });
}
