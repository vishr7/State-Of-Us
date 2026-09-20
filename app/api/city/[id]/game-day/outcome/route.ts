import { z } from "zod";
import { readGameDayOutcome } from "../../../../../../database/gameplay/resolveGameDay";
import { GameplayError } from "../../../../../../database/gameplay/contracts";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; z.uuid().parse(id);
    const turn = z.coerce.number().int().nonnegative().parse(new URL(request.url).searchParams.get("turn") ?? NaN);
    return Response.json(await readGameDayOutcome(id, turn));
  } catch (error) {
    return Response.json({ error: error instanceof GameplayError ? error.message : "Invalid outcome request or server configuration." }, { status: error instanceof GameplayError ? error.status : error instanceof z.ZodError ? 400 : 500 });
  }
}
