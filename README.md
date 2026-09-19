# State of Us

Minimal Next.js + TypeScript API-only backend for retrieving Pittsburgh population and median household income from the U.S. Census Bureau.

## Run locally

Install Node.js 22 LTS or a newer supported LTS release (including npm), then run from this directory:

```sh
npm install
npm run dev
```

The first install generates `package-lock.json`; commit it to share dependency versions with the team.

Open http://localhost:3000/api/city-data or check it in PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/api/city-data | ConvertTo-Json -Depth 5
```

## Endpoint and data source

`GET /api/city-data` always retrieves Pittsburgh city, Pennsylvania (state FIPS `42`, place FIPS `61000`). No parameters are required.

On success, HTTP 200 JSON contains:

- `city`: the Census geographic name.
- `population`: a numeric population estimate in people (`B01003_001E`).
- `medianHouseholdIncome`: a numeric income estimate in 2024 inflation-adjusted U.S. dollars (`B19013_001E`).
- `source`: the Census Bureau name, dataset, year, observation period, request URL, geographic identifiers, variable codes, and units.

Both metrics come from the **2024 American Community Survey (ACS) 5-Year Estimates**, covering **2020–2024**. These are survey estimates for the city proper, not the Pittsburgh metro area or live counts.

[Census dataset documentation](https://www.census.gov/data/developers/data-sets/acs-5year.html)

[Direct Census API request](https://api.census.gov/data/2024/acs/acs5?get=NAME,B01003_001E,B19013_001E&for=place:61000&in=state:42)

Each request fetches real Census data without caching and has a 10-second upstream timeout. Network failures, non-success Census responses, malformed data, and missing or suppressed estimates return HTTP 502:

```json
{"error":"Unable to retrieve city data from the Census API. Please try again later."}
```

No mock values are substituted on failure. Error details are logged on the server.

## Project structure

- `app/api/city-data/route.ts`: HTTP response and error handling.
- `lib/data/census.ts`: Census request, response validation, numeric conversion, and source metadata.
- `package.json`, `tsconfig.json`, and `next-env.d.ts`: Next.js and TypeScript setup.

There is no frontend or homepage; `/` returns 404. The placeholder `/api/health` route has been removed.
The Census request uses public access without an API key; no environment variables are required for this initial version. Internet access to `api.census.gov` is required.

## Production build

```sh
npm run build
npm start
```

Dependencies have not been installed and the application has not been run in the authoring environment because Node.js/npm are unavailable. Run the commands above locally to verify the build and endpoint.
