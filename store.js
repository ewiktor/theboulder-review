/* ============================================================
   Storage. The only file that knows where anything is kept.

   Design: everything is loaded into memory once at boot, so the
   UI stays synchronous and never stalls mid-sentence. Writes go
   to memory immediately (optimistic), then to the database and
   to localStorage in the background. If the network is down the
   board keeps working and syncs the next time it can.
   ============================================================ */
const STORE = (() => {
  const cfg = window.DRAPER_CONFIG || {};

  /* Where shared writes go. Supabase wins if it is configured — that is
     the path to take when this moves to its own domain. Otherwise the
     board talks to its own Netlify function, which needs no keys and no
     account. Opening the files straight off disk has neither, so the
     first read demotes us to "local" and everything still works. */
  const supabase = !!(cfg.supabaseUrl && cfg.supabaseKey);
  const api = cfg.apiPath || "/api/entries";
  let mode = supabase ? "supabase" : "netlify";
  const live = () => mode !== "local";

  let projectId = null;
  let mem  = { feedback: {}, idea: {} };   // kind -> targetId -> body
  let meta = {};                           // kind|targetId -> {updated_at}
  let status = "connecting";
  let listeners = [];
  const pending = new Map();               // rows waiting to be pushed

  /* ---------- local mirror ---------- */
  const lsKey = () => `draper-review:${projectId}`;
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(lsKey())) || { feedback:{}, idea:{}, meta:{} }; }
    catch { return { feedback:{}, idea:{}, meta:{} }; }
  }
  function writeLocal() {
    try { localStorage.setItem(lsKey(), JSON.stringify({ ...mem, meta })); } catch {}
  }

  /* ---------- rest api ---------- */
  const url = (path) => `${cfg.supabaseUrl}/rest/v1/${path}`;
  const headers = (extra) => Object.assign({
    apikey: cfg.supabaseKey,
    Authorization: `Bearer ${cfg.supabaseKey}`,
    "Content-Type": "application/json",
  }, extra || {});

  async function pull() {
    if (!live()) return false;
    const r = mode === "supabase"
      ? await fetch(
          url(`entries?project_id=eq.${encodeURIComponent(projectId)}&select=target_id,kind,body,updated_at`),
          { headers: headers() })
      : await fetch(`${api}?project=${encodeURIComponent(projectId)}`, { headers: { accept: "application/json" } });
    /* no backend behind this URL — stop trying and keep working locally */
    if (r.status === 404 || r.status === 405) { mode = "local"; status = "local"; return false; }
    if (!r.ok) throw new Error("pull " + r.status);
    const rows = await r.json();
    const next = { feedback:{}, idea:{} }, nextMeta = {};
    for (const row of rows) {
      if (!next[row.kind]) next[row.kind] = {};
      next[row.kind][row.target_id] = row.body;
      nextMeta[row.kind + "|" + row.target_id] = { updated_at: row.updated_at };
    }
    mem = next; meta = nextMeta;
    writeLocal();
    return true;
  }

  async function push(kind, targetId, body) {
    if (!live()) return false;
    const row = {
      project_id: projectId, target_id: targetId, kind,
      body, updated_at: new Date().toISOString(),
    };
    pending.set(kind + "|" + targetId, row);
    try {
      const r = mode === "supabase"
        ? await fetch(url("entries?on_conflict=project_id,target_id,kind"), {
            method: "POST",
            headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
            body: JSON.stringify(row),
          })
        : await fetch(`${api}?project=${encodeURIComponent(projectId)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind, target_id: targetId, body }),
          });
      if (r.status === 404 || r.status === 405) { mode = "local"; status = "local"; emit(); return false; }
      if (!r.ok) throw new Error("push " + r.status);
      pending.delete(kind + "|" + targetId);
      if (status !== "live") { status = "live"; emit(); }
      return true;
    } catch (e) {
      status = "offline"; emit();
      return false;
    }
  }

  async function flush() {
    if (!live() || !pending.size) return;
    for (const [, row] of [...pending]) await push(row.kind, row.target_id, row.body);
  }

  function emit() { listeners.forEach((f) => { try { f(); } catch {} }); }

  return {
    get live() { return live(); },
    mode: () => mode,
    status: () => status,
    onChange(fn) { listeners.push(fn); },

    async boot(project) {
      projectId = project.id;
      const local = readLocal();
      mem = { feedback: local.feedback || {}, idea: local.idea || {} };
      meta = local.meta || {};
      try { if (await pull()) status = "live"; }
      catch { status = "offline"; }
      emit();
    },

    /* poll for other people's changes; never clobber a field being typed in */
    startPolling(isBusy) {
      if (!live()) return;
      const every = (cfg.pollSeconds || 15) * 1000;
      setInterval(async () => {
        await flush();
        if (isBusy && isBusy()) return;
        try { const before = JSON.stringify(mem); await pull();
              if (JSON.stringify(mem) !== before) emit(); status = "live"; }
        catch { status = "offline"; emit(); }
      }, every);
    },

    get(kind, targetId) { return (mem[kind] || {})[targetId] || ""; },
    all(kind) { return mem[kind] || {}; },
    metaFor(kind, targetId) { return meta[kind + "|" + targetId] || null; },

    set(kind, targetId, value) {
      const v = (value || "").trim();
      if (!mem[kind]) mem[kind] = {};
      if (v) mem[kind][targetId] = v; else delete mem[kind][targetId];
      meta[kind + "|" + targetId] = { updated_at: new Date().toISOString() };
      writeLocal();
      /* the promise resolves true only once the words are somewhere the
         rest of the team can read them — the toast says which happened */
      return push(kind, targetId, v);
    },

    /* Markdown of the whole board — every note and every idea line. */
    exportAsFile(project) {
      const fb = mem.feedback || {}, id = mem.idea || {};
      const L = [`# Feedback — ${project.client}${project.round ? " · " + project.round : ""}`,
                 `_Exported ${new Date().toLocaleString()}_`,
                 mode === "local" ? "\n> Saved on this device only." : "", ""];
      for (const lane of project.lanes) for (const g of lane.groups) {
        const gKey = `group:${lane.id}/${g.id}`;
        const gNote = fb[gKey];
        const items = g.items.filter((i) => fb[i.id] || id[i.id]);
        if (!gNote && !items.length && !id[gKey]) continue;
        L.push(`## ${lane.name} — ${g.name}`, "");
        if (id[gKey]) L.push(`*The idea:* ${id[gKey]}`, "");
        if (gNote) L.push(`**On the whole group:** ${gNote}`, "");
        for (const it of items) {
          L.push(`- **${it.title}**`);
          if (id[it.id]) L.push(`  - *The idea:* ${id[it.id]}`);
          if (fb[it.id]) L.push(`  - *Feedback:* ${fb[it.id]}`);
        }
        L.push("");
      }
      if (!L.slice(4).join("").trim()) L.push("_Nothing written yet._");
      const blob = new Blob([L.join("\n")], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `feedback-${project.client.toLowerCase().replace(/\s+/g, "-")}.md`;
      a.click(); URL.revokeObjectURL(a.href);
    },
  };
})();
