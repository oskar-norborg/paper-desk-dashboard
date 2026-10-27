/* DESK paper terminal — read-only renderer for desk_state.json. PAPER ONLY. No orders, no keys. */
(function () {
  "use strict";
  const IS_PUBLIC = document.body?.dataset?.public === "1" || /github\.io$/i.test(location.hostname);
  const $ = (id) => document.getElementById(id);
  const G = "#22c55e", R = "#ef4444", A = "#f59e0b";
  const num = (n, d = 2) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const usd = (n, sign) => {
    if (n === null || n === undefined || isNaN(n)) return "—";
    const s = "$" + num(Math.abs(n));
    return (n < 0 ? "-" : sign && n > 0 ? "+" : "") + s;
  };
  const pct = (n) => (n == null || isNaN(n) ? "—" : (n > 0 ? "+" : "") + Number(n).toFixed(2) + "%");
  const cls = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "flat");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = (iso, withDay = true) => {
    const d = new Date(String(iso).length === 10 ? iso + "T00:00:00-03:00" : iso);
    if (isNaN(d)) return esc(iso);
    const o = { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false };
    if (withDay) Object.assign(o, { month: "short", day: "2-digit" });
    return d.toLocaleString("en-US", o);
  };
  const shortTime = (iso) => {
    const d = new Date(String(iso).length === 10 ? iso + "T00:00:00-03:00" : iso);
    if (isNaN(d)) return esc(iso);
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const g = (t) => (f.find((x) => x.type === t) || {}).value;
    return `${g("month")}/${g("day")} ${g("hour")}:${g("minute")}`;
  };
  let chart = null, feedFilter = "all", STATE = null;

  async function loadState() {
    for (const url of ["./desk_state.json", "../desk_state.json"]) {
      try {
        const r = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
        if (r.ok) return { state: await r.json(), source: url.replace("./", "dashboard/").replace("../", "") };
      } catch (e) { /* file:// blocks fetch; fall through */ }
    }
    if (window.DESK_STATE) return { state: window.DESK_STATE, source: "desk_state.js (file://)" };
    throw new Error("no state");
  }

  function showError() {
    const el = $("error"); el.classList.remove("hidden");
    el.innerHTML = "Could not load desk_state.json.<br>Run <code>/workspace/desk/scripts/refresh_desk_state.sh</code>, then serve the desk:<br>" +
      "<code>cd /workspace/desk &amp;&amp; python3 scripts/desk_server.py</code> → <code>http://127.0.0.1:8765/dashboard/</code>";
  }

  function renderHeader(s) {
    const ap = s.approval || {}, p = s.paper || {}, q = s.quotes || {};
    const n = ap.pending_count || 0;
    const lu = $("lastUpdated"); if (lu) lu.textContent = "last updated: " + fmtTime(s.updated_at, true) + " BRT";
    const pill = $("approvalPill");
    const auto = ap.mode === "auto" || ap.required === false;
    pill.textContent = auto
      ? `⚡ AUTO-FILL ON · ${ap.auto_fill_count || 0} filled · ${n ? n + " not filled (revise/blocked)" : "queue clear"}`
      : (n ? `⚠ ${n} card${n > 1 ? "s" : ""} awaiting approval` : "✓ approval queue clear");
    pill.className = "pill " + (n ? "warn" : "ok");
    const paused = p.paused ?? (p.day_pnl <= p.daily_loss_pause);
    const pp = $("pausePill");
    pp.textContent = paused ? "■ DAILY LOSS PAUSE — no new proposals" : "risk: clear to propose";
    pp.className = "pill " + (paused ? "bad" : "ok");
    $("quotesMeta").innerHTML = `quotes <b class="${q.ok === q.total ? "pos" : "neg"}">${q.ok ?? 0}/${q.total ?? 0}</b> yahoo·display` + (q.stale ? ` · ${q.stale} stale` : "");
    $("updated").textContent = "upd " + fmtTime(s.updated_at) + " BRT";
    // ticker tape (duplicated for seamless loop)
    const t = (s.watchlist || []).map((w) => `<span><b>${esc(w.symbol)}</b>${w.last == null ? "—" : num(w.last)} <i class="${cls(w.change_pct)}">${pct(w.change_pct)}</i></span>`).join("");
    $("tapeInner").innerHTML = t + t;
  }

  function renderMetrics(s) {
    const p = s.paper || {}, ap = s.approval || {};
    const m = (l, v, sub, c = "", big = false) => `<div class="m${big ? " big" : ""}"><div class="l">${l}</div><div class="v ${c}">${v}</div><div class="s">${sub || "&nbsp;"}</div></div>`;
    const ret = p.starting_equity ? (p.equity / p.starting_equity - 1) * 100 : 0;
    $("metrics").innerHTML = [
      m("Paper equity · USD", usd(p.equity), `<span class="${cls(p.day_pnl)}">${usd(p.day_pnl, true)} (${pct(p.day_pnl_pct)}) today</span> · since start <span class="${cls(ret)}">${pct(ret)}</span>`, "", true),
      m("Day P&amp;L", usd(p.day_pnl, true), pct(p.day_pnl_pct), cls(p.day_pnl)),
      m("Unrealized", usd(p.unrealized_pnl, true), "mark-to-market", cls(p.unrealized_pnl)),
      m("Realized", usd(p.realized_pnl, true), "closed cards", cls(p.realized_pnl)),
      m("Cash", usd(p.cash), "paper ledger"),
      m("Open pos", `${p.open_positions ?? 0}/${p.max_open ?? 3}`, "max per rules", (p.open_positions ?? 0) >= (p.max_open ?? 3) ? "neg" : ""),
      m("Max risk/trade", usd(p.max_risk_per_trade), "1% of equity"),
      m("Loss pause", usd(p.daily_loss_pause), p.paused ? '<span class="neg">PAUSED</span>' : '<span class="pos">clear</span>'),
      m("Auto-fills", String(ap.auto_fill_count ?? 0), `${ap.auto_reject_count ?? 0} auto-rejected · ${ap.pending_count ?? 0} not filled`, (ap.auto_fill_count ? "pos" : ""), false),
    ].join("");
  }

  function renderCurve(s) {
    const pts = (s.equity_curve || []).slice();
    const p = s.paper || {};
    $("curveMeta").innerHTML = `${pts.length} pts · start ${usd(p.starting_equity)} · day <span class="${cls(p.day_pnl)}">${usd(p.day_pnl, true)}</span>`;
    let labels = pts.map((x) => fmtTime(x.t)), data = pts.map((x) => x.equity), kinds = pts.map((x) => x.kind || "mark");
    if (pts.length === 1) { labels = ["start", labels[0]]; data = [p.starting_equity ?? data[0], data[0]]; kinds = ["start", kinds[0]]; }
    const canvas = $("equityChart");
    const up = data.length < 2 || data[data.length - 1] >= data[0];
    const col = up ? G : R;
    if (!window.Chart) { drawLine(canvas, data, col, true); return; }
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 250);
    grad.addColorStop(0, up ? "rgba(34,197,94,0.30)" : "rgba(239,68,68,0.30)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    const base = p.starting_equity ?? data[0];
    const mn = Math.min(...data, base), mx = Math.max(...data, base), pad = Math.max((mx - mn) * 0.15, base * 0.002);
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [
        { data, borderColor: col, backgroundColor: grad, fill: true, borderWidth: 2, tension: 0.2, stepped: false,
          pointRadius: data.map((_, i) => (kinds[i] === "open" || kinds[i] === "close" ? 5 : data.length > 40 ? 0 : 2.5)),
          pointStyle: kinds.map((k) => (k === "open" ? "triangle" : k === "close" ? "rectRot" : "circle")),
          pointBackgroundColor: kinds.map((k) => (k === "open" || k === "close" ? A : col)) },
        { data: data.map(() => base), borderColor: "rgba(148,163,184,0.35)", borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false },
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        plugins: { legend: { display: false },
          tooltip: { backgroundColor: "#05070a", borderColor: "#243246", borderWidth: 1, titleFont: { family: "monospace" }, bodyFont: { family: "monospace" },
            filter: (c) => c.datasetIndex === 0,
            callbacks: { label: (c) => ` ${usd(c.parsed.y)} · ${kinds[c.dataIndex]}` } } },
        scales: {
          x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#6b7789", font: { family: "monospace", size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { min: mn - pad, max: mx + pad, grid: { color: "rgba(255,255,255,0.04)" },
            ticks: { color: "#6b7789", font: { family: "monospace", size: 10 }, callback: (v) => "$" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }) } },
        },
      },
    });
  }

  function drawLine(canvas, data, color, fill) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 120, h = canvas.clientHeight || 30;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    if (!data || data.length < 2) return;
    const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1, pad = 2;
    const xy = data.map((v, i) => [pad + (i * (w - 2 * pad)) / (data.length - 1), h - pad - ((v - min) / rng) * (h - 2 * pad)]);
    ctx.beginPath(); xy.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke();
    if (fill) {
      ctx.lineTo(xy[xy.length - 1][0], h); ctx.lineTo(xy[0][0], h); ctx.closePath();
      ctx.fillStyle = color === R ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)"; ctx.fill();
    }
    const [lx, ly] = xy[xy.length - 1];
    ctx.beginPath(); ctx.arc(lx, ly, 2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }

  function renderSide(s) {
    const ap = s.approval || {}, ds = s.decisions || [];
    const pend = ds.filter((d) => (ap.pending_ids || []).includes(d.id));
    $("approvalQueue").innerHTML = pend.length ? pend.map((d) => `<div class="qi"><div class="qh"><span><b>${esc(d.symbol)}</b> ${esc((d.direction || "").toUpperCase())} · rec ${esc(d.recommend || "—")}</span><span>risk ${d.dollar_risk != null ? usd(d.dollar_risk) : "—"} · score ${d.risk_score ?? "—"}/5</span></div>
      <div>entry ${num(d.entry_plan)} · stop ${num(d.stop)} · tgt ${num(d.target)} · ${d.planned_size ?? "—"} sh · <a href="../${esc(d.file)}" target="_blank">${esc(d.id)}</a></div>
      <div class="cmd">${d.decision_note ? esc(d.decision_note) : "awaiting risk check → auto-fill on PASS (scripts/auto_fill_pending.sh)"}</div></div>`).join("")
      : `<div class="none">&gt; queue clear · cards auto-fill when all hard rules PASS</div>`;
    const la = ap.last_auto_fill, lx = ap.last_auto_action;
    $("queueMeta").innerHTML = (la ? `last auto-fill: ${esc(la.symbol || "")} ${esc(la.card_id || "")} @ ${fmtTime(la.t)} BRT`
      : "no auto-fills yet") + (lx && lx !== la && lx.action !== "auto_fill" ? ` · last: ${esc((lx.action || "").replace("auto_", "auto-"))} ${esc(lx.card_id || "")}` : "");
    const ps = s.positions || [];
    $("posMeta").textContent = `${ps.length}/${(s.paper || {}).max_open ?? 3} open`;
    $("positions").innerHTML = ps.length ? `<table class="ptable"><tr><th>Sym</th><th>Side</th><th class="r">Size</th><th class="r">Entry</th><th class="r">Mark</th><th class="r">Stop</th><th class="r">Tgt</th><th class="r">uP&amp;L</th><th class="r">R</th></tr>` +
      ps.map((x) => `<tr title="${esc(x.card_id)} · risk ${usd(x.risk_dollars)} · mark ${esc(x.mark_source)}"><td><b>${esc(x.symbol)}</b></td><td class="${x.direction === "short" ? "neg" : "pos"}">${esc((x.direction || "").toUpperCase())}</td>
        <td class="r">${num(x.size, 0)}</td><td class="r">${num(x.entry)}</td><td class="r">${num(x.mark)}</td><td class="r neg">${num(x.stop)}</td><td class="r pos">${num(x.target)}</td>
        <td class="r ${cls(x.unrealized_pnl)}">${usd(x.unrealized_pnl, true)}</td><td class="r ${cls(x.r_multiple)}">${x.r_multiple ?? "—"}</td></tr>`).join("") + "</table>"
      : '<div class="empty">&gt; flat — no open paper positions_</div>';
  }

  function renderWatchlist(s) {
    const items = s.watchlist || [], box = $("watchlist");
    const q = s.quotes || {};
    $("watchMeta").textContent = `${q.ok ?? 0}/${q.total ?? items.length} live-ish · ~12d closes · display only`;
    const cardSyms = new Set((s.decisions || []).filter((d) => ["pending", "approved", "revised"].includes(d.status)).map((d) => d.symbol));
    if (!items.length) { box.innerHTML = '<div class="empty">No symbols in WATCHLIST.md</div>'; return; }
    box.innerHTML = items.map((w, i) => {
      const c = w.change_pct;
      return `<div data-sym="${esc(w.symbol)}" class="wcard ${c > 0 ? "up" : c < 0 ? "dn" : ""} ${cardSyms.has(w.symbol) ? "hasCard" : ""}" title="${esc(w.name)}${w.quote_time ? " · quote " + fmtTime(w.quote_time) + " BRT" : ""}${cardSyms.has(w.symbol) ? " · active decision card" : ""} · click to run a paper ticker review">
        <div class="wtop"><span class="wsym">${esc(w.symbol)}</span><span class="wchg ${c == null ? "muted" : cls(c)}">${pct(c)}</span></div>
        <div class="wname">${esc(w.name)}</div><canvas id="spark${i}"></canvas>
        <div class="wlast"><span>${w.last == null ? "no quote" : num(w.last)}</span><span class="muted">${w.placeholder ? "placeholder" : w.stale ? "stale" : esc(w.sector || "")}</span></div></div>`;
    }).join("");
    items.forEach((w, i) => {
      const sp = w.spark || [];
      let up = sp.length < 2 || sp[sp.length - 1] >= sp[0];
      if (w.change_pct != null) up = Number(w.change_pct) >= 0;
      drawLine($("spark" + i), sp, up ? G : R, true);
    });
  }

  function heat(c) {
    if (c == null) return "#1e293b";
    const k = Math.min(Math.abs(c) / 3, 1);
    return c >= 0 ? `rgba(34,197,94,${0.25 + 0.6 * k})` : `rgba(239,68,68,${0.25 + 0.6 * k})`;
  }

  function renderNetwork(s) {
    const svg = $("network"), tip = $("netTip");
    const net = s.network || { nodes: [], edges: [] };
    const W = 420, H = 270, pos = {};
    const nodes = net.nodes || [];
    const stocks = nodes.filter((n) => n.type === "stock"), etfs = nodes.filter((n) => n.type === "etf"), cards = nodes.filter((n) => n.type === "card");
    // fixed layout: SPY left hub, QQQ center hub, mega-caps on an arc around QQQ
    const hub = { SPY: [62, 135], QQQ: [235, 135] };
    etfs.forEach((n, i) => (pos[n.id] = hub[n.id] || [62 + i * 170, 135]));
    const cx = 235, cy = 135, rad = 98;
    stocks.forEach((n, i) => {
      const a = (-115 + (230 * i) / Math.max(stocks.length - 1, 1)) * Math.PI / 180;
      pos[n.id] = [cx + rad * Math.cos(a) * 1.25, cy + rad * Math.sin(a)];
    });
    const perSym = {};
    cards.forEach((n) => {
      const base = pos[n.symbol]; if (!base) return;
      const k = (perSym[n.symbol] = (perSym[n.symbol] || 0) + 1);
      const [bx, by] = base, ref = n.symbol === "SPY" ? [bx + 40, by + 200] : [cx, cy];
      let dx = bx - ref[0], dy = by - ref[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      pos[n.id] = [Math.max(10, Math.min(W - 10, bx + dx * (30 + 14 * k) + (k - 1) * 10)), Math.max(10, Math.min(H - 10, by + dy * (30 + 14 * k)))];
    });
    const stCol = { pending: A, approved: G, closed: "#38bdf8", rejected: R, revised: "#a78bfa" };
    let h = "";
    (net.edges || []).forEach((e) => {
      const a = pos[e.source], b = pos[e.target]; if (!a || !b) return;
      const c = e.kind === "card" ? "edge card" : e.target === "SPY" ? "edge spy" : "edge";
      h += `<line class="${c}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
    });
    const tipData = {};
    nodes.forEach((n) => {
      const p = pos[n.id]; if (!p) return;
      if (n.type === "card") {
        tipData[n.id] = `${n.id} · ${n.direction || ""} · ${n.status}`;
        h += `<rect class="node" data-id="${esc(n.id)}" x="${p[0] - 6}" y="${p[1] - 6}" width="12" height="12" rx="2" fill="#1a1405" stroke="${stCol[n.status] || "#64748b"}" stroke-width="1.6"/>`;
      } else {
        const r = n.type === "etf" ? 21 : 15;
        tipData[n.id] = `${n.id} · ${n.sector || n.type} · day ${pct(n.change_pct)}`;
        h += `<circle class="node" data-id="${esc(n.id)}" cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${n.type === "etf" ? "#0b2a42" : heat(n.change_pct)}" stroke="${n.type === "etf" ? "#38bdf8" : "#0e131b"}" stroke-width="${n.type === "etf" ? 1.6 : 1}"/>`;
        h += `<text x="${p[0]}" y="${p[1] + 3}" text-anchor="middle" font-weight="700">${esc(n.id)}</text>`;
        if (n.type === "etf") h += `<text x="${p[0]}" y="${p[1] + r + 11}" text-anchor="middle" style="fill:#6b7789">${pct(n.change_pct)}</text>`;
      }
    });
    svg.innerHTML = h;
    svg.querySelectorAll(".node").forEach((el) => {
      el.addEventListener("mousemove", (ev) => {
        const box = svg.parentElement.getBoundingClientRect();
        tip.textContent = tipData[el.dataset.id] || el.dataset.id; tip.classList.remove("hidden");
        tip.style.left = ev.clientX - box.left + 10 + "px"; tip.style.top = ev.clientY - box.top + 10 + "px";
      });
      el.addEventListener("mouseleave", () => tip.classList.add("hidden"));
    });
  }

  function renderDecisions(s) {
    const ds = s.decisions || [], box = $("decisions");
    const counts = ds.reduce((a, d) => ((a[d.status] = (a[d.status] || 0) + 1), a), {});
    $("decMeta").textContent = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ") || "none";
    const known = ["pending", "approved", "rejected", "closed", "revised"];
    box.innerHTML = ds.length ? ds.map((d) => {
      const st = known.includes(d.status) ? d.status : "unknown", dir = (d.direction || "").toLowerCase();
      const fillTxt = d.fill ? `fill ${num(d.fill)}×${num(d.size, 0)}` : `plan ${num(d.entry_plan)} / stop ${num(d.stop)}`;
      const pnl = d.realized_pnl != null ? ` · <span class="${cls(d.realized_pnl)}">${usd(d.realized_pnl, true)}</span>` : "";
      return `<div class="dr"><div><span class="dsym">${esc(d.symbol || "?")}</span>${dir ? `<span class="dir ${esc(dir)}">${esc(dir.toUpperCase())}</span>` : ""}<span class="muted">rec ${esc(d.recommend || "—")} · score ${d.risk_score ?? "—"}/5</span></div>
        <span class="chip ${st}">${esc(d.status || "unknown")}</span>
        <div class="did"><a href="../${esc(d.file)}" target="_blank">${esc(d.id)}</a> · ${fillTxt}${pnl}</div><div></div>
        ${d.lesson ? `<div class="dlesson">✎ ${esc(d.lesson)}</div>` : ""}</div>`;
    }).join("") : '<div class="empty">No decision cards yet.</div>';
  }

  function renderResearch(s) {
    const r = s.research || {}, box = $("research");
    if (!r.available || !r.latest) { box.innerHTML = `<div class="empty">&gt; no research drop yet · bot writes to <code>research/daily_YYYY-MM-DD.md</code></div>`; return; }
    const L = r.latest;
    box.innerHTML = `<div class="rt">${esc(L.title)}</div><div class="rf">${fmtTime(L.t)} BRT · ${r.files} file(s) · <a href="../${esc(L.file)}" target="_blank">${esc(L.file)}</a>${L.placeholder ? " · placeholder" : ""}</div>
      <div class="rs">${esc(L.summary || "")}</div><div class="rsym">${(L.symbols || []).map((x) => `<span>${esc(x)}</span>`).join("")}</div>
      <div class="rf">facts only · Desk Lead cites it in the morning brief · no buy/sell/hold</div>`;
  }

  const KINDS = ["all", "auto", "human", "review", "card", "risk", "equity", "lesson", "research", "journal", "brief", "quotes"];
  function renderFilters() {
    $("filters").innerHTML = KINDS.map((k) => `<button data-k="${k}" class="${k === feedFilter ? "on" : ""}">${k}</button>`).join("");
    $("filters").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { feedFilter = b.dataset.k; renderFilters(); renderActivity(STATE); }));
  }
  function renderActivity(s) {
    const box = $("activity");
    const a = (s.activity || []).filter((x) => feedFilter === "all" || x.kind === feedFilter);
    if (!a.length) { box.innerHTML = '<div class="empty">&gt; no events_</div>'; return; }
    box.innerHTML = a.map((x) => `<div class="fline"><span class="ft">${shortTime(x.t)}</span><span class="fk ${esc(x.kind)}">${esc(x.kind)}</span><span class="fx">${x.symbol ? `<b>${esc(x.symbol)}</b> ` : ""}${esc(x.text)}</span></div>`).join("");
  }

  // ---- Ticker review (PAPER ONLY · temporary review · never auto-fills) ----
  let shownReview = null, reviewBusy = false;
  const API = "/api/ticker-review";
  const oc = (o) => (o === "PASS" ? "pass" : o === "FAIL" ? "fail" : "nd");
  function setStatus(txt, kind) { const el = $("reviewStatus"); el.textContent = txt; el.className = "rv-status " + kind; }
  function renderReviewCard(r) {
    const box = $("tickerReviewCard");
    if (!r) { box.innerHTML = '<div class="empty">&gt; no ticker review yet — enter a ticker or click a chip_</div>'; return; }
    const L = r.levels, S = r.sizing, q = r.quote || {}, rs = r.research || {};
    const lv = L ? `<table class="ptable rv-lv">
        <tr><th>Entry zone</th><td>${num(L.entry_zone[0])}–${num(L.entry_zone[1])} <span class="muted">ref ${num(L.entry)}</span></td></tr>
        <tr><th>Stop</th><td class="neg">${num(L.stop)}</td></tr><tr><th>Target</th><td class="pos">${num(L.target)}</td></tr>
        <tr><th>Invalidation</th><td class="wrap">${esc(L.invalidation)}</td></tr>
        <tr><th>Levels</th><td class="wrap ${L.illustrative ? "amb" : "muted"}">${esc(L.source)}</td></tr></table>` : "";
    const sz = S ? `<div class="rv-size">size <b>${S.proposed_shares} sh</b> · risk ${usd(S.risk_dollars)} · notional ${usd(S.notional)}${S.capped ? ` · <span class="amb">capped from ${S.raw_shares_rule1} sh (rule 9/10)</span>` : ""}</div>` : "";
    const ck = (r.checks || []).map((c) => `<li class="${c.ok ? "ok" : "bad"}"><span class="ck">${c.ok ? "✓" : "✗"}</span><b>R${esc(c.rule)}</b> ${esc(c.label)}<div class="cd">${esc(c.detail)}</div></li>`).join("");
    box.innerHTML = `<div class="rv-head"><div><span class="rv-sym">${esc(r.symbol)}</span><span class="dir ${esc(r.direction)}">${esc((r.direction || "").toUpperCase())}</span>
        <span class="muted">${q.last != null ? "last " + num(q.last) + " " : ""}${q.change_pct != null ? `<i class="${cls(q.change_pct)}">${pct(q.change_pct)}</i>` : ""}</span></div>
        <span class="rv-out ${oc(r.outcome)}">${esc(r.outcome)}</span></div>
      <div class="rv-meta">${esc(r.id)} · ${fmtTime(r.t)} BRT · risk score <b>${r.risk_score ?? "—"}/5</b> — ${esc(r.risk_score_reason || "")}</div>
      <div class="rv-thesis">${esc(r.thesis || "")}</div>
      <div class="rv-cols"><div>${lv}${sz}</div><ul class="rv-checks">${ck || '<li class="bad"><span class="ck">?</span>no rule checks — missing data</li>'}</ul></div>
      <div class="rv-reasons">${(r.reasons || []).map((x) => `<div>• ${esc(x)}</div>`).join("")}</div>
      <div class="rv-foot">src: ${rs.file ? ((IS_PUBLIC ? `<code>${esc(rs.file)}</code>` : `<a href="../${esc(rs.file)}" target="_blank">${esc(rs.file)}</a>`) + ` (${fmtTime(rs.t)} BRT)`) : "no research file"}${rs.note ? " · " + esc(rs.note) : ""} · quote Yahoo public chart (display only) · ${IS_PUBLIC ? `<code>${esc(r.file || "")}</code>` : `<a href="../${esc(r.file)}" target="_blank">${esc(r.file)}</a>`}</div>
      <div class="rv-warn">PAPER ONLY · temporary review · does NOT auto-fill · say <b>“auto-fill this review”</b> in chat to promote it to a real decision card (re-checked then)</div>`;
  }
  function renderReviews(s) {
    const tr = s.ticker_reviews || {};
    $("reviewChips").innerHTML = (s.watchlist || []).map((w) => `<button type="button" class="rv-chip" data-sym="${esc(w.symbol)}">${esc(w.symbol)}</button>`).join("");
    $("reviewChips").querySelectorAll(".rv-chip").forEach((b) => b.addEventListener("click", () => runReview(b.dataset.sym)));
    $("reviewRecent").innerHTML = (tr.recent || []).length ? tr.recent.map((x) => `<div class="rv-ri" data-id="${esc(x.id)}"><span>${shortTime(x.t)}</span><b>${esc(x.symbol)}</b><span class="muted">${esc(x.direction || "")}</span><span class="rv-out sm ${oc(x.outcome)}">${esc(x.outcome)}</span><span class="muted">${x.risk_score ?? "—"}/5</span>${IS_PUBLIC ? "" : `<a href="../${esc(x.file)}" target="_blank">md</a>`}</div>`).join("")
      : '<div class="empty">none yet</div>';
    if (!shownReview || (tr.latest && tr.latest.id !== shownReview.id && tr.latest.t > shownReview.t)) shownReview = tr.latest || null;
    renderReviewCard(shownReview);
  }
  async function runReview(sym) {
    if (reviewBusy) return;
    if (IS_PUBLIC) { setStatus("public page is read-only — open local desk to run a new ticker review", "err"); return; }
    sym = String(sym || "").trim().toUpperCase().replace(/^\$/, "");
    if (!/^[A-Z]{1,5}$/.test(sym)) { setStatus("error · ticker must be 1–5 letters A–Z", "err"); return; }
    $("reviewInput").value = sym;
    if (location.protocol === "file:") { setStatus("error · reviews need the desk server: python3 scripts/desk_server.py → http://127.0.0.1:8765/dashboard/", "err"); return; }
    reviewBusy = true; $("reviewBtn").disabled = true;
    setStatus(`reviewing ${sym}… (quote + research + hard rules, then state refresh)`, "busy");
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, direction: $("reviewDir").value }) });
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) throw new Error(r.status === 501 || r.status === 404 || r.status === 405 ? "API missing — restart with scripts/desk_server.py on 8765 (plain http.server can't run reviews)" : "HTTP " + r.status);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "review failed");
      shownReview = j.review; renderReviewCard(j.review);
      setStatus(`done · ${j.review.symbol} → ${j.review.outcome} · ${j.review.risk_score}/5 · not filled · ${fmtTime(j.review.t)} BRT`, "done");
      load();
    } catch (e) {
      setStatus("error · " + (e.message === "Failed to fetch" ? "server unreachable — start scripts/desk_server.py on 8765" : e.message), "err");
    } finally { reviewBusy = false; $("reviewBtn").disabled = false; }
  }
  $("reviewForm").addEventListener("submit", (e) => { e.preventDefault(); runReview($("reviewInput").value); });
  $("watchlist").addEventListener("click", (e) => { const c = e.target.closest(".wcard"); if (c && c.dataset.sym) runReview(c.dataset.sym); });

  function renderAll(state, source) {
    STATE = state;
    $("source").textContent = "src " + source;
    renderHeader(state); renderMetrics(state); renderCurve(state); renderSide(state);
    renderWatchlist(state); renderNetwork(state); renderDecisions(state); renderResearch(state);
    renderReviews(state); renderFilters(); renderActivity(state);
  }
  function load() { loadState().then(({ state, source }) => renderAll(state, source)).catch(showError); }
  $("reload").addEventListener("click", load);
  load();
  setInterval(load, IS_PUBLIC ? 60 * 1000 : 5 * 60 * 1000); // re-read local state every 5 min (no network calls beyond the file)
})();
