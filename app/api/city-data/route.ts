import { getPittsburghCityData } from "../../../lib/data/census";

export async function GET() {
  try {
    const data = await getPittsburghCityData();
    return Response.json(data);
  } catch (error) {
    console.error("Unable to retrieve Pittsburgh Census data:", error);
    return Response.json(
      { error: "Unable to retrieve city data from the Census API. Please try again later." },
      { status: 502 },
    );
  }
}
