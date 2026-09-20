import type { GeneratedEventCandidate } from "../../lib/signals/generated-events";
export interface ActionMapping { actionKey: string; policyId: string; policyName: string; policyCategory: string; categories: string[]; aliases: string[]; scale: GeneratedEventCandidate["scale"]; resourceTier: GeneratedEventCandidate["resourceTier"]; estimatedDurationDays: number }
/** Reviewed actions; the simulation owns their numerical effects. */
export const ACTION_MAPPINGS: ActionMapping[] = [
  {
    "actionKey": "build_affordable_housing",
    "policyId": "99999999-9999-4999-8999-000000000001",
    "policyName": "Build Affordable Housing",
    "policyCategory": "housing",
    "categories": [
      "housing",
      "development"
    ],
    "aliases": [
      "Build Affordable Housing",
      "Add new low-cost housing units in Homewood."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "expand_transit",
    "policyId": "99999999-9999-4999-8999-000000000002",
    "policyName": "Expand Transit",
    "policyCategory": "transit",
    "categories": [
      "transit",
      "infrastructure"
    ],
    "aliases": [
      "Expand Transit",
      "Add a new bus line and increase train frequency."
    ],
    "scale": "large",
    "resourceTier": 4,
    "estimatedDurationDays": 4
  },
  {
    "actionKey": "raise_property_tax",
    "policyId": "99999999-9999-4999-8999-000000000003",
    "policyName": "Raise Property Tax",
    "policyCategory": "taxes",
    "categories": [
      "public_finance",
      "policy"
    ],
    "aliases": [
      "Raise Property Tax",
      "Increase property tax by 1% for residential areas."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "fund_city_land_bank",
    "policyId": "99999999-9999-4999-8999-000000000004",
    "policyName": "Fund City Land Bank",
    "policyCategory": "housing",
    "categories": [
      "housing",
      "development"
    ],
    "aliases": [
      "Fund City Land Bank",
      "Convert vacant lots to affordable housing in Homewood, Hazelwood, and Larimer. Addresses 28% vacancy rate in disinvested neighborhoods."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "inclusionary_zoning",
    "policyId": "99999999-9999-4999-8999-000000000005",
    "policyName": "Inclusionary Zoning — Lawrenceville",
    "policyCategory": "housing",
    "categories": [
      "housing",
      "development"
    ],
    "aliases": [
      "Inclusionary Zoning — Lawrenceville",
      "Require 15% affordable units in all new Lawrenceville developments over 10 units. Slows displacement of longtime renters."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "stabilize_hillsides",
    "policyId": "99999999-9999-4999-8999-000000000006",
    "policyName": "Hillside Stabilization Program",
    "policyCategory": "housing",
    "categories": [
      "housing",
      "development"
    ],
    "aliases": [
      "Hillside Stabilization Program",
      "Landslide remediation on steep slopes in Mt. Washington, Beechview, and Brookline. Pittsburgh averages 3+ slope failures per year."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "increase_busway_frequency",
    "policyId": "99999999-9999-4999-8999-000000000007",
    "policyName": "East Busway Frequency Increase",
    "policyCategory": "transit",
    "categories": [
      "transit",
      "infrastructure"
    ],
    "aliases": [
      "East Busway Frequency Increase",
      "Add peak-hour bus service to Homewood, Hazelwood, and hilltop neighborhoods underserved by current Port Authority schedules."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "subsidize_incline_fares",
    "policyId": "99999999-9999-4999-8999-000000000008",
    "policyName": "Incline Resident Fare Subsidy",
    "policyCategory": "transit",
    "categories": [
      "transit",
      "infrastructure"
    ],
    "aliases": [
      "Incline Resident Fare Subsidy",
      "Subsidize Mount Washington incline fares for residents (not tourists). Supports transit-dependent hillside commuters."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "extend_light_rail",
    "policyId": "99999999-9999-4999-8999-000000000009",
    "policyName": "Light Rail East End Extension",
    "policyCategory": "transit",
    "categories": [
      "transit",
      "infrastructure"
    ],
    "aliases": [
      "Light Rail East End Extension",
      "Extend the T light rail across the Allegheny into the East End, connecting Oakland, Shadyside, and East Liberty to downtown."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "negotiate_pilot_payments",
    "policyId": "99999999-9999-4999-8999-000000000010",
    "policyName": "Negotiate PILOT Payments from Universities & Hospitals",
    "policyCategory": "taxes",
    "categories": [
      "public_finance",
      "policy"
    ],
    "aliases": [
      "Negotiate PILOT Payments from Universities & Hospitals",
      "Challenge nonprofit property tax exemptions. Secure Payments in Lieu of Taxes from Pitt, CMU, and UPMC — the city's largest landowners — to fund city services."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "shift_land_value_tax",
    "policyId": "99999999-9999-4999-8999-000000000011",
    "policyName": "Land Value Tax Shift",
    "policyCategory": "taxes",
    "categories": [
      "public_finance",
      "policy"
    ],
    "aliases": [
      "Land Value Tax Shift",
      "Tax land more heavily than structures — incentivizes development of vacant lots, reduces speculative holding. Pittsburgh used this policy 1913–2001."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "increase_commuter_tax",
    "policyId": "99999999-9999-4999-8999-000000000012",
    "policyName": "Increase Local Services / Commuter Tax",
    "policyCategory": "taxes",
    "categories": [
      "public_finance",
      "policy"
    ],
    "aliases": [
      "Increase Local Services / Commuter Tax",
      "Raise the tax on suburban workers who use Pittsburgh infrastructure but pay no city income tax. Earned income for non-residents."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "repair_bridges",
    "policyId": "99999999-9999-4999-8999-000000000013",
    "policyName": "Emergency Bridge Inspection & Repair",
    "policyCategory": "safety",
    "categories": [
      "public_safety",
      "infrastructure",
      "environment"
    ],
    "aliases": [
      "Emergency Bridge Inspection & Repair",
      "Accelerated structural inspection of 446 city bridges and immediate repair of those rated in poor condition."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "remediate_sewer_overflows",
    "policyId": "99999999-9999-4999-8999-000000000014",
    "policyName": "Combined Sewer Overflow Remediation",
    "policyCategory": "safety",
    "categories": [
      "public_safety",
      "infrastructure",
      "environment"
    ],
    "aliases": [
      "Combined Sewer Overflow Remediation",
      "Separate storm and sanitary sewers to stop raw sewage discharge into the Allegheny and Monongahela after heavy rain."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "fund_robotics_corridor",
    "policyId": "99999999-9999-4999-8999-000000000015",
    "policyName": "Robotics & AI Corridor Incentives",
    "policyCategory": "business",
    "categories": [
      "business",
      "employment",
      "development"
    ],
    "aliases": [
      "Robotics & AI Corridor Incentives",
      "Tax abatements and city grants to retain CMU spinoffs in Pittsburgh. Counter the talent drain to Bay Area and NYC."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "small_business_grants",
    "policyId": "99999999-9999-4999-8999-000000000016",
    "policyName": "Butler Street Small Business Grants",
    "policyCategory": "business",
    "categories": [
      "business",
      "employment",
      "development"
    ],
    "aliases": [
      "Butler Street Small Business Grants",
      "Emergency grants to legacy Butler Street businesses facing rent increases due to rapid Lawrenceville gentrification."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "enforce_air_quality",
    "policyId": "99999999-9999-4999-8999-000000000017",
    "policyName": "Mon Valley Air Quality Enforcement",
    "policyCategory": "environment",
    "categories": [
      "environment",
      "infrastructure"
    ],
    "aliases": [
      "Mon Valley Air Quality Enforcement",
      "Stricter enforcement of air quality standards against industrial emitters in the Monongahela Valley. Improves health outcomes, risks industrial jobs."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  },
  {
    "actionKey": "expand_riverfront_trails",
    "policyId": "99999999-9999-4999-8999-000000000018",
    "policyName": "Riverfront Trail & Green Infrastructure",
    "policyCategory": "environment",
    "categories": [
      "environment",
      "infrastructure"
    ],
    "aliases": [
      "Riverfront Trail & Green Infrastructure",
      "Extend the Three Rivers Heritage Trail, add bioswales and green stormwater infrastructure along riverbanks."
    ],
    "scale": "medium",
    "resourceTier": 3,
    "estimatedDurationDays": 1
  }
];
