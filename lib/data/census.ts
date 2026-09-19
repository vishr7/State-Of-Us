const CENSUS_URL = "https://api.census.gov/data/2024/acs/acs5";

interface RateSource {
  table: string;
  variables: { numerator: string; denominator: string };
  calculation: string;
  unit: string;
  population: string;
}

export interface CityData {
  city: string;
  population: number;
  medianHouseholdIncome: number;
  unemploymentRate: number;
  medianGrossRent: number;
  medianHomeValue: number;
  povertyRate: number;
  rentBurdenRate: number;
  perCapitaIncome: number;
  laborForceParticipationRate: number;
  homeownershipRate: number;
  vacancyRate: number;
  meanCommuteTime: number;
  publicTransitShare: number;
  averageHouseholdSize: number;
  source: {
    name: string;
    dataset: string;
    year: number;
    period: string;
    url: string;
    geography: { state: string; place: string };
    variables: {
      population: string;
      medianHouseholdIncome: string;
      medianGrossRent: string;
      medianHomeValue: string;
      perCapitaIncome: string;
      averageHouseholdSize: string;
    };
    units: {
      population: string;
      medianHouseholdIncome: string;
      medianGrossRent: string;
      medianHomeValue: string;
      perCapitaIncome: string;
      averageHouseholdSize: string;
    };
    laborForceParticipationRate: RateSource;
    homeownershipRate: RateSource;
    vacancyRate: RateSource;
    publicTransitShare: RateSource;
    meanCommuteTime: {
      table: string;
      variable: string;
      dataset: string;
      url: string;
      unit: string;
      population: string;
    };
    unemploymentRate: {
      table: string;
      variables: { unemployed: string; civilianLaborForce: string };
      calculation: string;
      unit: string;
      population: string;
    };
    povertyRate: {
      table: string;
      variables: { belowPoverty: string; povertyUniverse: string };
      calculation: string;
      unit: string;
      population: string;
    };
    rentBurdenRate: {
      table: string;
      variables: {
        total: string;
        notComputed: string;
        rent30To34_9: string;
        rent35To39_9: string;
        rent40To49_9: string;
        rent50OrMore: string;
      };
      calculation: string;
      unit: string;
      population: string;
    };
  };
}

function parseEstimate(value: unknown): number {
  // Census missing/suppressed estimates can be null or negative sentinel values.
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("Census returned a missing or invalid estimate.");
  }

  const estimate = Number(value);
  if (!Number.isSafeInteger(estimate)) {
    throw new Error("Census returned an invalid numeric estimate.");
  }
  return estimate;
}

function parseDecimalEstimate(value: unknown): number {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) {
    throw new Error("Census returned a missing or invalid decimal estimate.");
  }
  const estimate = Number(value);
  if (!Number.isFinite(estimate) || estimate > Number.MAX_SAFE_INTEGER) {
    throw new Error("Census returned an invalid numeric estimate.");
  }
  return estimate;
}

function calculateRate(numerator: number, denominator: number, name: string): number {
  if (denominator <= 0 || numerator > denominator) {
    throw new Error(`Cannot calculate Census ${name}: invalid numerator or denominator.`);
  }
  return (numerator / denominator) * 100;
}

