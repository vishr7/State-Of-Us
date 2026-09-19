import { getCityData } from "../../../lib/data/census";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state") ?? "42";
  const place = searchParams.get("place") ?? "61000";

  if (
    !/^[0-9]{2}$/.test(state) ||
    !/^[0-9]{5}$/.test(place) ||
    searchParams.getAll("state").length > 1 ||
    searchParams.getAll("place").length > 1
  ) {
    return Response.json(
      { error: "Provide state as exactly 2 digits and place as exactly 5 digits, with each parameter specified at most once." },
      { status: 400 },
    );
  }

  try {
    const data = await getCityData(state, place);
    return Response.json(data);
  } catch (error) {
    console.error("Unable to retrieve Census data:", error);
    return Response.json(
      { error: "Unable to retrieve city data from the Census API. Please try again later." },
      { status: 502 },
    );
  }
}
