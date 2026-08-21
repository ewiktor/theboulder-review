/* ============================================================
   Shared storage for the review board, on Netlify Blobs.

   One blob per entry, keyed <project>/<kind>/<target>. Per-entry
   keys mean two people writing on two different frames can never
   collide; within one frame it is last-write-wins, same as the
   board has always behaved.

   Nothing to configure: Netlify wires the store to the site.
   ============================================================ */
import { getStore } from "@netlify/blobs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/* strong consistency: a teammate's write must be visible on the next
   poll, not eventually */
const store = () => getStore({ name: "draper-review", consistency: "strong" });

export default async (req) => {
  const url = new URL(req.url);
  const project = url.searchParams.get("project");
  if (!project) return json({ error: "project required" }, 400);

  const s = store();
  const prefix = `${project}/`;

  if (req.method === "GET") {
    const { blobs } = await s.list({ prefix });
    const rows = await Promise.all(
      blobs.map(async (b) => {
        const v = await s.get(b.key, { type: "json" }).catch(() => null);
        if (!v) return null;
        const [, kind, ...rest] = b.key.split("/");
        return {
          kind,
          target_id: decodeURIComponent(rest.join("/")),
          body: v.body,
          updated_at: v.updated_at,
        };
      })
    );
    return json(rows.filter(Boolean));
  }

  if (req.method === "POST") {
    let row;
    try { row = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const { kind, target_id, body } = row || {};
    if (!kind || !target_id) return json({ error: "kind and target_id required" }, 400);
    if (!["feedback", "idea"].includes(kind)) return json({ error: "unknown kind" }, 400);

    const key = `${project}/${kind}/${encodeURIComponent(target_id)}`;
    /* an emptied field is a deletion, so it does not linger in the export */
    if (!body || !String(body).trim()) {
      await s.delete(key).catch(() => {});
      return json({ ok: true });
    }
    await s.setJSON(key, {
      body: String(body),
      updated_at: new Date().toISOString(),
    });
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/entries" };
