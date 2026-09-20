import { z } from "zod";
import { prepareGameDay, getGameDay } from "../../../../../database/gameplay/prepareGameDay";
import { GameplayError } from "../../../../../database/gameplay/contracts";

export const runtime = "nodejs";
export const maxDuration = 300;
const input = z.object({ turn: z.number().int().nonnegative(), retry: z.boolean().optional() }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; z.uuid().parse(id);
    const { turn, retry } = input.parse(await request.json());
    return Response.json(await prepareGameDay(id, turn, { retryFailed: retry }));
  } catch (error) { return failure(error); }
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; z.uuid().parse(id);
    const turn = z.coerce.number().int().nonnegative().parse(new URL(request.url).searchParams.get("turn") ?? NaN);
    return Response.json(await getGameDay(id, turn));
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  return Response.json({ error: error instanceof GameplayError ? error.message : "Invalid game-day request or server configuration." }, { status: error instanceof GameplayError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500 });
}
