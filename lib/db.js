import { Redis } from "@upstash/redis";
import { promises as fs } from "fs";
import path from "path";

// Almacenamiento: Upstash Redis (Vercel Marketplace) en producción,
// archivo JSON local (.data/db.json) en desarrollo.

export const COLLECTIONS = ["people", "subjects", "sessions", "goals"];

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const needsSetup = !redis && Boolean(process.env.VERCEL);

const KEY = (c) => `estudio:${c}`;
const FILE = path.join(process.cwd(), ".data", "db.json");

let writeQueue = Promise.resolve();

async function readFile() {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return { people: {}, subjects: {}, sessions: {}, goals: {} };
  }
}

function updateFile(fn) {
  writeQueue = writeQueue.then(async () => {
    const db = await readFile();
    fn(db);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(db, null, 2));
  });
  return writeQueue;
}

function assertReady() {
  if (needsSetup) {
    throw new Error(
      "Falta conectar la base de datos: agrega Upstash Redis desde Storage en tu proyecto de Vercel."
    );
  }
}

const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

async function list(collection) {
  if (redis) {
    const map = (await redis.hgetall(KEY(collection))) || {};
    return Object.values(map).map(parse);
  }
  const db = await readFile();
  return Object.values(db[collection] || {});
}

export async function getAll() {
  if (needsSetup) return { people: [], subjects: [], sessions: [], goals: [], needsSetup: true };
  const [people, subjects, sessions, goals] = await Promise.all(COLLECTIONS.map(list));
  const byCreated = (a, b) => a.createdAt.localeCompare(b.createdAt);
  return {
    people: people.sort(byCreated).map(({ passwordHash, ...p }) => p),
    subjects: subjects.sort(byCreated),
    sessions: sessions.sort((a, b) => b.date.localeCompare(a.date)),
    goals: goals.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  };
}

export async function get(collection, id) {
  if (!id) return null;
  if (redis) {
    const v = await redis.hget(KEY(collection), id);
    return v ? parse(v) : null;
  }
  const db = await readFile();
  return db[collection]?.[id] ?? null;
}

export const exists = async (collection, id) => Boolean(await get(collection, id));

// Índice usuario → id, para el login y para que no se repitan nombres de usuario.
export async function findUserId(username) {
  if (redis) return (await redis.hget(KEY("usernames"), username)) ?? null;
  const db = await readFile();
  return Object.values(db.people || {}).find((p) => p.username === username)?.id ?? null;
}

export async function claimUsername(username, id) {
  assertReady();
  if (redis) return Boolean(await redis.hsetnx(KEY("usernames"), username, id));
  return !(await findUserId(username));
}

export async function add(collection, item) {
  assertReady();
  if (redis) {
    await redis.hset(KEY(collection), { [item.id]: JSON.stringify(item) });
  } else {
    await updateFile((db) => {
      db[collection] = { ...db[collection], [item.id]: item };
    });
  }
  return item;
}

export async function update(collection, id, patch) {
  assertReady();
  const current = await get(collection, id);
  if (!current) return null;
  const item = { ...current, ...patch };
  if (redis) {
    await redis.hset(KEY(collection), { [id]: JSON.stringify(item) });
  } else {
    await updateFile((db) => {
      db[collection][id] = item;
    });
  }
  return item;
}

// Borrar una persona o ramo también borra lo que depende de él.
const DEPENDENTS = {
  people: [["sessions", "personId"]],
  subjects: [
    ["sessions", "subjectId"],
    ["goals", "subjectId"],
  ],
};

export async function remove(collection, id) {
  assertReady();
  const deps = DEPENDENTS[collection] || [];
  if (redis) {
    if (collection === "people") {
      const user = await get("people", id);
      if (user?.username) await redis.hdel(KEY("usernames"), user.username);
    }
    await redis.hdel(KEY(collection), id);
    for (const [dep, field] of deps) {
      const orphans = (await list(dep)).filter((x) => x[field] === id).map((x) => x.id);
      if (orphans.length) await redis.hdel(KEY(dep), ...orphans);
    }
  } else {
    await updateFile((db) => {
      delete db[collection]?.[id];
      for (const [dep, field] of deps) {
        for (const x of Object.values(db[dep] || {})) {
          if (x[field] === id) delete db[dep][x.id];
        }
      }
    });
  }
}