export async function getCityData(state: string, place: string): Promise<CityData> {
  const censusApiKey = process.env.CENSUS_API_KEY?.trim();
  if (!censusApiKey) {
    throw new Error("Missing CENSUS_API_KEY environment variable. Set it in .env.local.");
  }

  const requestUrl = new URL(CENSUS_URL);
  requestUrl.search = new URLSearchParams({
    get: "NAME,B01003_001E,B19013_001E,B23025_003E,B23025_005E,B25064_001E,B25077_001E,B17001_001E,B17001_002E,B25070_001E,B25070_007E,B25070_008E,B25070_009E,B25070_010E,B25070_011E,B19301_001E,B23025_001E,B23025_002E,B25003_001E,B25003_002E,B25002_001E,B25002_003E,B08301_001E,B08301_010E,B25010_001E",
    for: `place:${place}`,
    in: `state:${state}`,
  }).toString();
  const sourceUrl = requestUrl.toString();
  requestUrl.searchParams.set("key", censusApiKey);

  // Upstream error pages may echo the request URL, including its credentials.
  const redactKey = (text: string) =>
    text.split(censusApiKey).join("[REDACTED]")
      .split(encodeURIComponent(censusApiKey)).join("[REDACTED]");

  const response = await fetch(requestUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    // Do not propagate a transport error that might contain the authenticated URL.
    throw new Error("Census request failed or timed out.");
  });

  if (!response.ok) {
    console.error("Census request failed:", response.status, redactKey(await response.text()));
    throw new Error(`Census request failed with status ${response.status}.`);
  }

  if (!response.headers.get("content-type")?.includes("application/json")) {
    console.error("Census returned non-JSON:", response.status, redactKey(await response.text()));
    throw new Error("Census returned a non-JSON response.");
  }

  const data: unknown = await response.json();
  if (
    !Array.isArray(data) ||
    data.length !== 2 ||
    !Array.isArray(data[0]) ||
    !Array.isArray(data[1])
  ) {
    throw new Error("Census returned an unexpected response format.");
  }

  const headers: unknown[] = data[0];
  const row: unknown[] = data[1];
  const field = (name: string): unknown => row[headers.indexOf(name)];
  const city = field("NAME");

  if (
    typeof city !== "string" ||
    !city.trim() ||
    field("state") !== state ||
    field("place") !== place
  ) {
    throw new Error("Census returned an unexpected city.");
  }

  const civilianLaborForce = parseEstimate(field("B23025_003E"));
  const unemployed = parseEstimate(field("B23025_005E"));
  if (civilianLaborForce === 0 || unemployed > civilianLaborForce) {
    throw new Error("Cannot calculate Census unemployment rate: invalid civilian labor force or unemployed count.");
  }

  const povertyUniverse = parseEstimate(field("B17001_001E"));
  const belowPoverty = parseEstimate(field("B17001_002E"));
  if (povertyUniverse === 0 || belowPoverty > povertyUniverse) {
    throw new Error("Cannot calculate Census poverty rate: invalid poverty universe or below-poverty count.");
  }

  const renterTotal = parseEstimate(field("B25070_001E"));
  const rentNotComputed = parseEstimate(field("B25070_011E"));
  const rentBurdened =
    parseEstimate(field("B25070_007E")) + // 30.0–34.9%
    parseEstimate(field("B25070_008E")) + // 35.0–39.9%
    parseEstimate(field("B25070_009E")) + // 40.0–49.9%
    parseEstimate(field("B25070_010E"));  // 50.0% or more
  const rentComputed = renterTotal - rentNotComputed;
  if (rentComputed <= 0 || !Number.isSafeInteger(rentBurdened) || rentBurdened > rentComputed) {
    throw new Error("Cannot calculate Census rent burden rate: invalid computed-rent universe or burdened count.");
  }

  const laborForceParticipationRate = calculateRate(
    parseEstimate(field("B23025_002E")), parseEstimate(field("B23025_001E")), "labor force participation rate",
  );
  const homeownershipRate = calculateRate(
    parseEstimate(field("B25003_002E")), parseEstimate(field("B25003_001E")), "homeownership rate",
  );
  const vacancyRate = calculateRate(
    parseEstimate(field("B25002_003E")), parseEstimate(field("B25002_001E")), "vacancy rate",
  );
  const publicTransitShare = calculateRate(
    parseEstimate(field("B08301_010E")), parseEstimate(field("B08301_001E")), "public transit share",
  );

  // The published mean is in ACS Data Profiles, not the detailed tables above.
  const profileUrl = new URL(`${CENSUS_URL}/profile`);
  profileUrl.search = new URLSearchParams({
    get: "DP03_0025E",
    for: `place:${place}`,
    in: `state:${state}`,
  }).toString();
  const profileSourceUrl = profileUrl.toString();
  profileUrl.searchParams.set("key", censusApiKey);
  const profileResponse = await fetch(profileUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new Error("Census commute-time request failed or timed out.");
  });
  if (!profileResponse.ok) {
    console.error("Census commute-time request failed:", profileResponse.status, redactKey(await profileResponse.text()));
    throw new Error(`Census commute-time request failed with status ${profileResponse.status}.`);
  }
  if (!profileResponse.headers.get("content-type")?.includes("application/json")) {
    console.error("Census commute-time response was non-JSON:", profileResponse.status, redactKey(await profileResponse.text()));
    throw new Error("Census returned a non-JSON commute-time response.");
  }
  const profileData: unknown = await profileResponse.json();
  if (!Array.isArray(profileData) || profileData.length !== 2 ||
      !Array.isArray(profileData[0]) || !Array.isArray(profileData[1])) {
    throw new Error("Census returned an unexpected commute-time response format.");
  }
  const profileHeaders: unknown[] = profileData[0];
  const profileRow: unknown[] = profileData[1];
  const profileField = (name: string): unknown => profileRow[profileHeaders.indexOf(name)];
  if (profileField("state") !== state || profileField("place") !== place) {
    throw new Error("Census returned an unexpected commute-time geography.");
  }
  const meanCommuteTime = parseDecimalEstimate(profileField("DP03_0025E"));

  return {
    city,
    population: parseEstimate(field("B01003_001E")),
    medianHouseholdIncome: parseEstimate(field("B19013_001E")),
    unemploymentRate: (unemployed / civilianLaborForce) * 100,
    medianGrossRent: parseEstimate(field("B25064_001E")),
    medianHomeValue: parseEstimate(field("B25077_001E")),
    povertyRate: (belowPoverty / povertyUniverse) * 100,
    rentBurdenRate: (rentBurdened / rentComputed) * 100,
    perCapitaIncome: parseEstimate(field("B19301_001E")),
    laborForceParticipationRate,
    homeownershipRate,
    vacancyRate,
    meanCommuteTime,
    publicTransitShare,
    averageHouseholdSize: parseDecimalEstimate(field("B25010_001E")),
    source: {
      name: "U.S. Census Bureau",
      dataset: "American Community Survey 5-Year Estimates",
      year: 2024,
      period: "2020–2024",
      url: sourceUrl,
      geography: { state, place },
      variables: {
        population: "B01003_001E",
        medianHouseholdIncome: "B19013_001E",
        medianGrossRent: "B25064_001E",
        medianHomeValue: "B25077_001E",
        perCapitaIncome: "B19301_001E",
        averageHouseholdSize: "B25010_001E",
      },
      units: {
        population: "people",
        medianHouseholdIncome: "2024 inflation-adjusted USD",
        medianGrossRent: "2024 inflation-adjusted USD per month",
        medianHomeValue: "2024 inflation-adjusted USD",
        perCapitaIncome: "2024 inflation-adjusted USD",
        averageHouseholdSize: "persons per occupied housing unit",
      },
      laborForceParticipationRate: {
        table: "B23025",
        variables: { numerator: "B23025_002E", denominator: "B23025_001E" },
        calculation: "numerator / denominator * 100",
        unit: "percent",
        population: "Population aged 16 years and over; labor force includes Armed Forces",
      },
      homeownershipRate: {
        table: "B25003",
        variables: { numerator: "B25003_002E", denominator: "B25003_001E" },
        calculation: "numerator / denominator * 100",
        unit: "percent",
        population: "Occupied housing units; numerator is owner-occupied units",
      },
      vacancyRate: {
        table: "B25002",
        variables: { numerator: "B25002_003E", denominator: "B25002_001E" },
        calculation: "numerator / denominator * 100",
        unit: "percent",
        population: "All housing units; numerator is vacant units",
      },
      publicTransitShare: {
        table: "B08301",
        variables: { numerator: "B08301_010E", denominator: "B08301_001E" },
        calculation: "numerator / denominator * 100",
        unit: "percent",
        population: "Workers aged 16 years and over, including home workers; numerator uses public transportation excluding taxicabs",
      },
      meanCommuteTime: {
        table: "DP03",
        variable: "DP03_0025E",
        dataset: "2024 American Community Survey 5-Year Data Profiles",
        url: profileSourceUrl,
        unit: "minutes",
        population: "Workers aged 16 years and over who did not work from home",
      },
      unemploymentRate: {
        table: "B23025",
        variables: {
          unemployed: "B23025_005E",
          civilianLaborForce: "B23025_003E",
        },
        calculation: "unemployed / civilianLaborForce * 100",
        unit: "percent",
        population: "Civilian labor force aged 16 years and over",
      },
      povertyRate: {
        table: "B17001",
        variables: {
          belowPoverty: "B17001_002E",
          povertyUniverse: "B17001_001E",
        },
        calculation: "belowPoverty / povertyUniverse * 100",
        unit: "percent",
        population: "Population for whom poverty status is determined",
      },
      rentBurdenRate: {
        table: "B25070",
        variables: {
          total: "B25070_001E",
          notComputed: "B25070_011E",
          rent30To34_9: "B25070_007E",
          rent35To39_9: "B25070_008E",
          rent40To49_9: "B25070_009E",
          rent50OrMore: "B25070_010E",
        },
        calculation: "(rent30To34_9 + rent35To39_9 + rent40To49_9 + rent50OrMore) / (total - notComputed) * 100",
        unit: "percent",
        population: "Renter-occupied housing units paying cash rent with a computed gross-rent-to-household-income ratio; excludes not computed",
      },
    },
  };
}
