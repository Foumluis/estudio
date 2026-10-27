"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"];
const TIMER_KEY = "estudio.timer";
const EMPTY_TIMER = { personId: "", subjectId: "", startedAt: null, accumulated: 0 };
const DAY = 86400000;
const KIND_LABEL = { prueba: "Prueba", trabajo: "Trabajo", otro: "Otro" };

// ---------- utilidades ----------

function fmtClock(total) {
  const s = Math.floor(total);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function fmtDur(seconds) {
  const min = Math.round(seconds / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const fmtHours = (seconds) => (seconds / 3600).toLocaleString("es-CL", { maximumFractionDigits: 1 });

const dateFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat("es-CL", { weekday: "narrow" });

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Días entre hoy y una fecha "YYYY-MM-DD" (negativo si ya pasó).
function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - startOfDay(Date.now())) / DAY);
}

function dueLabel(days) {
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days < 0) return `Hace ${-days} ${days === -1 ? "día" : "días"}`;
  return `En ${days} días`;
}

function secondsByDay(sessions, personId) {
  const map = {};
  for (const s of sessions) {
    if (s.personId !== personId) continue;
    const k = dayKey(s.date);
    map[k] = (map[k] || 0) + s.seconds;
  }
  return map;
}

// Días seguidos cumpliendo el mínimo (hoy cuenta solo si ya se cumplió).
function streakFor(byDay, minSecs) {
  let n = 0;
  let d = startOfDay(Date.now());
  if ((byDay[dayKey(d)] || 0) < minSecs) d -= DAY;
  while ((byDay[dayKey(d)] || 0) >= minSecs) {
    n++;
    d -= DAY;
  }
  return n;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || "Algo salió mal."), { status: res.status });
  return json;
}

function readTimer() {
  try {
    return { ...EMPTY_TIMER, ...JSON.parse(localStorage.getItem(TIMER_KEY)) };
  } catch {
    return EMPTY_TIMER;
  }
}

function saveTimer(t) {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(t));
  } catch {}
}

// ---------- página ----------

export default function Home() {
  const [me, setMe] = useState(undefined); // undefined = verificando, null = sin sesión
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    api("/api/auth/me")
      .then((r) => {
        setMe(r.user);
        setSetupNeeded(Boolean(r.needsSetup));
      })
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return <p className="muted center boot">Cargando…</p>;
  if (!me) return <AuthScreen onAuth={setMe} needsSetup={setupNeeded} />;
  return <App me={me} setMe={setMe} />;
}

