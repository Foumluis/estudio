import { add, claimUsername, findUserId, get, needsSetup } from "@/lib/db";
import { currentUser, endSession, hashPassword, publicUser, startSession, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const fail = (error, status = 400) => Response.json({ error }, { status });

export async function GET(req, { params }) {
  const { action } = await params;
  if (action !== "me") return fail("No encontrado.", 404);
  if (needsSetup) return Response.json({ user: null, needsSetup: true });
  try {
    const user = await currentUser();
    return Response.json({ user: user ? publicUser(user) : null });
  } catch (e) {
    return fail(e.message, 500);
  }
}

export async function POST(req, { params }) {
  const { action } = await params;
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  try {
    if (action === "logout") {
      await endSession();
      return Response.json({ ok: true });
    }

    if (action === "login") {
      const id = await findUserId(username);
      const user = id && (await get("people", id));
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return fail("Usuario o contraseña incorrectos.", 401);
      }
      await startSession(user.id);
      return Response.json({ user: publicUser(user) });
    }

    if (action === "register") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
      if (!name) return fail("El nombre es obligatorio.");
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        return fail("El usuario debe tener 3 a 30 caracteres: letras, números, punto, guion o guion bajo.");
      }
      if (password.length < 6 || password.length > 200) {
        return fail("La contraseña debe tener al menos 6 caracteres.");
      }
      const goal = Number(body.dailyGoalHours);
      const user = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        name,
        username,
        passwordHash: hashPassword(password),
        dailyGoalHours: goal > 0 && goal <= 24 ? goal : null,
      };
      if (!(await claimUsername(username, user.id))) return fail("Ese usuario ya existe.");
      await add("people", user);
      await startSession(user.id);
      return Response.json({ user: publicUser(user) });
    }

    return fail("No encontrado.", 404);
  } catch (e) {
    return fail(e.message, 500);
  }
}
