/* DRAPER Review — plain JS, no build step. */

(() => {
  const P = window.DRAPER_PROJECT;
  const root = document.getElementById("root");

  /* ---------- state ---------- */
  let selection = { type: "all" };
  let openId = null;
  let editingIdea = null;   // target key while its idea is being edited
  let stageAlt = false;     // detail view: showing the twin rather than the opened frame
  let showSummary = false;
  let panelOpen = false;    // mobile: group idea/feedback sheet
  let navCollapsed = localStorage.getItem("draper-review:nav") === "collapsed";

  const isMobile = () => window.innerWidth < 900;

  /* Studio mode: ?studio=<key> lets the team write the idea copy and read
     the feedback summary. Everyone else reads ideas and writes feedback. */
  const params = new URLSearchParams(location.search);
  const STUDIO = params.get("studio") === (window.DRAPER_CONFIG?.studioKey || "draper");
  const feedbackAll = () => STORE.all("feedback");
  const ideaAll = () => STORE.all("idea");
  const ideaFor = (key, fallback) => { const v = STORE.get("idea", key); return v !== "" ? v : (fallback || ""); };
  /* The idea is the line on a frame anyone may write or rewrite. */
  const ideaBlock = (key, fallbackText, cls) => {
    const text = ideaFor(key, fallbackText);
    if (editingIdea === key) {
      return `
        <div class="label label--row">The idea
          <button class="editbtn editbtn--on" data-action="save-idea:${key}">Save</button>
        </div>
        <textarea class="field field--idea" rows="3" data-idea-save="${key}"
                  placeholder="What this is exploring, in a sentence or two…">${esc(text)}</textarea>`;
    }
    return `
      <div class="label label--row">The idea
        <button class="editbtn" data-action="edit-idea:${key}">${text ? "Edit" : "Add"}</button>
      </div>
      ${text ? `<p class="${cls}">${esc(text)}</p>` : `<p class="${cls} idea-empty">Not written yet.</p>`}`;
  };

  const PROMPT = "Your feedback — what works, what doesn't, and why. Name the specific thing: a colour, a crop, a typeface…";
  const GROUP_PROMPT = "Feedback on this whole group — if the direction itself is off, say it here instead of frame by frame…";

  /* ---------- derived ---------- */
  const flat = [];
  for (const lane of P.lanes)
    for (const group of lane.groups)
      for (const item of group.items) flat.push({ item, group, lane });

  const itemById = (id) => flat.find((r) => r.item.id === id)?.item || null;
  /* A frame that exists as both motion and still carries a pointer to its
     twin; the stage can show either without leaving the frame. */
  const twinOf = (item) => itemById(item.still || item.motion || "");

  /* The two are one frame in two states, so they share one idea. The
     still's id is where it lives — that is also where every idea written
     so far already sits, since the still is what the board shipped with. */
  const ideaKeyOf = (item) => (item && item.still) || (item && item.id) || "";

  const laneCount = (laneId) =>
    P.lanes.find((l) => l.id === laneId).groups.reduce((n, g) => n + g.items.length, 0);

  /* "All" shows a shuffled mix so lanes and groups interleave.
     The shuffle is SEEDED from the project, so the board is dealt once
     and stays identical on every reload and every device. To re-deal,
     set a different `shuffleSeed` in project.js. */
  const shuffled = (() => {
    let seed = 0;
    const key = String(P.shuffleSeed || P.id);
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
    const rand = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const a = [...flat];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    /* A frame marked `pin` in the manifest is dealt first, in the order it
       appears there — the shuffle is for everything after it. */
    const pinned = flat.filter((r) => r.item.pin);
    if (!pinned.length) return a;
    const rest = a.filter((r) => !r.item.pin);
    return [...pinned, ...rest];
  })();

  /* In the Motion view a card shows the STILL it is bound to, not the clip.
     That is the whole point of the view: confirming each motion item is
     wired to the right frame. The tag under it names the pairing. */
  /* A motion frame and its still are the same frame in two states, so they
     share one "the idea" line. The still's id is the canonical key, which is
     also where every idea written so far already lives. */

  /* `pin` holds a frame at the front of whatever view it appears in. */
  const pinnedFirst = (rows) => {
    const pin = rows.filter((r) => r.item.pin);
    return pin.length ? [...pin, ...rows.filter((r) => !r.item.pin)] : rows;
  };

  const visible = () => {
    if (selection.type === "lane")
      return pinnedFirst(flat.filter((r) => r.lane.id === selection.laneId));
    if (selection.type === "group")
      return pinnedFirst(flat.filter((r) => r.lane.id === selection.laneId && r.group.id === selection.groupId));
    return shuffled;
  };

  const groupKey = (laneId, groupId) => `group:${laneId}/${groupId}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- pieces ---------- */
  /* Grid uses a ~44KB thumbnail; the detail view starts from that same
     (already cached) thumbnail and swaps in the full-resolution file once
     it has loaded, so opening a frame is instant and then sharpens. */
  const imgBase = () => `projects/${P.folder || "_example"}/images`;
  const vidBase = () => `projects/${P.folder || "_example"}/videos`;
  const media = (item, cls = "", full = false) => {
    /* Motion frames: the grid gets a 700px re-encode (the whole set is 2MB),
       the opened frame gets the original. Muted + playsinline so mobile
       will autoplay at all; the observer below decides when. */
    if (item.video) {
      /* Always start from the 700px clip — the grid has usually fetched it
         already, so motion begins at once instead of holding on the poster
         while several megabytes arrive. The original swaps in behind it,
         same as the stills do. */
      const small = `${vidBase()}/thumbs/${esc(item.video)}`;
      const orig  = `${vidBase()}/${esc(item.video)}`;
      /* The poster is the frame's own still, which always exists. That keeps a
         motion card looking right in the grid before the clip has loaded, and
         keeps it looking right at all if the clip is missing entirely. */
      const twinStill = itemById(item.still || "");
      const posterSrc = twinStill && twinStill.image
        ? `${imgBase()}/thumbs/${esc(twinStill.image)}`
        : (item.poster ? `${vidBase()}/posters/${esc(item.poster)}` : "");
      const poster = posterSrc ? ` poster="${posterSrc}"` : "";
      return `<video class="ph-img ${cls}" src="${small}"${poster} muted loop playsinline
                     preload="${full ? "auto" : "none"}"${full ? ` autoplay data-full="${orig}"` : " data-autoplay"}
                     style="aspect-ratio:${item.w}/${item.h}"></video>`;
    }
    if (!item.image) return `<div class="ph ${cls}" style="aspect-ratio:${item.w}/${item.h}"></div>`;
    const thumb = `${imgBase()}/thumbs/${esc(item.image)}`;
    const orig  = `${imgBase()}/${esc(item.image)}`;
    /* The opened frame is the thing being looked at — load it now. Lazy
       would also deadlock it: the stage sizes the image from its own
       intrinsic size, so an unloaded one is 0x0 and never intersects. */
    return `<img class="ph-img ${cls}" src="${thumb}"${full ? ` data-full="${orig}"` : ""} alt=""${
      full ? "" : ` loading="lazy"`} style="aspect-ratio:${item.w}/${item.h}">`;
  };

  /* upgrade any open frame to full resolution in the background */
  function upgradeFull() {
    root.querySelectorAll("img[data-full]").forEach((el) => {
      const src = el.dataset.full;
      if (!src || el.dataset.upgraded) return;
      const pre = new Image();
      pre.onload = () => { el.src = src; el.dataset.upgraded = "1"; };
      pre.src = src;
    });

    root.querySelectorAll("video[data-full]").forEach((el) => {
      /* never wait on the autoplay attribute alone */
      el.play?.().catch(() => {});
      const src = el.dataset.full;
      if (!src || el.dataset.upgraded) return;
      /* buffer the original out of sight, then cut across at the same
         point in the loop so the swap is not a visible restart */
      const pre = document.createElement("video");
      pre.muted = true; pre.preload = "auto"; pre.src = src;
      pre.addEventListener("canplaythrough", () => {
        if (el.dataset.upgraded || !el.isConnected) return;
        el.dataset.upgraded = "1";
        const at = el.currentTime, wasPlaying = !el.paused;
        el.addEventListener("loadedmetadata", () => {
          try { el.currentTime = Math.min(at, el.duration || at); } catch {}
          if (wasPlaying) el.play().catch(() => {});
        }, { once: true });
        el.src = src;
      }, { once: true });
      pre.load();
    });
  }

  const dotSlot = (id) =>
    `<span class="dotslot" data-dotslot="${id}">${STORE.get("feedback", id) ? '<i class="dot dot--blue"></i>' : ""}</span>`;

  /* Sidebar head, matching the product: logo row with a collapse control,
     then the brand as a filled box. Studio mode makes the box a picker —
     switching brands loads that client's manifest via ?project=. */
  const PANEL_ICON = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3">
      <rect x="1.5" y="2.5" width="13" height="11"></rect><path d="M6 2.5v11"></path><path d="M12 6 10 8l2 2"></path></svg>`;
  const CHEVRONS_ICON = `<svg class="brandbox__chev" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 6.5 8 3.5l3 3"></path><path d="M5 9.5 8 12.5l3-3"></path></svg>`;

  const BRANDS = window.DRAPER_CONFIG?.projects || [];
  const canSwitchBrand = STUDIO && BRANDS.length > 1;

  function brandBoxHTML() {
    const meta = `<span class="brandbox__name">${esc(P.client)}</span>`;
    if (!canSwitchBrand) return `<div class="brandbox">${meta}</div>`;
    const opts = BRANDS.map((b) =>
      `<option value="${esc(b.folder)}" ${b.folder === P.folder ? "selected" : ""}>${esc(b.label || b.folder)}</option>`
    ).join("");
    return `
      <div class="brandbox brandbox--switch">
        ${meta}${CHEVRONS_ICON}
        <select class="brandbox__select" data-brand aria-label="Change brand">${opts}</select>
      </div>`;
  }

  function sidebarHTML() {
    const row = (cls, active, action, label, count, dotId) => `
      <button class="nav__row ${cls} ${active ? "is-active" : ""}" data-action="${action}">
        <span class="nav__name">${dotId ? dotSlot(dotId) : ""}${esc(label)}</span>
        <span class="nav__count">${count}</span>
      </button>`;

    let html = row("nav__row--lane", selection.type === "all", "select-all", "All", flat.length, null);
    for (const lane of P.lanes) {
      html += `<div class="nav__lane">`;
      html += row("nav__row--lane",
        selection.type === "lane" && selection.laneId === lane.id,
        `select-lane:${lane.id}`, lane.name, laneCount(lane.id), null);
      for (const g of lane.groups) {
        html += row("nav__row--group",
          selection.type === "group" && selection.laneId === lane.id && selection.groupId === g.id,
          `select-group:${lane.id}:${g.id}`, g.name, g.items.length, groupKey(lane.id, g.id));
      }
      html += `</div>`;
    }
    return `
      <aside class="sidebar">
        <div class="sidebar__head">
          <div class="sidebar__logorow">
            <img class="sidebar__logo" src="draperlogo.svg" alt="DRAPER">
            <button class="navtoggle" data-action="nav-toggle"
                    title="${navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
                    aria-label="${navCollapsed ? "Expand sidebar" : "Collapse sidebar"}">${PANEL_ICON}</button>
          </div>
          ${brandBoxHTML()}
        </div>
        <nav class="nav">${html}</nav>
        <div class="sidebar__foot">
          ${STUDIO ? `<button class="quiet ${showSummary ? "is-on" : ""}" data-action="summary">${showSummary ? "← Back to frames" : "Feedback summary"}</button>` : ""}
          <button class="quiet" data-action="export">Export feedback</button>
        </div>
      </aside>`;
  }

  function gridColumnCount() {
    const vw = window.innerWidth;
    const mob = isMobile();
    /* on mobile the nav is a drawer and the group panel stacks, so the
       grid gets the full width; column target shrinks with the screen. */
    const side  = mob ? 0 : navCollapsed ? 56 : 216;
    const panel = (!mob && selection.type === "group") ? 360 : 0;
    const pad   = mob ? 24 : 36;
    const target = vw < 600 ? 150 : vw < 900 ? 220 : 320;
    const w = Math.max(260, vw - side - panel - pad);
    const gap = 14;
    const maxCols = Math.max(1, Math.floor((w + gap) / (target + gap)));
    const minCols = Math.max(1, Math.ceil(w / 720));
    let n = Math.min(visible().length, maxCols);
    if (n < minCols) n = minCols;
    return n;
  }

  /* Masonry built in dealt order: each card goes to the currently shortest
     column, so the visual flow matches the sequence — and the detail
     counter and prev/next follow what the eye sees. */
  /* Mobile filtering: lanes always visible, groups of the active lane below.
     Both rows scroll horizontally so neither ever wraps. */
  function tabsHTML() {
    const laneOf = selection.laneId;
    const chip = (active, action, label, count) => `
      <button class="chip ${active ? "is-active" : ""}" data-action="${action}">
        ${esc(label)}${count != null ? `<span class="chip__n">${count}</span>` : ""}
      </button>`;

    let lanes = chip(selection.type === "all", "select-all", "All", flat.length);
    for (const l of P.lanes) lanes += chip(laneOf === l.id, `select-lane:${l.id}`, l.name, laneCount(l.id));

    let groups = "";
    if (laneOf) {
      const lane = P.lanes.find((l) => l.id === laneOf);
      groups = chip(selection.type === "lane", `select-lane:${lane.id}`, `All ${lane.name}`, null);
      for (const g of lane.groups) {
        const on = selection.type === "group" && selection.groupId === g.id;
        groups += chip(on, `select-group:${lane.id}:${g.id}`, g.name, g.items.length);
      }
    }
    return `<nav class="tabs">
        <div class="tabs__row">${lanes}</div>
        ${groups ? `<div class="tabs__row tabs__row--sub">${groups}</div>` : ""}
      </nav>`;
  }

  /* Mobile: the group panel is a sheet, so the group needs a head of its
     own — its name, and the way into the feedback, sitting directly under
     the filter tabs where the eye lands after choosing a group. */
  function groupHeadHTML() {
    if (selection.type !== "group" || showSummary) return "";
    const lane = P.lanes.find((l) => l.id === selection.laneId);
    const group = lane.groups.find((g) => g.id === selection.groupId);
    const written = !!STORE.get("feedback", groupKey(lane.id, group.id));
    return `
      <div class="grouphead">
        <h2 class="grouphead__name">${esc(group.name)}</h2>
        <button class="grouphead__fb" data-action="panel-toggle">
          ${written ? `<i class="dot dot--blue"></i>` : ""}${written ? "Your feedback" : "Leave feedback"}
        </button>
      </div>`;
  }

  /* Utility controls sit at the foot of the page on mobile, in the open. */
  function mobileFootHTML() {
    return `<div class="mobilefoot">
        <div class="mobilefoot__acts">
          ${STUDIO ? `<button class="quiet" data-action="summary">${showSummary ? "Back to frames" : "Feedback summary"}</button>` : ""}
          <button class="quiet" data-action="export">Export feedback</button>
        </div>
      </div>`;
  }

  function mainHTML() {
    const rows = visible();
    const n = gridColumnCount();
    const cols = Array.from({ length: n }, () => ({ h: 0, html: "" }));
    for (const { item } of rows) {
      const col = cols.reduce((a, b) => (b.h < a.h ? b : a));
      col.html += `
      <button class="card" data-action="open:${item.id}" data-id="${item.id}">
        ${media(item)}
        <span class="card__dot" data-dotslot="${item.id}">${STORE.get("feedback", item.id) ? '<i class="dot dot--blue"></i>' : ""}</span>
      </button>`;
      col.h += item.h / item.w;
    }
    const grid = cols.map((c) => `<div class="grid__col">${c.html}</div>`).join("");
    return `<main class="main"><div class="grid">${grid}</div></main>`;
  }

  /* Side panel for a selected group: the thinking behind the direction,
     and feedback that applies to the whole group. */
  function groupPanelHTML() {
    if (selection.type !== "group") return "";
    const lane = P.lanes.find((l) => l.id === selection.laneId);
    const group = lane.groups.find((g) => g.id === selection.groupId);
    const gKey = groupKey(lane.id, group.id);
    return `
      <aside class="grouppanel">
        <button class="grouppanel__close" data-action="panel-close" aria-label="Close">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 4 L16 16 M16 4 L4 16" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
        </button>
        <h2 class="grouppanel__title">${esc(group.name)}</h2>
        ${ideaBlock(gKey, group.idea, "grouppanel__idea")}
        <div class="label fb-label">Your feedback</div>
        <textarea class="field" rows="4" placeholder="${GROUP_PROMPT}"
                  data-save="${gKey}">${esc(STORE.get("feedback", gKey) || "")}</textarea>
      </aside>`;
  }

  function detailHTML() {
    const rows = visible();
    const idx = rows.findIndex((r) => r.item.id === openId);
    if (idx < 0) return "";
    const { item, group, lane } = rows[idx];
    const twin = twinOf(item);
    const shown = (stageAlt && twin) ? twin : item;
    /* opened from either card, it is the same frame under the same name */
    const title = item.still && twin ? twin.title : item.title;
    const ideaKey = ideaKeyOf(item);
    /* anything written on either id before they shared a key still shows,
       from whichever card you open, and moves onto the shared key the next
       time someone saves */
    const carried = [item.id, twin && twin.id]
      .filter((k) => k && k !== ideaKey)
      .map((k) => STORE.get("idea", k))
      .find((v) => v) || "";
    const toggle = twin ? `
          <div class="stageswap">
            <button class="stageswap__btn ${shown.video ? "is-on" : ""}" data-action="stage:motion">Video</button>
            <button class="stageswap__btn ${shown.video ? "" : "is-on"}" data-action="stage:still">Still</button>
          </div>` : "";
    return `
      <div class="detail__scrim" data-overlay></div>
      <div class="detail" data-overlay>
        <div class="detail__bar">
          <button class="detail__close detail__close--pinned" data-action="close" aria-label="Close">✕</button>
        </div>
        <div class="detail__stage">
          <div class="detail__media">${media(shown, "ph--stage", true)}</div>
          ${toggle}
          <div class="detail__pager">
            <button class="quiet" data-action="prev" ${rows.length < 2 ? "disabled" : ""}>← Prev</button>
            <span class="detail__counter">${idx + 1} / ${rows.length}</span>
            <button class="quiet" data-action="next" ${rows.length < 2 ? "disabled" : ""}>Next →</button>
          </div>
        </div>
        <aside class="detail__panel">
          <div class="detail__panel-in">
            <button class="detail__close" data-action="close" aria-label="Close">✕</button>
            <h2 class="detail__title">${esc(title)}</h2>
            ${ideaBlock(ideaKey, carried || item.idea || (twin && twin.idea) || ideaFor(groupKey(lane.id, group.id), group.idea), "detail__idea")}
            <div class="label fb-label">Your feedback</div>
            <textarea class="field" rows="4" placeholder="${PROMPT}"
                      data-save="${item.id}">${esc(STORE.get("feedback", item.id) || "")}</textarea>
          </div>
        </aside>
      </div>`;
  }

  /* Every piece of feedback in one place — what the team reads. */
  function summaryHTML() {
    const fb = feedbackAll();
    const rows = [];
    for (const lane of P.lanes) for (const g of lane.groups) {
      const gKey = groupKey(lane.id, g.id);
      const gNote = fb[gKey];
      const items = g.items.filter((i) => fb[i.id]);
      if (!gNote && !items.length) continue;
      rows.push(`<div class="sum__group">
        <div class="sum__head">${esc(lane.name)} · ${esc(g.name)}</div>
        ${gNote ? `<div class="sum__row sum__row--group">
            <div class="sum__what">Whole group</div>
            <div class="sum__body">${esc(gNote)}</div>
          </div>` : ""}
        ${items.map((i) => `<div class="sum__row">
            <div class="sum__what"><button class="linkish" data-action="open:${i.id}">${esc(i.title)}</button></div>
            <div class="sum__body">${esc(fb[i.id])}</div>
          </div>`).join("")}
      </div>`);
    }
    const count = Object.keys(fb).length;
    return `<main class="main">
      <div class="sum">
        <div class="sum__title">Feedback summary</div>
        <div class="sum__sub">${count} ${count === 1 ? "entry" : "entries"} · ${esc(P.client)}</div>
        ${rows.length ? rows.join("") : `<p class="idea-empty">No feedback yet.</p>`}
      </div>
    </main>`;
  }

  /* ---------- render ---------- */
  function render() {
    const keepScroll = root.querySelector(".main")?.scrollTop || 0;
    const keepNavScroll = root.querySelector(".sidebar")?.scrollTop || 0;
    const curLabel = selection.type === "all" ? "All frames"
      : selection.type === "lane" ? P.lanes.find(l=>l.id===selection.laneId).name
      : P.lanes.find(l=>l.id===selection.laneId).groups.find(g=>g.id===selection.groupId).name;
    root.innerHTML = `
      <div class="app${panelOpen ? " panel-open" : ""}${navCollapsed ? " nav-collapsed" : ""}">
        <header class="mobilebar">
          <img class="mobilebar__logo" src="draperlogo.svg" alt="DRAPER">
          <span class="mobilebar__ctx">${esc(P.client)}</span>
        </header>
        ${tabsHTML()}
        ${groupHeadHTML()}
        <div class="panelscrim" data-action="panel-close"></div>
        ${sidebarHTML()}
        ${showSummary ? summaryHTML() : mainHTML()}
        ${showSummary ? "" : groupPanelHTML()}
        ${openId ? detailHTML() : ""}
        ${mobileFootHTML()}
      </div>`;
    const main = root.querySelector(".main");
    if (main) main.scrollTop = keepScroll;
    const nav = root.querySelector(".sidebar");
    if (nav) nav.scrollTop = keepNavScroll;
    document.body.classList.toggle("is-locked", panelOpen || !!openId);
    root.querySelectorAll(".tabs__row").forEach((row) => {
      const on = row.querySelector(".chip.is-active");
      if (on) row.scrollLeft = Math.max(0, on.offsetLeft - row.clientWidth / 2 + on.offsetWidth / 2);
    });
    if (openId) upgradeFull();
    wireVideos();
    measureBar();
  }

  /* The filter tabs stick directly under the top bar. Its height depends on
     the device's safe-area inset, so measure rather than guess. */
  function measureBar() {
    const bar = root.querySelector(".mobilebar");
    const h = bar && bar.offsetParent !== null ? bar.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty("--bar-h", `${Math.round(h)}px`);
  }

  /* Grid motion plays only while it is on screen — 26 clips all running at
     once would be pointless work. Honour a reduced-motion preference by
     leaving the poster in place. */
  const stillPlease = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let vidWatcher;
  function wireVideos() {
    const vids = root.querySelectorAll("video[data-autoplay]");
    if (!vids.length || stillPlease || !("IntersectionObserver" in window)) return;
    vidWatcher?.disconnect();
    vidWatcher = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) e.target.play?.().catch(() => {});
        else e.target.pause?.();
      }
    }, { rootMargin: "150px 0px", threshold: 0.2 });
    vids.forEach((v) => vidWatcher.observe(v));
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!openId) render(); }, 120);
  });

  /* FLIP the grid when the filter changes: cards that stay glide
     to their new spot, new ones fade in. */
  function rerenderGrid() {
    const hadPanel = !!root.querySelector(".grouppanel");
    const before = new Map();
    root.querySelectorAll(".card").forEach((c) => before.set(c.dataset.id, c.getBoundingClientRect()));
    render();
    /* Desktop only: on mobile the panel is an off-canvas sheet parked at
       translateX(102%), and animating transform here would slide it into
       view and snap it back — a flash of feedback on every group tap. */
    const panel = isMobile() ? null : root.querySelector(".grouppanel");
    if (panel && !hadPanel) panel.animate(
      [{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "none" }],
      { duration: 260, easing: "cubic-bezier(.2,.7,.2,1)" }
    );
    requestAnimationFrame(() => {
      root.querySelectorAll(".card").forEach((c) => {
        const old = before.get(c.dataset.id);
        if (old) {
          const now = c.getBoundingClientRect();
          const dx = old.left - now.left, dy = old.top - now.top;
          if (dx || dy) {
            c.animate(
              [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
              { duration: 300, easing: "cubic-bezier(.2,.7,.2,1)" }
            );
          }
        } else {
          c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
        }
      });
    });
  }

  /* Shared-element open: the frame flies from its grid slot to centre. */
  function openDetail(id, fromCard) {
    const from = fromCard && fromCard.querySelector(".ph, .ph-img")?.getBoundingClientRect();
    openId = id;
    stageAlt = false;
    render();
    const target = root.querySelector(".detail__media > *");
    const overlay = root.querySelector(".detail");
    if (overlay) overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
    if (from && target) {
      const to = target.getBoundingClientRect();
      target.style.transformOrigin = "top left";
      target.animate(
        [
          { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
          { transform: "none" },
        ],
        { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" }
      );
    }
    const panel = root.querySelector(".detail__panel-in");
    if (panel) panel.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 240, delay: 60, easing: "ease-out", fill: "backwards" }
    );
  }

  /* Close: the reverse of opening — the frame flies back to its grid slot. */
  function closeDetail() {
    const media = root.querySelector(".detail__media > *");
    const id = openId;
    openId = null;
    if (!media) { render(); return; }
    const from = media.getBoundingClientRect();
    render();
    const card = root.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    let to = null;
    if (card) {
      card.scrollIntoView({ block: "nearest" });
      to = (card.querySelector(".ph, .ph-img") || card).getBoundingClientRect();
    }
    /* white sheet fades out over the grid while the clone flies home */
    const bg = document.createElement("div");
    Object.assign(bg.style, { position: "fixed", inset: 0, background: "#fff", zIndex: 59, pointerEvents: "none" });
    document.body.appendChild(bg);
    bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease-out" })
      .finished.then(() => bg.remove()).catch(() => bg.remove());
    const clone = media.cloneNode(true);
    Object.assign(clone.style, {
      position: "fixed", left: from.left + "px", top: from.top + "px",
      width: from.width + "px", height: from.height + "px",
      margin: 0, zIndex: 60, transformOrigin: "top left", pointerEvents: "none",
    });
    document.body.appendChild(clone);
    const done = () => clone.remove();
    if (to) {
      clone.animate(
        [
          { transform: "none" },
          { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})` },
        ],
        { duration: 300, easing: "cubic-bezier(.2,.7,.2,1)" }
      ).finished.then(done).catch(done);
    } else {
      clone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 }).finished.then(done).catch(done);
    }
  }

  /* Prev / next inside the overlay: quick crossfade, no jump. */
  function step(d) {
    const rows = visible();
    const idx = rows.findIndex((r) => r.item.id === openId);
    if (idx < 0 || rows.length < 2) return;
    openId = rows[(idx + d + rows.length) % rows.length].item.id;
    stageAlt = false;
    render();
    const m = root.querySelector(".detail__media");
    const p = root.querySelector(".detail__panel-in");
    if (m) m.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: "ease-out" });
    if (p) p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: "ease-out" });
  }

  /* ---------- feedback: autosave ---------- */
  /* One toast for every save, feedback or idea — the inline flash was easy
     to miss, and on mobile it sat below the fold of the panel. */
  let toastTimer;
  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 1600);
  }

  const timers = {};
  function save(targetId, value, { flash = true } = {}) {
    const done = STORE.set("feedback", targetId, value);
    if (flash) Promise.resolve(done).then((shared) =>
      toast(shared ? "Feedback saved" : "Feedback saved on this device"));
    /* patch dots in place — no re-render, so focus is never lost */
    root.querySelectorAll(`[data-dotslot="${CSS.escape(targetId)}"]`).forEach((slot) => {
      slot.innerHTML = STORE.get("feedback", targetId) ? '<i class="dot dot--blue"></i>' : "";
    });
  }

  /* Saving happens quietly while typing; the toast waits for the field to
     be let go, and only if the words actually changed. */
  root.addEventListener("focusin", (e) => {
    const ta = e.target.closest("textarea[data-save], textarea[data-idea-save]");
    if (ta) ta.dataset.orig = ta.value;
  });
  const changed = (ta) => (ta.dataset.orig ?? "").trim() !== ta.value.trim();

  root.addEventListener("input", (e) => {
    /* the idea is deliberate — it is only written on Save, never as you type */
    if (e.target.closest("textarea[data-idea-save]")) return;
    const ta = e.target.closest("textarea[data-save]");
    if (!ta) return;
    const id = ta.dataset.save;
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => save(id, ta.value, { flash: false }), 600);
  });
  root.addEventListener("blur", (e) => {
    /* clicking away leaves the idea editor open and unsaved — losing
       someone's rewrite because they tabbed off would be worse */
    if (e.target.closest && e.target.closest("textarea[data-idea-save]")) return;
    const ta = e.target.closest && e.target.closest("textarea[data-save]");
    if (!ta) return;
    clearTimeout(timers[ta.dataset.save]);
    save(ta.dataset.save, ta.value, { flash: changed(ta) });
  }, true);

  /* Brand switch (studio only): reload the board on the chosen manifest,
     keeping the studio key so we do not drop out of studio mode. */
  root.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-brand]");
    if (!sel || sel.value === P.folder) return;
    const q = new URLSearchParams(location.search);
    q.set("project", sel.value);
    location.search = q.toString();
  });

  /* Keep the field focused while Save is pressed — otherwise blur fires
     first, the row re-renders, and the click lands on whatever replaced
     the button. */
  root.addEventListener("mousedown", (e) => {
    if (e.target.closest('[data-action^="save-idea"]')) e.preventDefault();
  });

  /* ---------- clicks ---------- */
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) {
      const [verb, a, b] = el.dataset.action.split(":");
      if (verb === "nav-toggle") {
        navCollapsed = !navCollapsed;
        localStorage.setItem("draper-review:nav", navCollapsed ? "collapsed" : "open");
        render(); return;
      }
      if (verb === "panel-toggle") { panelOpen = !panelOpen; render(); return; }
      if (verb === "panel-close")  { panelOpen = false; render(); return; }
      if (verb === "select-all")   { selection = { type: "all" }; openId = null; if (isMobile()) panelOpen = false; rerenderGrid(); }
      if (verb === "select-lane")  { selection = { type: "lane", laneId: a }; openId = null; if (isMobile()) panelOpen = false; rerenderGrid(); }
      if (verb === "select-group") { selection = { type: "group", laneId: a, groupId: b }; openId = null; if (isMobile()) panelOpen = false; rerenderGrid(); }
      if (verb === "stage") {
        /* the opened frame stays the one being commented on — this only
           changes which of the two versions the stage is showing */
        const cur = itemById(openId);
        stageAlt = (a === "motion") ? !cur?.video : !!cur?.video;
        render(); return;
      }
      if (verb === "open")   openDetail(a, el);
      if (verb === "close")  closeDetail();
      if (verb === "prev")   step(-1);
      if (verb === "next")   step(1);
      if (verb === "save-idea") {
        const key = b !== undefined ? `${a}:${b}` : a;
        const ta = root.querySelector(`textarea[data-idea-save="${CSS.escape(key)}"]`);
        if (ta) {
          const moved = changed(ta);
          const done = STORE.set("idea", key, ta.value);
          if (moved) Promise.resolve(done).then((shared) =>
            toast(shared ? "Saved" : "Saved on this device"));
        }
        editingIdea = null;
        render(); return;
      }
      if (verb === "edit-idea") {
        editingIdea = b !== undefined ? `${a}:${b}` : a;
        render();
        const ta = root.querySelector("textarea[data-idea-save]");
        if (ta) { ta.dataset.orig = ta.value; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      }
      if (verb === "summary") { showSummary = !showSummary; openId = null; render(); }
      if (verb === "export") STORE.exportAsFile(P);
      return;
    }
    if (e.target.matches("[data-overlay], .detail__stage")) closeDetail();
  });

  /* swipe left/right inside the detail view */
  let tx = 0, ty = 0;
  let swipeOk = false;
  root.addEventListener("touchstart", (e) => {
    if (!openId || !e.touches[0]) return;
    /* Selecting a word in the idea or the feedback drags horizontally too.
       Judge by where the finger went down, not by what happens to be
       focused — the first tap of a double-tap has not focused anything
       yet, and paging the frame out from under a selection reads as the
       board breaking. */
    swipeOk = !e.target.closest(".detail__panel, textarea, button, input, select");
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  root.addEventListener("touchend", (e) => {
    if (!openId || !swipeOk || !e.changedTouches[0]) return;
    if (document.activeElement && document.activeElement.tagName === "TEXTAREA") return;
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  window.addEventListener("keydown", (e) => {
    if (!openId) return;
    if (e.key === "Escape") { closeDetail(); return; }
    if (document.activeElement && document.activeElement.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
  });

  /* boot */
  (async () => {
    await STORE.boot(P);
    render();
    STORE.onChange(() => { if (!editingIdea && document.activeElement?.tagName !== "TEXTAREA") render(); });
    STORE.startPolling(() => !!editingIdea || document.activeElement?.tagName === "TEXTAREA");
  })();
})();
