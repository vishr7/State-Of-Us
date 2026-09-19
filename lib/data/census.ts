const CENSUS_URL = "https://api.census.gov/data/2024/acs/acs5";

export interface CityData {
  city: string;
  population: number;
  medianHouseholdIncome: number;
  unemploymentRate: number;
  medianGrossRent: number;
  medianHomeValue: number;
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
    };
    units: {
      population: string;
      medianHouseholdIncome: string;
      medianGrossRent: string;
      medianHomeValue: string;
    };
    unemploymentRate: {
      table: string;
      variables: { unemployed: string; civilianLaborForce: string };
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

export async function getCityData(state: string, place: string): Promise<CityData> {
  const censusApiKey = process.env.CENSUS_API_KEY?.trim();
  if (!censusApiKey) {
    throw new Error("Missing CENSUS_API_KEY environment variable. Set it in .env.local.");
  }

  const requestUrl = new URL(CENSUS_URL);
  requestUrl.search = new URLSearchParams({
    get: "NAME,B01003_001E,B19013_001E,B23025_003E,B23025_005E,B25064_001E,B25077_001E",
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

  return {
    city,
    population: parseEstimate(field("B01003_001E")),
    medianHouseholdIncome: parseEstimate(field("B19013_001E")),
    unemploymentRate: (unemployed / civilianLaborForce) * 100,
    medianGrossRent: parseEstimate(field("B25064_001E")),
    medianHomeValue: parseEstimate(field("B25077_001E")),
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
      },
      units: {
        population: "people",
        medianHouseholdIncome: "2024 inflation-adjusted USD",
        medianGrossRent: "2024 inflation-adjusted USD per month",
        medianHomeValue: "2024 inflation-adjusted USD",
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
    },
  };
}
