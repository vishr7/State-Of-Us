const censusUrl = new URL("https://api.census.gov/data/2024/acs/acs5");
censusUrl.search = new URLSearchParams({
  get: "NAME,B01003_001E,B19013_001E",
  for: "place:61000",
  in: "state:42",
}).toString();
const CENSUS_URL = censusUrl.toString();

export interface CityData {
  city: string;
  population: number;
  medianHouseholdIncome: number;
  source: {
    name: string;
    dataset: string;
    year: number;
    period: string;
    url: string;
    geography: { state: string; place: string };
    variables: { population: string; medianHouseholdIncome: string };
    units: { population: string; medianHouseholdIncome: string };
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

export async function getPittsburghCityData(): Promise<CityData> {
  const censusApiKey = process.env.CENSUS_API_KEY?.trim();
  if (!censusApiKey) {
    throw new Error("Missing CENSUS_API_KEY environment variable. Set it in .env.local.");
  }

  const requestUrl = new URL(CENSUS_URL);
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
    field("state") !== "42" ||
    field("place") !== "61000"
  ) {
    throw new Error("Census returned an unexpected city.");
  }

  return {
    city,
    population: parseEstimate(field("B01003_001E")),
    medianHouseholdIncome: parseEstimate(field("B19013_001E")),
    source: {
      name: "U.S. Census Bureau",
      dataset: "American Community Survey 5-Year Estimates",
      year: 2024,
      period: "2020–2024",
      url: CENSUS_URL,
      geography: { state: "42", place: "61000" },
      variables: {
        population: "B01003_001E",
        medianHouseholdIncome: "B19013_001E",
      },
      units: {
        population: "people",
        medianHouseholdIncome: "2024 inflation-adjusted USD",
      },
    },
  };
}
