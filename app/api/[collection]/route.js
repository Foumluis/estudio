import { add, exists, get, remove, update } from "@/lib/db";
import { currentUser, endSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Las personas se crean con /api/auth/register, no por aquí.
const WRITABLE = ["people", "subjects", "sessions", "goals"];

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function dailyGoal(v) {
  const n = Number(v);
  return n > 0 && n <= 24 ? n : null;
}

const GOAL_KINDS = ["prueba", "trabajo", "otro"];

async function build(collection, body, user) {
  const base = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), createdBy: user.id };

  if (collection === "goals") {
    const title = str(body.title, 120);
    if (!title) throw new HttpError("El título de la meta es obligatorio.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || "")) throw new HttpError("Falta la fecha.");
    if (!(await exists("subjects", body.subjectId))) throw new HttpError("Ramo no válido.");
    return {
      ...base,
      title,
      subjectId: body.subjectId,
      kind: GOAL_KINDS.includes(body.kind) ? body.kind : "prueba",
      dueDate: body.dueDate,
      done: false,
    };
  }

  if (collection === "subjects") {
    const name = str(body.name, 60);
    if (!name) throw new HttpError("El nombre del ramo es obligatorio.");
    const goal = Number(body.goalHours);
    const color = /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : "#6366f1";
    return { ...base, name, color, goalHours: goal > 0 && goal <= 10000 ? goal : null };
  }

  if (collection === "sessions") {
    const seconds = Math.round(Number(body.seconds));
    if (!(seconds >= 60 && seconds <= 24 * 3600)) {
      throw new HttpError("La sesión debe durar entre 1 minuto y 24 horas.");
    }
    const title = str(body.title, 120);
    if (!title) throw new HttpError("El título es obligatorio.");
    if (!(await exists("subjects", body.subjectId))) throw new HttpError("Ramo no válido.");
    // Cada persona solo registra sus propias horas.
    return {
      ...base,
      personId: user.id,
      subjectId: body.subjectId,
      seconds,
      title,
      notes: str(body.notes, 5000),
      date: base.createdAt,
    };
  }

  throw new HttpError("Para agregar personas, cada una crea su cuenta.");
}

// ¿Puede este usuario borrar este elemento?
function canDelete(collection, item, user) {
  if (collection === "people") return item.id === user.id;
  if (collection === "sessions") return item.personId === user.id;
  return !item.createdBy || item.createdBy === user.id;
}

async function sessionPatch(body) {
  const patch = {};
  if ("seconds" in body) {
    const seconds = Math.round(Number(body.seconds));
    if (!(seconds >= 60 && seconds <= 24 * 3600)) {
      throw new HttpError("La sesión debe durar entre 1 minuto y 24 horas.");
    }
    patch.seconds = seconds;
  }
  if ("title" in body) {
    patch.title = str(body.title, 120);
    if (!patch.title) throw new HttpError("El título es obligatorio.");
  }
  if ("notes" in body) patch.notes = str(body.notes, 5000);
  if ("subjectId" in body) {
    if (!(await exists("subjects", body.subjectId))) throw new HttpError("Ramo no válido.");
    patch.subjectId = body.subjectId;
  }
  if (!Object.keys(patch).length) throw new HttpError("Nada que actualizar.");
  return { ...patch, editedAt: new Date().toISOString() };
}

// Campos editables después de crear.
function patchFor(collection, item, body, user) {
  if (collection === "people" && "dailyGoalHours" in body) {
    if (item.id !== user.id) throw new HttpError("Solo puedes cambiar tu propio mínimo.", 403);
    return { dailyGoalHours: dailyGoal(body.dailyGoalHours) };
  }
  if (collection === "goals" && "done" in body) return { done: Boolean(body.done) };
  if (collection === "sessions") {
    if (item.personId !== user.id) throw new HttpError("Solo puedes editar tus propias sesiones.", 403);
    return sessionPatch(body);
  }
  throw new HttpError("Nada que actualizar.");
}

async function handle(params, fn) {
  const { collection } = await params;
  if (!WRITABLE.includes(collection)) {
    return Response.json({ error: "No encontrado." }, { status: 404 });
  }
  try {
    const user = await currentUser();
    if (!user) throw new HttpError("Inicia sesión.", 401);
    return Response.json((await fn(collection, user)) ?? { ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

async function findTarget(req, collection) {
  const id = new URL(req.url).searchParams.get("id");
  const item = await get(collection, id);
  if (!item) throw new HttpError("No existe.", 404);
  return item;
}

export async function POST(req, { params }) {
  return handle(params, async (collection, user) => {
    const body = await req.json().catch(() => ({}));
    return add(collection, await build(collection, body, user));
  });
}

export async function PATCH(req, { params }) {
  return handle(params, async (collection, user) => {
    const item = await findTarget(req, collection);
    const body = await req.json().catch(() => ({}));
    return update(collection, item.id, await patchFor(collection, item, body, user));
  });
}

export async function DELETE(req, { params }) {
  return handle(params, async (collection, user) => {
    const item = await findTarget(req, collection);
    if (!canDelete(collection, item, user)) {
      throw new HttpError("Solo quien lo creó puede eliminarlo.", 403);
    }
    await remove(collection, item.id);
    if (collection === "people") await endSession();
  });
}