function App({ me, setMe }) {
  const [data, setData] = useState({ people: [], subjects: [], sessions: [], goals: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("panel");
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);

  const notify = useCallback((msg, kind = "error") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await api("/api/data"));
    } catch (e) {
      if (e.status === 401) return setMe(null);
      notify(e.message);
    } finally {
      setLoading(false);
    }
  }, [notify, setMe]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  const mutate = useCallback(
    async (path, options, okMsg) => {
      try {
        await api(path, options);
        await load();
        if (okMsg) notify(okMsg, "ok");
        return true;
      } catch (e) {
        notify(e.message);
        return false;
      }
    },
    [load, notify]
  );

  const totalSeconds = data.sessions.reduce((a, s) => a + s.seconds, 0);
  // Los datos del usuario actual (por ejemplo su mínimo) vienen de /api/data cuando están.
  const self = data.people.find((p) => p.id === me.id) || me;

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setMe(null);
  };

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◷
          </span>
          <div>
            <h1>Horas de estudio</h1>
            <p className="muted">{fmtHours(totalSeconds)} h registradas en total</p>
          </div>
        </div>
        <div className="user-menu">
          <div className="avatar sm">{self.name.slice(0, 1).toUpperCase()}</div>
          <span className="small">{self.name}</span>
          <button className="btn ghost small-btn" onClick={logout}>
            Salir
          </button>
        </div>
        <nav className="tabs">
          {[
            ["panel", "Panel"],
            ["goals", "Metas"],
            ["log", "Bitácora"],
            ["setup", "Ramos y cuenta"],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {data.needsSetup && (
        <div className="banner">
          Falta conectar la base de datos. En Vercel ve a <b>Storage → Upstash for Redis</b>, conéctala al
          proyecto y vuelve a desplegar.
        </div>
      )}

      {loading ? (
        <p className="muted center">Cargando…</p>
      ) : (
        <main>
          {tab === "panel" && (
            <>
              <Timer data={data} me={self} onStop={(s) => setModal({ ...s, mode: "timer" })} />
              <Upcoming data={data} goGoals={() => setTab("goals")} />
              <Progress data={data} me={self} onManual={() => setModal({ mode: "manual" })} goSetup={() => setTab("setup")} />
            </>
          )}
          {tab === "goals" && <Goals data={data} me={self} mutate={mutate} />}
          {tab === "log" && (
            <Log data={data} me={self} mutate={mutate} onEdit={(s) => setModal({ ...s, mode: "edit" })} />
          )}
          {tab === "setup" && <Setup data={data} me={self} mutate={mutate} onLeave={() => setMe(null)} />}
        </main>
      )}

      {modal && (
        <SessionModal
          data={data}
          me={self}
          initial={modal}
          onClose={() => setModal(null)}
          onSave={async (session) => {
            const ok =
              modal.mode === "edit"
                ? await mutate(`/api/sessions?id=${modal.id}`, { method: "PATCH", body: session }, "Sesión actualizada ✓")
                : await mutate("/api/sessions", { method: "POST", body: session }, "Sesión guardada ✓");
            if (ok) {
              if (modal.mode === "timer") {
                const t = readTimer();
                saveTimer({ ...EMPTY_TIMER, subjectId: t.subjectId });
                window.dispatchEvent(new Event("timer-reset"));
              }
              setModal(null);
            }
          }}
        />
      )}

      {!loading && <Punishment data={data} me={self} />}

      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

// ---------- cronómetro ----------

function Timer({ data, me, onStop }) {
  const [timer, setTimer] = useState(EMPTY_TIMER);
  const [, tick] = useState(0);

  useEffect(() => {
    const sync = () => setTimer(readTimer());
    sync();
    window.addEventListener("timer-reset", sync);
    return () => window.removeEventListener("timer-reset", sync);
  }, []);

  const running = timer.startedAt != null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const update = (patch) => {
    const next = { ...timer, ...patch };
    setTimer(next);
    saveTimer(next);
  };

  const elapsed = timer.accumulated + (running ? (Date.now() - timer.startedAt) / 1000 : 0);
  const started = running || timer.accumulated > 0;
  const ready = data.subjects.some((s) => s.id === timer.subjectId);
  const subject = data.subjects.find((s) => s.id === timer.subjectId);

  const pause = () => update({ startedAt: null, accumulated: elapsed });
  const stop = () => {
    pause();
    onStop({ subjectId: timer.subjectId, seconds: Math.round(elapsed) });
  };

  return (
    <section className={`card timer ${running ? "is-running" : ""}`} style={{ "--accent": subject?.color }}>
      <div className="timer-selects">
        <label>
          <span>Ramo</span>
          <select value={timer.subjectId} disabled={started} onChange={(e) => update({ subjectId: e.target.value })}>
            <option value="">Elige…</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="clock" aria-live="off">
        {fmtClock(elapsed)}
      </div>
      <p className="muted center status">
        {running ? "Estudiando…" : started ? "En pausa" : ready ? `Listo, ${me.name.split(" ")[0]}` : "Elige un ramo para empezar"}
      </p>

      <div className="timer-actions">
        {!started && (
          <button className="btn primary big" disabled={!ready} onClick={() => update({ startedAt: Date.now() })}>
            ▶ Iniciar
          </button>
        )}
        {started && (
          <>
            {running ? (
              <button className="btn big" onClick={pause}>
                ❚❚ Pausar
              </button>
            ) : (
              <button className="btn big" onClick={() => update({ startedAt: Date.now() })}>
                ▶ Reanudar
              </button>
            )}
            <button className="btn primary big" onClick={stop}>
              ■ Detener y guardar
            </button>
            {!running && (
              <button
                className="btn ghost"
                onClick={() => confirm("¿Descartar este tiempo?") && update({ startedAt: null, accumulated: 0 })}
              >
                Descartar
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ---------- progreso ----------

function Progress({ data, me, onManual, goSetup }) {
  const { subjects, sessions } = data;
  // Tu tarjeta primero.
  const people = [...data.people].sort((a, b) => (b.id === me.id) - (a.id === me.id));
  const subjectById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s])), [subjects]);

  const days = useMemo(() => {
    const today = startOfDay(Date.now());
    return Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY);
  }, []);

  if (!subjects.length) {
    return (
      <section className="card empty">
        <h2>Empieza aquí</h2>
        <p className="muted">Agrega al menos un ramo para comenzar a registrar horas.</p>
        <button className="btn primary" onClick={goSetup}>
          Agregar ramos
        </button>
      </section>
    );
  }

  return (
    <>
      <div className="section-head">
        <h2>Progreso por persona</h2>
        <button className="btn ghost" onClick={onManual}>
          + Registrar manualmente
        </button>
      </div>
      <div className="grid">
        {people.map((p) => {
          const mine = sessions.filter((s) => s.personId === p.id);
          const total = mine.reduce((a, s) => a + s.seconds, 0);
          const byDay = secondsByDay(sessions, p.id);
          const perDay = days.map((d) => byDay[dayKey(d)] || 0);
          const week = perDay.reduce((a, b) => a + b, 0);
          const minSecs = (p.dailyGoalHours || 0) * 3600;
          const maxDay = Math.max(...perDay, minSecs, 1);
          const today = perDay[6];
          const createdDay = startOfDay(p.createdAt);
          const dayState = (secs, i) => {
            if (!minSecs) return "";
            if (secs >= minSecs) return "met";
            if (i === 6 || days[i] < createdDay) return "";
            return "missed";
          };
          const bySubject = subjects
            .map((s) => ({
              s,
              secs: mine.filter((x) => x.subjectId === s.id).reduce((a, x) => a + x.seconds, 0),
            }))
            .filter((r) => r.secs > 0 || r.s.goalHours)
            .sort((a, b) => b.secs - a.secs);
          const last = mine[0];

          return (
            <article key={p.id} className={`card person ${p.id === me.id ? "is-me" : ""}`}>
              <header>
                <div className="avatar">{p.name.slice(0, 1).toUpperCase()}</div>
                <div className="grow">
                  <h3>
                    {p.name} {p.id === me.id && <span className="you">tú</span>}
                  </h3>
                  <p className="muted small">
                    {last ? `Última sesión: ${subjectById[last.subjectId]?.name ?? "—"}` : "Sin sesiones aún"}
                  </p>
                </div>
                <div className="stat">
                  <b>{fmtHours(total)}</b>
                  <span>horas</span>
                </div>
              </header>

              {minSecs > 0 && (
                <div className={`today ${today >= minSecs ? "done" : ""}`}>
                  <div className="bar-label">
                    <span>{today >= minSecs ? "✓ Mínimo de hoy cumplido" : "Mínimo de hoy"}</span>
                    <span className="muted">
                      {fmtDur(today)} / {p.dailyGoalHours} h
                    </span>
                  </div>
                  <div className="track">
                    <div className="fill today-fill" style={{ width: `${Math.min((today / minSecs) * 100, 100)}%` }} />
                  </div>
                </div>
              )}

              <div className="week">
                <div className="week-bars" style={{ "--min": minSecs ? `${(minSecs / maxDay) * 100}%` : null }}>
                  {minSecs > 0 && <div className="min-line" title={`Mínimo: ${p.dailyGoalHours} h`} />}
                  {perDay.map((secs, i) => (
                    <div
                      key={i}
                      className={`day-bar ${dayState(secs, i)}`}
                      title={fmtDur(secs)}
                      style={{ height: `${Math.max((secs / maxDay) * 100, secs ? 8 : 3)}%` }}
                    />
                  ))}
                </div>
                <div className="week-days">
                  {days.map((d) => (
                    <span key={d}>{dayFmt.format(d)}</span>
                  ))}
                </div>
                <p className="muted small week-foot">
                  <span>Últimos 7 días: {fmtDur(week)}</span>
                  {minSecs > 0 && <span>🔥 {streakFor(byDay, minSecs)} días seguidos</span>}
                </p>
              </div>

              <ul className="bars">
                {bySubject.map(({ s, secs }) => {
                  const pct = s.goalHours ? (secs / 3600 / s.goalHours) * 100 : total ? (secs / total) * 100 : 0;
                  return (
                    <li key={s.id}>
                      <div className="bar-label">
                        <span>
                          <i className="dot" style={{ background: s.color }} />
                          {s.name}
                        </span>
                        <span className="muted">
                          {fmtHours(secs)} h{s.goalHours ? ` / ${s.goalHours} h` : ""}
                        </span>
                      </div>
                      <div className="track">
                        <div className="fill" style={{ width: `${Math.min(pct, 100)}%`, background: s.color }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>

      <div className="section-head">
        <h2>Ramos</h2>
      </div>
      <div className="grid subjects">
        {subjects.map((s) => {
          const mine = sessions.filter((x) => x.subjectId === s.id);
          const total = mine.reduce((a, x) => a + x.seconds, 0);
          const contributions = people
            .map((p) => ({
              p,
              secs: mine.filter((x) => x.personId === p.id).reduce((a, x) => a + x.seconds, 0),
            }))
            .filter((r) => r.secs > 0)
            .sort((a, b) => b.secs - a.secs);
          return (
            <article key={s.id} className="card subject" style={{ "--accent": s.color }}>
              <h3>{s.name}</h3>
              <p className="big-num">
                {fmtHours(total)} <small>h</small>
              </p>
              <p className="muted small">
                {mine.length} {mine.length === 1 ? "sesión" : "sesiones"}
                {s.goalHours ? ` · meta ${s.goalHours} h por persona` : ""}
              </p>
              {contributions.length > 0 && (
                <ul className="mini">
                  {contributions.slice(0, 4).map(({ p, secs }) => (
                    <li key={p.id}>
                      <span>{p.name}</span>
                      <span className="muted">{fmtDur(secs)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

// ---------- bitácora ----------

function Log({ data, me, mutate, onEdit }) {
  const [person, setPerson] = useState("");
  const [subject, setSubject] = useState("");
  const [open, setOpen] = useState(null);
  const personById = Object.fromEntries(data.people.map((p) => [p.id, p]));
  const subjectById = Object.fromEntries(data.subjects.map((s) => [s.id, s]));

  const items = data.sessions.filter(
    (s) => (!person || s.personId === person) && (!subject || s.subjectId === subject)
  );
  const total = items.reduce((a, s) => a + s.seconds, 0);

  return (
    <section>
      <div className="section-head">
        <h2>Bitácora</h2>
        <div className="filters">
          <select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Todas las personas</option>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Todos los ramos</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="muted small">
        {items.length} {items.length === 1 ? "sesión" : "sesiones"} · {fmtDur(total)}
      </p>

      {!items.length ? (
        <div className="card empty">
          <p className="muted">Aún no hay sesiones registradas.</p>
        </div>
      ) : (
        <ul className="log">
          {items.map((s) => {
            const subj = subjectById[s.subjectId];
            const expanded = open === s.id;
            return (
              <li key={s.id} className="card entry" style={{ "--accent": subj?.color }}>
                <button className="entry-head" onClick={() => setOpen(expanded ? null : s.id)}>
                  <div className="grow">
                    <h3>{s.title}</h3>
                    <p className="muted small">
                      {personById[s.personId]?.name ?? "—"} · {dateFmt.format(new Date(s.date))}
                      {s.editedAt && <span className="edited"> · editada</span>}
                    </p>
                  </div>
                  <span className="chip" style={{ background: subj?.color }}>
                    {subj?.name ?? "—"}
                  </span>
                  <span className="duration">{fmtDur(s.seconds)}</span>
                </button>
                {s.notes && <p className={expanded ? "notes" : "notes clamp"}>{s.notes}</p>}
                {expanded && s.personId === me.id && (
                  <div className="entry-actions">
                    <button className="btn ghost" onClick={() => onEdit(s)}>
                      Editar
                    </button>
                    <button
                      className="btn ghost danger"
                      onClick={() =>
                        confirm("¿Eliminar esta sesión?") &&
                        mutate(`/api/sessions?id=${s.id}`, { method: "DELETE" }, "Sesión eliminada")
                      }
                    >
                      Eliminar sesión
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------- ramos y personas ----------

function Setup({ data, me, mutate, onLeave }) {
  const [subjectName, setSubjectName] = useState("");
  const [goal, setGoal] = useState("");
  const [color, setColor] = useState(COLORS[data.subjects.length % COLORS.length]);

  const hoursFor = (field, id) =>
    data.sessions.filter((s) => s[field] === id).reduce((a, s) => a + s.seconds, 0);

  const addSubject = async (e) => {
    e.preventDefault();
    const ok = await mutate(
      "/api/subjects",
      { method: "POST", body: { name: subjectName, goalHours: goal, color } },
      "Ramo agregado ✓"
    );
    if (ok) {
      setSubjectName("");
      setGoal("");
      setColor(COLORS[(data.subjects.length + 1) % COLORS.length]);
    }
  };

  const delSubject = (s) =>
    confirm(`¿Eliminar el ramo "${s.name}"? También se borrarán todas sus sesiones y metas.`) &&
    mutate(`/api/subjects?id=${s.id}`, { method: "DELETE" }, "Ramo eliminado");

  const deleteAccount = async () => {
    if (!confirm("¿Eliminar tu cuenta? Se borrarán todas tus sesiones. Esto no se puede deshacer.")) return;
    if (await mutate(`/api/people?id=${me.id}`, { method: "DELETE" })) onLeave();
  };

  return (
    <div className="grid two">
      <section className="card">
        <h2>Ramos</h2>
        <form onSubmit={addSubject} className="form">
          <input placeholder="Nombre del ramo" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} maxLength={60} required />
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder="Meta de horas (opcional)"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <div className="swatches" role="radiogroup" aria-label="Color">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={color === c}
                className={color === c ? "swatch on" : "swatch"}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <button className="btn primary">Agregar ramo</button>
        </form>
        <ul className="items">
          {data.subjects.map((s) => (
            <li key={s.id}>
              <i className="dot" style={{ background: s.color }} />
              <span className="grow">
                {s.name}
                {s.goalHours ? <span className="muted small"> · meta {s.goalHours} h</span> : null}
              </span>
              <span className="muted small">{fmtHours(hoursFor("subjectId", s.id))} h</span>
              {(!s.createdBy || s.createdBy === me.id) && (
                <button className="icon-btn" aria-label={`Eliminar ${s.name}`} onClick={() => delSubject(s)}>
                  ✕
                </button>
              )}
            </li>
          ))}
          {!data.subjects.length && <li className="muted small">Sin ramos todavía.</li>}
        </ul>
      </section>

      <div className="stack">
        <section className="card">
          <h2>Mi cuenta</h2>
          <div className="account">
            <div className="avatar">{me.name.slice(0, 1).toUpperCase()}</div>
            <div className="grow">
              <p>
                <b>{me.name}</b>
              </p>
              <p className="muted small">@{me.username}</p>
            </div>
          </div>
          <label className="min-edit wide">
            <span>Mi mínimo de horas al día</span>
            <input
              type="number"
              min="0"
              max="24"
              step="0.5"
              defaultValue={me.dailyGoalHours ?? ""}
              placeholder="Sin mínimo"
              onBlur={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                if (v !== (me.dailyGoalHours ?? null)) {
                  mutate(`/api/people?id=${me.id}`, { method: "PATCH", body: { dailyGoalHours: v } }, "Mínimo actualizado ✓");
                }
              }}
            />
          </label>
          <p className="muted small">Si un día no lo cumples, al día siguiente te espera un castigo 😈</p>
          <button className="btn ghost danger account-delete" onClick={deleteAccount}>
            Eliminar mi cuenta
          </button>
        </section>

        <section className="card">
          <h2>Personas</h2>
          <p className="muted small">Cada persona entra con su propia cuenta y registra sus horas.</p>
          <ul className="items">
            {data.people.map((p) => (
              <li key={p.id}>
                <div className="avatar sm">{p.name.slice(0, 1).toUpperCase()}</div>
                <span className="grow">
                  {p.name} {p.id === me.id && <span className="you">tú</span>}
                  <span className="muted small"> · @{p.username}</span>
                </span>
                <span className="muted small">
                  {fmtHours(hoursFor("personId", p.id))} h{p.dailyGoalHours ? ` · mín ${p.dailyGoalHours} h/día` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ---------- modal de sesión ----------

const MODAL_TEXT = {
  timer: { title: "¿Qué estudiaste?", cancel: "Seguir después", save: "Guardar sesión" },
  manual: { title: "Registrar sesión", cancel: "Cancelar", save: "Guardar sesión" },
  edit: { title: "Editar sesión", cancel: "Cancelar", save: "Guardar cambios" },
};

function SessionModal({ data, me, initial, onClose, onSave }) {
  const { mode } = initial;
  const text = MODAL_TEXT[mode];
  const startSecs = mode === "manual" ? 3600 : initial.seconds;
  const [subjectId, setSubjectId] = useState(initial.subjectId || data.subjects[0]?.id || "");
  const [hours, setHours] = useState(String(Math.floor(startSecs / 3600)));
  const [minutes, setMinutes] = useState(String(Math.floor((startSecs % 3600) / 60)));
  // Mientras no se toque la duración, se guardan los segundos exactos medidos.
  const [durationTouched, setDurationTouched] = useState(false);
  const [title, setTitle] = useState(initial.title || "");
  const [notes, setNotes] = useState(initial.notes || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const seconds = durationTouched
    ? (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60
    : startSecs;
  const tooShort = seconds < 60;
  const tooLong = seconds > 24 * 3600;
  const removed = startSecs - seconds;

  const setDuration = (secs) => {
    const clamped = Math.max(0, secs);
    setHours(String(Math.floor(clamped / 3600)));
    setMinutes(String(Math.floor((clamped % 3600) / 60)));
    setDurationTouched(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({ subjectId, seconds, title, notes });
    setSaving(false);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card modal" onSubmit={submit}>
        <h2>{text.title}</h2>

        {mode === "timer" ? (
          <p className="summary">
            <span className="chip" style={{ background: data.subjects.find((s) => s.id === subjectId)?.color }}>
              {data.subjects.find((s) => s.id === subjectId)?.name}
            </span>
            <span className="muted">Medido:</span>
            <b>{fmtClock(startSecs)}</b>
            <span className="muted">· {me.name}</span>
          </p>
        ) : (
          <label>
            <span>Ramo</span>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {data.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="duration-edit">
          <div className="row">
            <label>
              <span>Horas</span>
              <input
                type="number"
                min="0"
                max="24"
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value);
                  setDurationTouched(true);
                }}
              />
            </label>
            <label>
              <span>Minutos</span>
              <input
                type="number"
                min="0"
                max="59"
                value={minutes}
                onChange={(e) => {
                  setMinutes(e.target.value);
                  setDurationTouched(true);
                }}
              />
            </label>
          </div>
          {mode !== "manual" && (
            <div className="quick-subtract">
              <span className="muted small">¿Se te olvidó pausar? Restar:</span>
              {[5, 15, 30, 60].map((m) => (
                <button type="button" key={m} className="btn ghost pill" onClick={() => setDuration(seconds - m * 60)}>
                  −{m < 60 ? `${m} min` : "1 h"}
                </button>
              ))}
              {durationTouched && (
                <button
                  type="button"
                  className="btn ghost pill"
                  onClick={() => {
                    setDuration(startSecs);
                    setDurationTouched(false);
                  }}
                >
                  Deshacer
                </button>
              )}
            </div>
          )}
          {mode !== "manual" && removed > 0 && (
            <p className="muted small">
              Se guardará {fmtDur(seconds)} (le quitaste {fmtDur(removed)}).
            </p>
          )}
        </div>

        <label>
          <span>Título</span>
          <input
            autoFocus
            placeholder="Ej: Ejercicios de derivadas"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label>
          <span>¿Qué hiciste?</span>
          <textarea
            rows={5}
            placeholder="Temas que repasaste, ejercicios, dudas que quedaron…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
          />
        </label>

        {tooShort && <p className="warn small">La sesión debe durar al menos 1 minuto para guardarse.</p>}
        {tooLong && <p className="warn small">La sesión no puede durar más de 24 horas.</p>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {text.cancel}
          </button>
          <button className="btn primary" disabled={saving || tooShort || tooLong || !title.trim()}>
            {saving ? "Guardando…" : text.save}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- metas (pruebas y trabajos) ----------

function GoalItem({ goal, subject, studied, onToggle, onDelete }) {
  const days = daysUntil(goal.dueDate);
  const urgency = goal.done ? "done" : days < 0 ? "late" : days <= 3 ? "soon" : "";
  return (
    <li className={`goal ${urgency}`} style={{ "--accent": subject?.color }}>
      {onToggle && (
        <input type="checkbox" checked={goal.done} onChange={onToggle} aria-label="Marcar como lista" />
      )}
      <div className="grow">
        <p className="goal-title">{goal.title}</p>
        <p className="muted small">
          {KIND_LABEL[goal.kind]} · {subject?.name ?? "—"}
          {studied != null && ` · ${fmtDur(studied)} estudiadas desde que se agregó`}
        </p>
      </div>
      <span className="due">{goal.done ? "Lista ✓" : dueLabel(days)}</span>
      {onDelete && (
        <button className="icon-btn" aria-label={`Eliminar ${goal.title}`} onClick={onDelete}>
          ✕
        </button>
      )}
    </li>
  );
}

function Upcoming({ data, goGoals }) {
  const subjectById = Object.fromEntries(data.subjects.map((s) => [s.id, s]));
  const next = data.goals.filter((g) => !g.done && daysUntil(g.dueDate) >= 0).slice(0, 4);
  if (!next.length) return null;
  return (
    <>
      <div className="section-head">
        <h2>Próximas pruebas y trabajos</h2>
        <button className="btn ghost" onClick={goGoals}>
          Ver todas →
        </button>
      </div>
      <ul className="goals card">
        {next.map((g) => (
          <GoalItem key={g.id} goal={g} subject={subjectById[g.subjectId]} />
        ))}
      </ul>
    </>
  );
}

function Goals({ data, me, mutate }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("prueba");
  const [subjectId, setSubjectId] = useState(data.subjects[0]?.id || "");
  const [dueDate, setDueDate] = useState(dayKey(Date.now() + 7 * DAY));
  const subjectById = Object.fromEntries(data.subjects.map((s) => [s.id, s]));

  const studiedSince = (g) =>
    data.sessions
      .filter((s) => s.subjectId === g.subjectId && s.date >= g.createdAt)
      .reduce((a, s) => a + s.seconds, 0);

  const add = async (e) => {
    e.preventDefault();
    const ok = await mutate("/api/goals", { method: "POST", body: { title, kind, subjectId, dueDate } }, "Meta agregada ✓");
    if (ok) setTitle("");
  };

  const pending = data.goals.filter((g) => !g.done);
  const done = data.goals.filter((g) => g.done).reverse();

  const item = (g) => (
    <GoalItem
      key={g.id}
      goal={g}
      subject={subjectById[g.subjectId]}
      studied={studiedSince(g)}
      onToggle={() => mutate(`/api/goals?id=${g.id}`, { method: "PATCH", body: { done: !g.done } })}
      onDelete={
        !g.createdBy || g.createdBy === me.id
          ? () =>
              confirm(`¿Eliminar "${g.title}"?`) &&
              mutate(`/api/goals?id=${g.id}`, { method: "DELETE" }, "Meta eliminada")
          : null
      }
    />
  );

  if (!data.subjects.length) {
    return (
      <section className="card empty">
        <p className="muted">Primero agrega un ramo en “Ramos y personas”.</p>
      </section>
    );
  }

  return (
    <div className="grid goals-layout">
      <section className="card">
        <h2>Nueva meta</h2>
        <form onSubmit={add} className="form">
          <input placeholder="Ej: Certamen 2, Informe final…" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
          <div className="row">
            <label>
              <span>Tipo</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.entries(KIND_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Fecha</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </label>
          </div>
          <label>
            <span>Ramo</span>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {data.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary">Agregar meta</button>
        </form>
      </section>

      <section>
        <h2 className="list-title">Pendientes ({pending.length})</h2>
        {pending.length ? (
          <ul className="goals card">{pending.map(item)}</ul>
        ) : (
          <div className="card empty">
            <p className="muted">No hay pruebas ni trabajos pendientes 🎉</p>
          </div>
        )}
        {done.length > 0 && (
          <>
            <h2 className="list-title">Listas ({done.length})</h2>
            <ul className="goals card">{done.map(item)}</ul>
          </>
        )}
      </section>
    </div>
  );
}

// ---------- castigo por no cumplir el mínimo ----------

const PUNISH_KEY = "estudio.castigos-vistos";

function Punishment({ data, me }) {
  const [seen, setSeen] = useState(null);

  useEffect(() => {
    try {
      setSeen(JSON.parse(localStorage.getItem(PUNISH_KEY)) || []);
    } catch {
      setSeen([]);
    }
  }, []);

  // ¿El usuario actual no cumplió su mínimo ayer?
  const yesterday = startOfDay(Date.now()) - DAY;
  const offenders = useMemo(() => {
    if (!seen) return [];
    return data.people
      .filter((p) => p.id === me.id && p.dailyGoalHours > 0 && startOfDay(p.createdAt) <= yesterday)
      .map((p) => ({ p, secs: secondsByDay(data.sessions, p.id)[dayKey(yesterday)] || 0 }))
      .filter(({ p, secs }) => secs < p.dailyGoalHours * 3600 && !seen.includes(`${p.id}:${dayKey(yesterday)}`));
  }, [data, me.id, seen, yesterday]);

  if (!offenders.length) return null;
  const { p, secs } = offenders[0];

  const accept = () => {
    const next = [...seen, `${p.id}:${dayKey(yesterday)}`].slice(-200);
    setSeen(next);
    try {
      localStorage.setItem(PUNISH_KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <div className="punish" role="alertdialog" aria-labelledby="punish-title">
      <div className="rain" aria-hidden>
        {Array.from({ length: 40 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 10) * 0.12}s`, animationDuration: `${0.6 + (i % 5) * 0.12}s` }} />
        ))}
      </div>
      <div className="punish-card">
        <div className="cloud" aria-hidden>
          ⛈️
        </div>
        <div className="sad" aria-hidden>
          😩
        </div>
        <h2 id="punish-title">¡{p.name}, no cumpliste tu mínimo!</h2>
        <p>
          Ayer estudiaste <b>{fmtDur(secs)}</b> de <b>{p.dailyGoalHours} h</b>.
          <br />
          Te faltaron {fmtDur(p.dailyGoalHours * 3600 - secs)}.
        </p>
        <p className="sentence">
          Castigo: hoy debes estudiar <b>{fmtDur(p.dailyGoalHours * 3600 + (p.dailyGoalHours * 3600 - secs))}</b> para
          recuperarte 😤
        </p>
        <button className="btn primary big" onClick={accept}>
          Acepto mi castigo 😔
        </button>
      </div>
    </div>
  );
}

// ---------- login y registro ----------

function AuthScreen({ onAuth, needsSetup }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", username: "", password: "", dailyGoalHours: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const register = mode === "register";
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await api(`/api/auth/${mode}`, { method: "POST", body: form });
      onAuth(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand">
          <span className="logo" aria-hidden>
            ◷
          </span>
          <div>
            <h1>Horas de estudio</h1>
            <p className="muted">{register ? "Crea tu cuenta" : "Inicia sesión para registrar tus horas"}</p>
          </div>
        </div>

        {needsSetup && (
          <div className="banner">
            Falta conectar la base de datos. En Vercel ve a <b>Storage → Upstash for Redis</b>, conéctala al
            proyecto y vuelve a desplegar.
          </div>
        )}

        {register && (
          <label>
            <span>Tu nombre</span>
            <input value={form.name} onChange={set("name")} maxLength={60} required autoFocus />
          </label>
        )}
        <label>
          <span>Usuario</span>
          <input
            value={form.username}
            onChange={set("username")}
            autoComplete="username"
            autoCapitalize="none"
            placeholder="ej: ana.perez"
            maxLength={30}
            required
            autoFocus={!register}
          />
        </label>
        <label>
          <span>Contraseña</span>
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete={register ? "new-password" : "current-password"}
            minLength={register ? 6 : undefined}
            required
          />
        </label>
        {register && (
          <label>
            <span>Mínimo de horas al día (opcional)</span>
            <input type="number" min="0" max="24" step="0.5" value={form.dailyGoalHours} onChange={set("dailyGoalHours")} />
          </label>
        )}

        {error && <p className="auth-error">{error}</p>}

        <button className="btn primary big" disabled={busy || needsSetup}>
          {busy ? "Un momento…" : register ? "Crear cuenta" : "Entrar"}
        </button>
        <p className="muted small center">
          {register ? "¿Ya tienes cuenta?" : "¿Primera vez aquí?"}{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(register ? "login" : "register");
              setError("");
            }}
          >
            {register ? "Inicia sesión" : "Crea tu cuenta"}
          </button>
        </p>
      </form>
    </div>
  );
}
