import { getAll, needsSetup } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!needsSetup && !(await currentUser())) {
      return Response.json({ error: "Inicia sesión." }, { status: 401 });
    }
    return Response.json(await getAll());
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
