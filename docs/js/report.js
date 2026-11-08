/* =========================================================
   report.js  -  the single-page report (Power BI style)
   ---------------------------------------------------------
   R.f        current filters (year, measure, sex, age, road user, remoteness)
   R.set()    changes one filter, then every visual and KPI updates
   R.tile()   wires a visual: title, filter context, Focus / Data / CSV / PNG
   R.kpi()    draws a KPI card with its number, change since 2011 and sparkline
   Pages 1 to 4 use the national file, page 5 the state file,
   page 6 the First Nations file, page 7 is the notes page.
   Clicking a bar or point "cross-filters" the page, like Power BI:
   click once to filter, click the same thing again to clear it.
   ========================================================= */

const R = {
  FIRST: 2011,
  LAST: 2021,
  f: { year: 2021, measure: "hosp", sex: "All", age: "All", ru: "All", area: "All" },
  page: 1,
  tiles: [],
  kpis: [],
  timer: null,
  PAGES: [
    { n: 1, label: "Overview" },
    { n: 2, label: "Age and sex" },
    { n: 3, label: "Road users" },
    { n: 4, label: "Hospital stay" },
    { n: 5, label: "States" },
    { n: 6, label: "First Nations" },
    { n: 7, label: "About the data" },
  ],
  // which slicers make sense on each page (others are greyed out)
  USES: {
    1: ["measure", "sex", "age", "ru", "area"],
    2: ["measure", "sex", "ru", "area"],
    3: ["measure", "sex", "age", "area"],
    4: ["sex", "ru", "area"],
    5: ["measure"],
    6: ["measure"],
    7: [],
  },
};

/* Tutor and peer feedback: no "Other", "Unknown" or "Not stated" data on screen.
   Records with an unknown age, sex, road user or remoteness area are left out
   when the data loads (about 3%), and the counterparty chart leaves out
   crashes with no recorded counterparty. */
R.AREAS = ["Major Cities", "Regional", "Remote"];
R.areaLabel = (a) => a;
R.CP = {
  "Car, pick-up truck or van": "Car, ute or van",
  "Non-collision transport accident": "No collision",
  "Fixed or stationary object": "Fixed object",
  "Heavy transport vehicle or bus": "Truck or bus",
  "Pedestrian or animal": "Pedestrian or animal",
  "2- or 3- wheeled motor vehicle": "Motorbike",
  "Pedal cycle": "Bicycle",
  "Other non-motor vehicle": "Non-motor vehicle",
  Train: "Train",
};

/* ---------- small helpers ---------- */
R.M = () => (R.f.measure === "hosp" ? "Hospitalised injuries" : "Bed days");
R.m = () => (R.f.measure === "hosp" ? "hospitalised injuries" : "bed days");
R.K = () => (R.f.measure === "hosp" ? "Injuries" : "Bed days"); // short label for KPI cards
R.v = (d) => (R.f.measure === "hosp" ? d.hosp : d.bed);
R.fmtS = (v) => (Math.abs(v) >= 10000 ? d3.format(".3~s")(v).replace("G", "B") : App.fmt(Math.round(v)));
R.pts = (v) => (v > 0 ? "+" : "") + d3.format(".1f")(v) + " pts";
R.change = (now, base) => (base ? ((now - base) / base) * 100 : 0);
R.ageKey = () => (R.f.age === "All" ? "65+" : R.f.age); // road user page: older people unless another age is picked
R.ageLabel = (a) => (a === "All" ? "All ages" : a === "65+" ? "Aged 65+" : a === "Under 65" ? "Under 65" : "Aged " + a);
R.ageMatch = (d, a) => a === "All" || (a === "65+" ? d.older : a === "Under 65" ? !d.older : d.age === a);

/* Does a data row pass the current filters? skip = filters this visual ignores
   (a visual never filters itself; it highlights the selection instead). */
R.keep = (d, skip = []) =>
  (skip.includes("sex") || R.f.sex === "All" || d.sex === R.f.sex) &&
  (skip.includes("age") || R.ageMatch(d, R.f.age)) &&
  (skip.includes("ru") || R.f.ru === "All" || d.ru === R.f.ru) &&
  (skip.includes("area") || R.f.area === "All" || d.area === R.f.area);

/* Sums the measure over the cube. by(d) gives the group key. */
R.q = ({ skip = [], year = null, by = () => "all", value = R.v, where = null } = {}) => {
  const out = new Map();
  for (const d of R.cube) {
    if (year !== null && d.year !== year) continue;
    if (!R.keep(d, skip)) continue;
    if (where && !where(d)) continue;
    const k = by(d);
    out.set(k, (out.get(k) || 0) + value(d));
  }
  return out;
};
R.one = (opts) => R.q(opts).get("all") || 0;

/* The filter context line under each visual title, so a filtered number is never mistaken for the total. */
R.ctx = ({ years = false, skip = [], extra = "" } = {}) => {
  const bits = [years ? "2011 to 2021" : `<b>${R.f.year}</b>`];
  const uses = R.USES[R.page] || [];
  if (uses.includes("sex") && !skip.includes("sex") && R.f.sex !== "All") bits.push(`<b>${R.f.sex}</b>`);
  if (uses.includes("age") && !skip.includes("age") && R.f.age !== "All") bits.push(`<b>${R.ageLabel(R.f.age)}</b>`);
  if (uses.includes("ru") && !skip.includes("ru") && R.f.ru !== "All") bits.push(`<b>${R.f.ru}</b>`);
  if (uses.includes("area") && !skip.includes("area") && R.f.area !== "All") bits.push(`<b>${R.areaLabel(R.f.area)}</b>`);
  if (extra) bits.push(extra);
  return bits.join(" · ");
};

/* =========================================================
   Filters
   ========================================================= */
R.set = (key, value, toggle = false) => {
  if (toggle && R.f[key] === value) value = key === "year" ? R.f.year : "All";
  R.f[key] = value;
  R.syncControls();
  R.refresh();
};

R.syncControls = () => {
  document.getElementById("year").value = R.f.year;
  document.getElementById("yearOut").textContent = R.f.year;
  const seg = (id, v) => document.querySelectorAll(`#${id} button`).forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === v));
  seg("measureSeg", R.f.measure);
  seg("sexSeg", R.f.sex);
  document.getElementById("fAge").value = R.f.age;
  document.getElementById("fRu").value = R.f.ru;
  document.getElementById("fArea").value = R.f.area;
  ["sex", "age", "ru", "area"].forEach((k) => {
    document.querySelector(`.slicer[data-dim="${k}"]`).classList.toggle("active", R.f[k] !== "All");
  });
};

R.reset = () => {
  R.stop();
  Object.assign(R.f, { year: R.LAST, measure: "hosp", sex: "All", age: "All", ru: "All", area: "All" });
  if (R.st) R.st.pick = "Tas";
  R.syncControls();
  R.refresh();
  App.announce("All filters cleared");
};

R.setupSlicers = () => {
  const age = document.getElementById("fAge");
  [["All", "All ages"], ["65+", "Aged 65+"], ["Under 65", "Under 65"], ...App.AGE_ORDER.map((a) => [a, a])]
    .forEach(([v, l]) => age.add(new Option(l, v)));
  const ru = document.getElementById("fRu");
  [["All", "All road users"], ...App.RU_ORDER.map((r) => [r, r])].forEach(([v, l]) => ru.add(new Option(l, v)));
  const area = document.getElementById("fArea");
  [["All", "All areas"], ...R.AREAS.map((a) => [a, R.areaLabel(a)])].forEach(([v, l]) => area.add(new Option(l, v)));

  age.addEventListener("change", () => R.set("age", age.value));
  ru.addEventListener("change", () => R.set("ru", ru.value));
  area.addEventListener("change", () => R.set("area", area.value));
  document.querySelectorAll("#measureSeg button").forEach((b) => b.addEventListener("click", () => R.set("measure", b.dataset.v)));
  document.querySelectorAll("#sexSeg button").forEach((b) => b.addEventListener("click", () => R.set("sex", b.dataset.v)));
  const yr = document.getElementById("year");
  yr.addEventListener("input", () => { R.stop(); R.set("year", +yr.value); });
  document.getElementById("playBtn").addEventListener("click", () => (R.timer ? R.stop() : R.play()));
  document.getElementById("resetBtn").addEventListener("click", R.reset);
  document.getElementById("shareBtn").addEventListener("click", R.share);
};

/* Autoplay: steps through 2011 to 2021 so every chart animates */
R.play = () => {
  if (R.f.year >= R.LAST) R.set("year", R.FIRST);
  const btn = document.getElementById("playBtn");
  btn.classList.add("on");
  btn.setAttribute("aria-label", "Pause");
  R.timer = setInterval(() => {
    if (R.f.year >= R.LAST) { R.stop(); return; }
    R.set("year", R.f.year + 1);
    App.announce(String(R.f.year));
  }, 1400);
};
R.stop = () => {
  clearInterval(R.timer);
  R.timer = null;
  const btn = document.getElementById("playBtn");
  btn.classList.remove("on");
  btn.setAttribute("aria-label", "Play through the years");
};

/* =========================================================
   URL: the Share button copies a link to this exact view
   ========================================================= */
R.syncURL = () => {
  const p = new URLSearchParams();
  if (R.f.year !== R.LAST) p.set("year", R.f.year);
  if (R.f.measure !== "hosp") p.set("measure", R.f.measure);
  ["sex", "age", "ru", "area"].forEach((k) => { if (R.f[k] !== "All") p.set(k, R.f[k]); });
  if (R.st && R.st.pick !== "Tas") p.set("state", R.st.pick);
  const q = p.toString();
  history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + "#page-" + R.page);
};
R.readURL = () => {
  const p = new URLSearchParams(location.search);
  const y = +p.get("year");
  if (y >= R.FIRST && y <= R.LAST) R.f.year = y;
  if (p.get("measure") === "bed") R.f.measure = "bed";
  if (["Male", "Female"].includes(p.get("sex"))) R.f.sex = p.get("sex");
  if (["65+", "Under 65", ...App.AGE_ORDER].includes(p.get("age"))) R.f.age = p.get("age");
  if (App.RU_ORDER.includes(p.get("ru"))) R.f.ru = p.get("ru");
  if (R.AREAS.includes(p.get("area"))) R.f.area = p.get("area");
  R.urlState = App.STATES.includes(p.get("state")) ? p.get("state") : null;
  const m = /page-(\d)/.exec(location.hash);
  if (m && +m[1] >= 1 && +m[1] <= 7) R.page = +m[1];
};
R.share = () => {
  R.syncURL();
  const btn = document.getElementById("shareBtn");
  const done = () => {
    const lbl = btn.querySelector(".lbl");
    lbl.textContent = "Link copied";
    App.announce("Link to this view copied");
    setTimeout(() => { lbl.textContent = "Share"; }, 1800);
  };
  if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, () => prompt("Copy this link:", location.href));
  else prompt("Copy this link:", location.href);
};

/* =========================================================
   Pages (bottom tabs)
   ========================================================= */
R.setupTabs = () => {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = R.PAGES.map((p) => `<button class="tab" role="tab" type="button" id="tab-${p.n}" aria-controls="page-${p.n}" aria-selected="false" tabindex="-1"><span class="n">${p.n}</span>${p.label}</button>`).join("");
  tabs.querySelectorAll(".tab").forEach((t, i) => t.addEventListener("click", () => R.go(i + 1)));
};
R.go = (n, focusTab = false) => {
  R.page = n;
  App.tip.hide();
  document.querySelectorAll(".page").forEach((p) => {
    const on = p.id === "page-" + n;
    p.hidden = !on;
    if (on) { p.classList.remove("enter"); void p.offsetWidth; p.classList.add("enter"); }
  });
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.id === "tab-" + n;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    if (on && focusTab) t.focus();
  });
  const uses = R.USES[n];
  document.querySelectorAll(".slicer[data-dim]").forEach((s) => {
    const off = !uses.includes(s.dataset.dim);
    s.classList.toggle("off", off);
    s.querySelectorAll("select, button").forEach((c) => { c.disabled = off; });
  });
  document.getElementById("pageInfo").textContent = `Page ${n} of ${R.PAGES.length} · Source: BITRE (2023)`;
  document.title = `${R.PAGES[n - 1].label} | The Growing Older Group`;
  R.refresh();
};

/* =========================================================
   Visual tiles
   spec = { id, ctx(), draw(el, opt), table() -> {columns, rows}, file }
   ========================================================= */
R.ICON = {
  focus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  data: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 8h14M3 12h14M9 4v12" stroke="currentColor" stroke-width="1.6"/></svg>',
  csv: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M6 9l4 4 4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  png: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8.5" r="1.6" fill="currentColor"/><path d="M4 15l4-4 3 3 2-2 3 3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

R.tile = (spec) => {
  const el = document.getElementById(spec.id);
  const title = () => (spec.title ? spec.title() : el.dataset.title);
  el.innerHTML = `<header><div class="t"><h2></h2><p class="ctx"></p></div>
    <div class="tile-tools">
      <button class="ibtn" type="button" data-act="focus" title="Focus mode">${R.ICON.focus}</button>
      <button class="ibtn" type="button" data-act="data" title="View data">${R.ICON.data}</button>
      <button class="ibtn" type="button" data-act="csv" title="Download CSV">${R.ICON.csv}</button>
      <button class="ibtn" type="button" data-act="png" title="Download PNG image">${R.ICON.png}</button>
    </div></header><div class="chart"></div>`;
  const chart = el.querySelector(".chart");
  const head = () => {
    el.querySelector("h2").textContent = title();
    el.querySelector(".ctx").innerHTML = spec.ctx();
    el.querySelectorAll(".ibtn").forEach((b) => b.setAttribute("aria-label", `${b.title}: ${title()}`));
  };
  const compact = { fill: true, legendSpace: 30, minH: 110 };
  const handle = App.responsive(chart, () => { head(); spec.draw(chart, compact); });
  const file = () => `${spec.file}_${R.f.year}.csv`;
  const download = () => { const t = spec.table(); App.downloadCSV(file(), t.rows, t.columns); };

  el.querySelector('[data-act="focus"]').addEventListener("click", () => {
    let big = null;
    const body = App.modal.open(title(), () => { big && big.stop(); R.focusRedraw = null; });
    body.insertAdjacentHTML("beforeend", `<p class="muted" style="margin:0 0 8px;font-size:.85rem">${spec.ctx()}</p>`);
    const holder = document.createElement("div");
    holder.className = "chart";
    body.appendChild(holder);
    big = App.responsive(holder, () => spec.draw(holder, { fill: true, minH: 300 }));
    R.focusRedraw = () => big.redraw();
  });
  el.querySelector('[data-act="data"]').addEventListener("click", () => {
    const t = spec.table();
    const body = App.modal.open("Data: " + title());
    const btn = document.createElement("button");
    btn.className = "tbtn";
    btn.type = "button";
    btn.textContent = "Download CSV";
    btn.addEventListener("click", download);
    document.getElementById("modalTools").appendChild(btn);
    body.appendChild(App.buildTable(t.columns, t.rows));
  });
  el.querySelector('[data-act="csv"]').addEventListener("click", download);
  el.querySelector('[data-act="png"]').addEventListener("click", () =>
    App.downloadPNG(chart, title(), el.querySelector(".ctx").textContent, file().replace(/\.csv$/, ".png")));
  R.tiles.push({ page: +spec.id[1], redraw: handle.redraw });
};

/* =========================================================
   KPI cards
   spec = { id, label(), value(year) -> number, fmt(v), unit, delta(now, base) -> html }
   The number counts up or down to its new value, and the sparkline
   shows the whole 2011 to 2021 trend with a dot on the selected year.
   ========================================================= */
R.kpi = (spec) => {
  const el = document.getElementById(spec.id);
  el.innerHTML = `<span class="k-label"></span><span class="k-val" aria-live="off"></span><span class="k-delta"></span><svg class="k-spark" preserveAspectRatio="none" aria-hidden="true"></svg>`;
  el.__v = null;
  const draw = () => {
    const series = App.YEARS.map((y) => ({ y, v: spec.value(y) }));
    const now = series.find((d) => d.y === R.f.year).v;
    const base = series[0].v;
    el.querySelector(".k-label").textContent = spec.label();
    el.querySelector(".k-delta").innerHTML = R.f.year === R.FIRST ? "Starting year" : spec.delta(now, base);
    const val = el.querySelector(".k-val");
    const unit = spec.unit ? `<small>${spec.unit}</small>` : "";
    const from = el.__v == null || !isFinite(el.__v) ? now : el.__v;
    el.__v = now;
    if (Charts.motion() && from !== now && isFinite(now)) {
      d3.select(val).interrupt().transition().duration(Charts.DUR).ease(d3.easeCubicOut)
        .tween("text", () => { const i = d3.interpolateNumber(from, now); return (t) => { val.innerHTML = spec.fmt(i(t)) + unit; }; });
    } else val.innerHTML = (isFinite(now) ? spec.fmt(now) : "n.p.") + unit;
    el.setAttribute("aria-label", `${spec.label()}: ${spec.fmt(now)} ${spec.unit || ""} in ${R.f.year}`);

    const svg = d3.select(el.querySelector(".k-spark"));
    const W = 200;
    const H = 30;
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    const ok = series.filter((d) => isFinite(d.v));
    const x = d3.scaleLinear().domain([R.FIRST, R.LAST]).range([4, W - 4]);
    const ext = d3.extent(ok, (d) => d.v);
    const y = d3.scaleLinear().domain(ext[0] === ext[1] ? [ext[0] - 1, ext[1] + 1] : ext).range([H - 4, 4]);
    svg.selectAll("*").remove();
    svg.append("path").attr("class", "area").attr("d", d3.area().x((d) => x(d.y)).y0(H).y1((d) => y(d.v))(ok));
    svg.append("path").attr("d", d3.line().x((d) => x(d.y)).y((d) => y(d.v))(ok));
    const cur = ok.find((d) => d.y === R.f.year);
    if (cur) svg.append("circle").attr("cx", x(cur.y)).attr("cy", y(cur.v)).attr("r", 3.6);
  };
  R.kpis.push({ page: +spec.id[1], draw });
};

/* Standard "change since 2011" text */
R.dPct = (now, base) => `<b>${App.signedPct(R.change(now, base))}</b> since 2011`;
R.dPts = (now, base) => `<b>${R.pts(now - base)}</b> since 2011`;

/* =========================================================
   Refresh: redraw what is on screen
   ========================================================= */
R.refresh = () => {
  R.kpis.forEach((k) => { if (k.page === R.page) k.draw(); });
  R.tiles.forEach((t) => { if (t.page === R.page) t.redraw(); });
  if (R.focusRedraw) R.focusRedraw();
  R.note();
  R.syncURL();
};

R.note = () => {
  // kept very short on purpose: only says something when it matters
  const uses = R.USES[R.page] || [];
  const on = ["sex", "age", "ru", "area"].filter((k) => uses.includes(k) && R.f[k] !== "All");
  const el = document.getElementById("filterNote");
  if (R.page === 5 || R.page === 6) el.innerHTML = "Only <b>Year</b> and <b>Measure</b> apply here";
  else el.innerHTML = on.length ? `<b>${on.length} filter${on.length > 1 ? "s" : ""} on</b>` : "";
};

/* =========================================================
   Page 1: Overview
   ========================================================= */
R.page1 = () => {
  const older = (y, skip = ["age"]) => R.one({ year: y, skip, where: (d) => d.older });
  R.kpi({ id: "k1-1", label: () => R.K(), value: (y) => R.one({ year: y }), fmt: R.fmtS, delta: R.dPct });
  R.kpi({ id: "k1-2", label: () => R.K() + ", aged 65+", value: (y) => older(y), fmt: R.fmtS, delta: R.dPct });
  R.kpi({
    id: "k1-3", label: () => "65+ share of " + R.K().toLowerCase(), unit: "",
    value: (y) => { const all = R.one({ year: y, skip: ["age"] }); return all ? (older(y) / all) * 100 : NaN; },
    fmt: (v) => d3.format(".1f")(v) + "%", delta: R.dPts,
  });
  R.kpi({
    id: "k1-4", label: () => "Average stay, 65+", unit: "days",
    value: (y) => { const h = R.one({ year: y, skip: ["age"], where: (d) => d.older, value: (d) => d.hosp }); return h ? R.one({ year: y, skip: ["age"], where: (d) => d.older, value: (d) => d.bed }) / h : NaN; },
    fmt: d3.format(".1f"), delta: (now, base) => `<b>${(now - base > 0 ? "+" : "") + d3.format(".1f")(now - base)} days</b> since 2011`,
  });

  // V1 stacked columns: each year split into Under 65 and 65+
  const parts = () => [
    { key: "y", label: "Under 65", colour: App.css("--c-neutral") },
    { key: "o", label: "Aged 65+", colour: App.css("--c-older") },
  ];
  const byYear = () => R.q({ by: (d) => d.year + "|" + (d.older ? "o" : "y") });
  R.tile({
    id: "v1-1", file: "admissions_by_year",
    title: () => `${R.M()} by year, aged 65+ and under 65`,
    ctx: () => R.ctx({ years: true, extra: "click a dot to pick the year" }),
    draw: (el, opt) => {
      const m = byYear();
      Charts.area(el, {
        ...opt, ariaLabel: `Stacked area chart of ${R.m()} per year, under 65 and 65+`, valueFormat: R.fmtS,
        cats: App.YEARS, parts: parts(), value: (c, k) => m.get(c + "|" + k) || 0, focusX: R.f.year,
        onSelect: (y) => { R.stop(); R.set("year", y); },
        tip: (d) => {
          const tot = (m.get(d.cat + "|o") || 0) + (m.get(d.cat + "|y") || 0);
          return App.tipCard({ kicker: R.M(), chip: d.cat, title: d.part.label, colour: d.part.colour, value: App.fmt(d.value),
            rows: [["Share of the year", App.pct(tot ? (d.value / tot) * 100 : 0)], ["All ages", App.fmt(tot)]] });
        },
      });
    },
    table: () => { const m = byYear(); return {
      columns: [{ key: "year", label: "Year" }, { key: "y", label: "Under 65", num: true, format: App.fmt }, { key: "o", label: "Aged 65+", num: true, format: App.fmt }],
      rows: App.YEARS.map((y) => ({ year: y, y: m.get(y + "|y") || 0, o: m.get(y + "|o") || 0 })) }; },
  });

  // V2 age group columns (click to filter by age)
  const byAge = () => R.q({ year: R.f.year, skip: ["age"], by: (d) => d.age });
  R.tile({
    id: "v1-2", file: "by_age_group",
    title: () => `${R.M()} by age group, ${R.f.year}`,
    ctx: () => R.ctx({ skip: ["age"], extra: "click to filter" }),
    draw: (el, opt) => {
      const m = byAge();
      const tot = d3.sum(m.values());
      Charts.bar(el, {
        ...opt, ariaLabel: `Columns of ${R.m()} by age group in ${R.f.year}`,
        data: App.AGE_ORDER.map((a) => ({ x: a, y: m.get(a) || 0, colour: App.ageColour(a), showLabel: true })),
        focusX: App.AGE_ORDER.includes(R.f.age) ? R.f.age : undefined, valueFormat: R.fmtS,
        onSelect: (d) => R.set("age", d.x, true),
        tip: (d) => App.tipCard({ kicker: R.M(), chip: R.f.year, title: "Age " + d.x, colour: d.colour, value: App.fmt(d.y), rows: [["Share of all ages", App.pct(tot ? (d.y / tot) * 100 : 0)]] }),
      });
    },
    table: () => { const m = byAge(); return { columns: [{ key: "age", label: "Age group" }, { key: "v", label: R.M(), num: true, format: App.fmt }], rows: App.AGE_ORDER.map((a) => ({ age: a, v: m.get(a) || 0 })) }; },
  });

  // V3 road users as a donut (click a slice to filter)
  const byRu = () => R.q({ year: R.f.year, skip: ["ru"], by: (d) => d.ru });
  R.tile({
    id: "v1-3", file: "by_road_user",
    title: () => `${R.M()} by road user, ${R.f.year}`,
    ctx: () => R.ctx({ skip: ["ru"], extra: "click a slice to filter" }),
    draw: (el, opt) => {
      const m = byRu();
      const data = App.RU_ORDER.map((r) => ({ label: r, value: m.get(r) || 0, colour: App.ruColour(r) }));
      const tot = d3.sum(data, (d) => d.value);
      Charts.donut(el, {
        ...opt, ariaLabel: `Donut chart of ${R.m()} by road user in ${R.f.year}`, data,
        selected: R.f.ru === "All" ? null : R.f.ru,
        centre: (() => { const top = data.find((d) => d.label === R.f.ru) || [...data].sort((a, b) => b.value - a.value)[0];
          return { value: d3.format(".0f")(tot ? (top.value / tot) * 100 : 0) + "%", title: top.label.toLowerCase() }; })(),
        onSelect: (d) => R.set("ru", d.label, true),
        tip: (d) => App.tipCard({ kicker: R.M(), chip: R.f.year, title: d.label, colour: d.colour, value: App.fmt(d.value), rows: [["Share of road users", App.pct(tot ? (d.value / tot) * 100 : 0)]] }),
      });
    },
    table: () => { const m = byRu(); return { columns: [{ key: "r", label: "Road user" }, { key: "v", label: R.M(), num: true, format: App.fmt }], rows: App.RU_ORDER.map((r) => ({ r, v: m.get(r) || 0 })) }; },
  });

  // V4 remoteness as horizontal bars, largest first (click a bar to filter)
  const AREA_COL = { "Major Cities": "--c-car", Regional: "--c-cycle", Remote: "--c-ped" };
  const byArea = () => R.q({ year: R.f.year, skip: ["area"], by: (d) => d.area });
  R.tile({
    id: "v1-4", file: "by_remoteness",
    title: () => `${R.M()} by remoteness area, ${R.f.year}`,
    ctx: () => R.ctx({ skip: ["area"], extra: "click a bar to filter" }),
    draw: (el, opt) => {
      const m = byArea();
      const data = R.AREAS.map((a) => ({ label: a, value: m.get(a) || 0, colour: App.css(AREA_COL[a]) })).sort((x, y) => y.value - x.value);
      const tot = d3.sum(data, (d) => d.value);
      Charts.hbar(el, {
        ...opt, ariaLabel: `Bars of ${R.m()} by remoteness area in ${R.f.year}`, labelSpace: 96, data,
        selected: R.f.area === "All" ? null : R.f.area,
        valueText: (d) => `${R.fmtS(d.value)} (${d3.format(".0f")(tot ? (d.value / tot) * 100 : 0)}%)`, axisFormat: d3.format("~s"),
        onSelect: (d) => R.set("area", d.label, true),
        tip: (d) => App.tipCard({ kicker: R.M(), chip: R.f.year, title: d.label, colour: d.colour, value: App.fmt(d.value), rows: [["Share of all areas", App.pct(tot ? (d.value / tot) * 100 : 0)]] }),
      });
    },
    table: () => { const m = byArea(); return { columns: [{ key: "a", label: "Remoteness area" }, { key: "v", label: R.M(), num: true, format: App.fmt }], rows: R.AREAS.map((a) => ({ a, v: m.get(a) || 0 })) }; },
  });
};

/* =========================================================
   Page 2: Age and sex
   ========================================================= */
R.page2 = () => {
  const ageVal = (y, where) => R.one({ year: y, skip: ["age"], where });
  R.kpi({ id: "k2-1", label: () => "Aged 65 to 74", value: (y) => ageVal(y, (d) => d.age === "65-74"), fmt: R.fmtS, delta: R.dPct });
  R.kpi({ id: "k2-2", label: () => "Aged 75 and over", value: (y) => ageVal(y, (d) => d.age === "75+"), fmt: R.fmtS, delta: R.dPct });
  R.kpi({ id: "k2-3", label: () => "Under 65", value: (y) => ageVal(y, (d) => !d.older), fmt: R.fmtS, delta: R.dPct });
  R.kpi({
    id: "k2-4", label: () => "Women among 65+",
    value: (y) => { const all = R.one({ year: y, skip: ["age", "sex"], where: (d) => d.older }); return all ? (R.one({ year: y, skip: ["age", "sex"], where: (d) => d.older && d.sex === "Female" }) / all) * 100 : NaN; },
    fmt: (v) => d3.format(".1f")(v) + "%", delta: R.dPts,
  });

  // V1 growth index per age group (2011 = 100)
  const growth = () => {
    const m = R.q({ skip: ["age"], by: (d) => d.age + "|" + d.year });
    return App.AGE_ORDER.map((a) => {
      const base = m.get(a + "|" + R.FIRST) || 1;
      const older = App.OLDER_AGES.includes(a);
      return { key: a, label: older ? a : a, emphasis: older, colour: App.ageColour(a),
        values: App.YEARS.map((y) => ({ x: y, y: ((m.get(a + "|" + y) || 0) / base) * 100, count: m.get(a + "|" + y) || 0 })) };
    });
  };
  R.tile({
    id: "v2-1", file: "growth_by_age",
    title: () => `Growth in ${R.m()} by age group since 2011`,
    ctx: () => R.ctx({ years: true, skip: ["age"] }),
    draw: (el, opt) => Charts.line(el, {
      ...opt, legend: false, ariaLabel: "Line chart of growth since 2011 for each age group",
      series: growth(), refLine: 100, yLabel: "", yFormat: d3.format("d"), focusX: R.f.year,
      yMin: Math.min(90, Math.floor(d3.min(growth().flatMap((s) => s.values), (d) => d.y) / 10) * 10),
      onSelect: (d, s) => { R.stop(); R.f.age = s.key; R.set("year", d.x); },
      tip: (s, d) => App.tipCard({ kicker: "Growth, 2011 = 100", chip: d.x, title: "Age " + s.key, colour: s.colour, value: d3.format(".0f")(d.y),
        rows: [[R.M(), App.fmt(d.count)], ["Change since 2011", App.signedPct(d.y - 100)]] }),
    }),
    table: () => ({
      columns: [{ key: "age", label: "Age group" }, ...App.YEARS.map((y) => ({ key: y, label: String(y), num: true, format: d3.format(".0f") }))],
      rows: growth().map((s) => { const r = { age: s.key }; s.values.forEach((v) => { r[v.x] = v.y; }); return r; }),
    }),
  });

  // V2 butterfly: men vs women by age
  const bySexAge = () => R.q({ year: R.f.year, skip: ["sex", "age"], by: (d) => d.sex + "|" + d.age });
  R.tile({
    id: "v2-2", file: "men_women_by_age",
    title: () => `${R.M()} by sex and age group, ${R.f.year}`,
    ctx: () => R.ctx({ skip: ["sex", "age"], extra: "click to filter" }),
    draw: (el, opt) => {
      const m = bySexAge();
      Charts.butterfly(el, {
        ...opt, ariaLabel: `Back-to-back bars of ${R.m()} for men and women by age in ${R.f.year}`,
        categories: [...App.AGE_ORDER].reverse(),
        left: { key: "Male", label: "Men", colour: App.css("--c-male"), value: (c) => m.get("Male|" + c) || 0 },
        right: { key: "Female", label: "Women", colour: App.css("--c-female"), value: (c) => m.get("Female|" + c) || 0 },
        format: (v) => R.fmtS(v),
        onSelect: (d) => { R.f.age = R.f.age === d.category && R.f.sex === d.side.key ? "All" : d.category; R.set("sex", d.side.key, true); },
        tip: (d) => App.tipCard({ kicker: R.M(), chip: R.f.year, title: `${d.side.label}, age ${d.category}`, colour: d.side.colour, value: App.fmt(d.value) }),
      });
    },
    table: () => { const m = bySexAge(); return {
      columns: [{ key: "age", label: "Age group" }, { key: "m", label: "Men", num: true, format: App.fmt }, { key: "f", label: "Women", num: true, format: App.fmt }],
      rows: App.AGE_ORDER.map((a) => ({ age: a, m: m.get("Male|" + a) || 0, f: m.get("Female|" + a) || 0 })) }; },
  });

  // V3 heatmap: every age group in every year (darker = more)
  const heat = () => R.q({ skip: ["age"], by: (d) => d.age + "|" + d.year });
  R.tile({
    id: "v2-3", file: "age_by_year",
    title: () => `${R.M()} by age group and year`,
    ctx: () => R.ctx({ years: true, skip: ["age"], extra: "darker = more · click a cell" }),
    draw: (el, opt) => {
      const m = heat();
      Charts.heatmap(el, {
        ...opt, ariaLabel: `Heatmap of ${R.m()} by age group and year`,
        rows: [...App.AGE_ORDER].reverse(), cols: App.YEARS, value: (r, c) => m.get(r + "|" + c) || 0,
        cellFormat: d3.format(".2s"), focusCol: R.f.year,
        onSelect: (d) => { R.stop(); R.f.age = d.row; R.set("year", d.col); },
        tip: (d) => App.tipCard({ kicker: R.M(), chip: d.col, title: "Age " + d.row, value: App.fmt(d.value) }),
      });
    },
    table: () => { const m = heat(); return {
      columns: [{ key: "age", label: "Age group" }, ...App.YEARS.map((y) => ({ key: y, label: String(y), num: true, format: App.fmt }))],
      rows: App.AGE_ORDER.map((a) => { const r = { age: a }; App.YEARS.forEach((y) => { r[y] = m.get(a + "|" + y) || 0; }); return r; }) }; },
  });
};

/* =========================================================
   Page 3: Road users (older people unless another age is picked)
   ========================================================= */
R.page3 = () => {
  const ru = (r) => (y) => R.one({ year: y, skip: ["age", "ru"], where: (d) => d.ru === r && R.ageMatch(d, R.ageKey()) });
  const lab = (r) => () => `${r}, ${R.ageKey() === "65+" ? "65+" : R.ageLabel(R.ageKey()).toLowerCase()}`;
  [["k3-1", "Car occupants"], ["k3-2", "Motorcyclist"], ["k3-3", "Pedal cyclist"], ["k3-4", "Pedestrian"]].forEach(([id, r]) => {
    R.kpi({ id, label: lab(r), value: ru(r), fmt: R.fmtS, delta: R.dPct });
    // the accent bar uses the road user's theme colour, so it changes with the theme
    const v = { "Car occupants": "--c-car", Motorcyclist: "--c-moto", "Pedal cyclist": "--c-cycle", Pedestrian: "--c-ped" }[r];
    document.getElementById(id).style.setProperty("--accent", `var(${v})`);
  });

  // V1 road users over time for the chosen age group
  const trend = () => {
    const m = R.q({ skip: ["age", "ru"], where: (d) => R.ageMatch(d, R.ageKey()), by: (d) => d.ru + "|" + d.year });
    return App.RU_ORDER.map((r) => ({ key: r, label: r, short: r.split(" ")[0], colour: App.ruColour(r), emphasis: R.f.ru === r || R.f.ru === "All",
      values: App.YEARS.map((y) => ({ x: y, y: m.get(r + "|" + y) || 0 })) }));
  };
  R.tile({
    id: "v3-1", file: "road_users_over_time",
    title: () => `${R.M()} by road user, ${R.ageLabel(R.ageKey()).toLowerCase()}, 2011 to 2021`,
    ctx: () => R.ctx({ years: true, skip: ["age"], extra: "click a line to filter" }),
    draw: (el, opt) => Charts.line(el, {
      ...opt, legend: false, ariaLabel: "Line chart of road users over time",
      series: trend(), yLabel: "", focusX: R.f.year,
      onSelect: (d, s) => { R.stop(); R.f.year = d.x; R.set("ru", s.key, true); },
      tip: (s, d) => App.tipCard({ kicker: R.M() + ", " + R.ageLabel(R.ageKey()), chip: d.x, title: s.label, colour: s.colour, value: App.fmt(d.y) }),
    }),
    table: () => ({
      columns: [{ key: "r", label: "Road user" }, ...App.YEARS.map((y) => ({ key: y, label: String(y), num: true, format: App.fmt }))],
      rows: trend().map((s) => { const r = { r: s.key }; s.values.forEach((v) => { r[v.x] = v.y; }); return r; }),
    }),
  });

  // V2 what they collided with (counterparty)
  const cps = () => {
    const m = R.q({ year: R.f.year, skip: ["age"], where: (d) => R.ageMatch(d, R.ageKey()), by: (d) => d.cp });
    return Object.keys(R.CP).map((k) => ({ label: R.CP[k], full: k, value: m.get(k) || 0 })).sort((a, b) => b.value - a.value);
  };
  R.tile({
    id: "v3-2", file: "by_counterparty",
    title: () => `${R.M()} by counterparty, ${R.ageLabel(R.ageKey()).toLowerCase()}, ${R.f.year}`,
    ctx: () => R.ctx({ skip: ["age"], extra: "what they collided with · box size = share" }),
    draw: (el, opt) => {
      const data = cps();
      const tot = d3.sum(data, (d) => d.value);
      const pal = ["--c-car", "--c-moto", "--c-cycle", "--c-ped"]; // checked with the colour-blind simulator
      Charts.treemap(el, {
        ...opt, ariaLabel: "Treemap of what people collided with",
        data: data.map((d, i) => ({ ...d, colour: App.css(pal[i] || "--c-neutral") })),
        tip: (d) => App.tipCard({ kicker: "Counterparty", chip: R.f.year, title: d.full === "Other non-motor vehicle" ? "Non-motor vehicle (e.g. horse or tram)" : d.full === "Non-collision transport accident" ? "No collision (e.g. lost control or fell off)" : d.label,
          colour: d.colour, value: App.fmt(d.value), rows: [["Share", App.pct(tot ? (d.value / tot) * 100 : 0)]] }),
      });
    },
    table: () => ({ columns: [{ key: "label", label: "Counterparty" }, { key: "value", label: R.M(), num: true, format: App.fmt }], rows: cps() }),
  });

  // V3 road user mix, 65+ vs under 65 (share of each group)
  const mix = () => {
    const m = R.q({ year: R.f.year, skip: ["age", "ru"], by: (d) => (d.older ? "o" : "y") + "|" + d.ru });
    const tot = { o: d3.sum(App.RU_ORDER, (r) => m.get("o|" + r) || 0), y: d3.sum(App.RU_ORDER, (r) => m.get("y|" + r) || 0) };
    return { m, tot, share: (r, g) => (tot[g] ? ((m.get(g + "|" + r) || 0) / tot[g]) * 100 : 0) };
  };
  R.tile({
    id: "v3-3", file: "road_user_mix",
    title: () => `Road user mix by age, ${R.f.year}`,
    ctx: () => R.ctx({ skip: ["age", "ru"], extra: "% of each age group · click to filter" }),
    draw: (el, opt) => {
      const x = mix();
      Charts.groupedHbar(el, {
        ...opt, ariaLabel: "Grouped bars of the road user mix for 65+ and under 65",
        categories: App.RU_ORDER,
        groups: [{ key: "o", label: "Aged 65+", colour: App.css("--c-older") }, { key: "y", label: "Under 65", colour: App.css("--c-neutral") }],
        value: (c, g) => x.share(c, g), format: (v) => d3.format(".0f")(v) + "%", selected: R.f.ru === "All" ? null : R.f.ru,
        onSelect: (d) => R.set("ru", d.category, true),
        tip: (d) => App.tipCard({ kicker: "Road user mix", chip: R.f.year, title: `${d.category}, ${d.group.label}`, colour: d.group.colour, value: App.pct(d.value), unit: "of the group",
          rows: [[R.M(), App.fmt(x.m.get(d.group.key + "|" + d.category) || 0)]] }),
      });
    },
    table: () => { const x = mix(); return {
      columns: [{ key: "r", label: "Road user" }, { key: "o", label: "Aged 65+ (%)", num: true, format: d3.format(".1f") }, { key: "y", label: "Under 65 (%)", num: true, format: d3.format(".1f") }],
      rows: App.RU_ORDER.map((r) => ({ r, o: x.share(r, "o"), y: x.share(r, "y") })) }; },
  });
};

/* =========================================================
   Page 4: Hospital stay (bed days)
   ========================================================= */
R.page4 = () => {
  const bed = (d) => d.bed;
  const hosp = (d) => d.hosp;
  const avg = (y, where) => { const h = R.one({ year: y, skip: ["age"], where, value: hosp }); return h ? R.one({ year: y, skip: ["age"], where, value: bed }) / h : NaN; };
  R.kpi({ id: "k4-1", label: () => "Bed days, all ages", value: (y) => R.one({ year: y, skip: ["age"], value: bed }), fmt: R.fmtS, delta: R.dPct });
  R.kpi({
    id: "k4-2", label: () => "65+ share of bed days",
    value: (y) => { const all = R.one({ year: y, skip: ["age"], value: bed }); return all ? (R.one({ year: y, skip: ["age"], value: bed, where: (d) => d.older }) / all) * 100 : NaN; },
    fmt: (v) => d3.format(".1f")(v) + "%", delta: R.dPts,
  });
  const dDays = (now, base) => `<b>${(now - base > 0 ? "+" : "") + d3.format(".1f")(now - base)} days</b> since 2011`;
  R.kpi({ id: "k4-3", label: () => "Average stay, 65+", unit: "days", value: (y) => avg(y, (d) => d.older), fmt: d3.format(".1f"), delta: dDays });
  R.kpi({ id: "k4-4", label: () => "Average stay, under 65", unit: "days", value: (y) => avg(y, (d) => !d.older), fmt: d3.format(".1f"), delta: dDays });

  // V1 average days per admission by age
  const byAge = () => {
    const h = R.q({ year: R.f.year, skip: ["age"], by: (d) => d.age, value: hosp });
    const b = R.q({ year: R.f.year, skip: ["age"], by: (d) => d.age, value: bed });
    return App.AGE_ORDER.map((a) => ({ x: a, y: h.get(a) ? b.get(a) / h.get(a) : 0, h: h.get(a) || 0, b: b.get(a) || 0, colour: App.ageColour(a), showLabel: true }));
  };
  R.tile({
    id: "v4-1", file: "average_stay_by_age",
    title: () => `Average length of stay by age group, ${R.f.year}`,
    ctx: () => R.ctx({ skip: ["age"], extra: "click to filter" }),
    draw: (el, opt) => Charts.lollipop(el, {
      ...opt, ariaLabel: "Lollipop chart of average days in hospital by age group", yLabel: "Days",
      onSelect: (d) => R.set("age", d.x, true),
      data: byAge(), yFormat: d3.format("d"), valueFormat: d3.format(".1f"),
      focusX: App.AGE_ORDER.includes(R.f.age) ? R.f.age : undefined,
      tip: (d) => App.tipCard({ kicker: "Average stay", chip: R.f.year, title: "Age " + d.x, colour: d.colour, value: d3.format(".1f")(d.y), unit: "days",
        rows: [["Hospitalised injuries", App.fmt(d.h)], ["Bed days", App.fmt(d.b)]] }),
    }),
    table: () => ({ columns: [{ key: "x", label: "Age group" }, { key: "h", label: "Hospitalised injuries", num: true, format: App.fmt }, { key: "b", label: "Bed days", num: true, format: App.fmt }, { key: "y", label: "Average days", num: true, format: d3.format(".2f") }], rows: byAge() }),
  });

  // V2 average stay by road user, 65+ vs under 65
  const ruStay = () => {
    const h = R.q({ year: R.f.year, skip: ["age", "ru"], by: (d) => (d.older ? "o" : "y") + "|" + d.ru, value: hosp });
    const b = R.q({ year: R.f.year, skip: ["age", "ru"], by: (d) => (d.older ? "o" : "y") + "|" + d.ru, value: bed });
    return { get: (r, g) => { const k = g + "|" + r; return h.get(k) ? b.get(k) / h.get(k) : 0; }, h, b };
  };
  R.tile({
    id: "v4-2", file: "average_stay_by_road_user",
    title: () => `Average length of stay by road user and age, ${R.f.year}`,
    ctx: () => R.ctx({ skip: ["age", "ru"], extra: "days per admission · click to filter" }),
    draw: (el, opt) => {
      const s = ruStay();
      Charts.dumbbell(el, {
        ...opt, ariaLabel: "Dumbbell chart of average stay by road user, under 65 and 65+", aLabel: "Under 65", bLabel: "Aged 65+",
        rows: App.RU_ORDER.map((r) => ({ label: r, a: s.get(r, "y"), b: s.get(r, "o"), emphasis: R.f.ru === r })),
        format: (v) => d3.format(".1f")(v) + " days",
        onSelect: (d) => R.set("ru", d.label, true),
        tip: (d, which) => { const g = which === "a" ? "y" : "o"; return App.tipCard({ kicker: "Average stay", chip: R.f.year, title: `${d.label}, ${which === "a" ? "under 65" : "aged 65+"}`,
          colour: which === "a" ? App.css("--c-neutral") : App.css("--c-older"), value: d3.format(".1f")(which === "a" ? d.a : d.b), unit: "days",
          rows: [["Hospitalised injuries", App.fmt(s.h.get(g + "|" + d.label) || 0)]] }); },
      });
    },
    table: () => { const s = ruStay(); return {
      columns: [{ key: "r", label: "Road user" }, { key: "o", label: "65+ average days", num: true, format: d3.format(".2f") }, { key: "y", label: "Under 65 average days", num: true, format: d3.format(".2f") }],
      rows: App.RU_ORDER.map((r) => ({ r, o: s.get(r, "o"), y: s.get(r, "y") })) }; },
  });

  // V3 65+ share of admissions vs share of bed days
  const shares = () => {
    const h = R.q({ skip: ["age"], by: (d) => d.year + "|" + d.older, value: hosp });
    const b = R.q({ skip: ["age"], by: (d) => d.year + "|" + d.older, value: bed });
    const sh = (m, y) => { const o = m.get(y + "|true") || 0; const t = o + (m.get(y + "|false") || 0); return t ? (o / t) * 100 : 0; };
    return [
      { key: "bed", label: "Bed days", short: "Bed days", colour: App.css("--c-older"), emphasis: true, values: App.YEARS.map((y) => ({ x: y, y: sh(b, y) })) },
      { key: "hosp", label: "Injuries", short: "Injuries", colour: App.css("--c-younger"), values: App.YEARS.map((y) => ({ x: y, y: sh(h, y) })) },
    ];
  };
  R.tile({
    id: "v4-3", file: "older_share_admissions_vs_bed_days",
    title: () => "Share aged 65+ of hospitalised injuries and bed days, 2011 to 2021",
    ctx: () => R.ctx({ years: true, skip: ["age"] }),
    draw: (el, opt) => Charts.line(el, {
      ...opt, ariaLabel: "Line chart of the 65+ share of admissions and of bed days", legend: false,
      series: shares(), yMin: 0, yFormat: (v) => v + "%", focusX: R.f.year,
      onSelect: (d) => { R.stop(); R.set("year", d.x); },
      tip: (s, d) => App.tipCard({ kicker: "Aged 65+", chip: d.x, title: "Share of " + s.label.toLowerCase(), colour: s.colour, value: App.pct(d.y) }),
    }),
    table: () => { const s = shares(); return {
      columns: [{ key: "y", label: "Year" }, { key: "h", label: "65+ share of hospitalised injuries (%)", num: true, format: d3.format(".1f") }, { key: "b", label: "65+ share of bed days (%)", num: true, format: d3.format(".1f") }],
      rows: App.YEARS.map((y, i) => ({ y, h: s[1].values[i].y, b: s[0].values[i].y })) }; },
  });
};

/* =========================================================
   Page 5: States and territories (state file)
   ========================================================= */
R.page5 = (rows) => {
  const age = rows.filter((r) => r.breakdown === "Age Group");
  const overall = rows.filter((r) => r.breakdown === "Overall");
  const v = (r) => (R.f.measure === "hosp" ? r.hosp : r.bed);
  const st = { pick: R.urlState || "Tas" };
  R.st = st;
  // share aged 65+ for one state and year, and whether any n.p. cells were involved
  st.agg = (state, year) => {
    const l = age.filter((r) => (state === "AUS" || r.state === state) && r.year === year);
    const all = d3.sum(l, (r) => v(r) || 0);
    const older = d3.sum(l.filter((r) => App.OLDER_AGES.includes(r.category)), (r) => v(r) || 0);
    // KNIME removes suppressed (n.p.) rows, so a state-year with fewer than
    // 7 age groups x 2 half-years = 14 rows includes n.p. values
    const expected = (state === "AUS" ? App.STATES.length : 1) * App.AGE_ORDER.length * 2;
    return { state, year, older, all, share: all ? (older / all) * 100 : 0, flag: l.length < expected || l.some((r) => v(r) === null) };
  };
  st.total = (state, year) => d3.sum(overall.filter((r) => r.state === state && r.year === year), (r) => v(r) || 0);
  // a fixed axis top across all years, so bars and dots move smoothly while playing
  st.min = () => Math.floor(d3.min(App.STATES.flatMap((x) => App.YEARS.map((y) => st.agg(x, y).share))));
  // rough position of each state on a 4 x 4 grid shaped like Australia
  const TILE = { NT: [1, 0], Qld: [2, 0], WA: [0, 1], SA: [1, 1], NSW: [2, 1], ACT: [3, 1], Vic: [2, 2], Tas: [2, 3] };
  st.max = () => Math.ceil(d3.max(App.STATES.flatMap((x) => App.YEARS.map((y) => st.agg(x, y).share))) / 5) * 5;
  st.setPick = (x) => { st.pick = x; R.refresh(); };
  const np = (d) => (d.flag ? [["Note", "includes n.p. values"]] : []);
  const name = (x) => (x === "AUS" ? "Australia" : App.STATE_NAMES[x]);

  R.kpi({ id: "k5-1", label: () => `${R.K()}, ${st.pick}`, value: (y) => st.total(st.pick, y), fmt: R.fmtS, delta: R.dPct });
  R.kpi({ id: "k5-2", label: () => `65+ share, ${st.pick}`, value: (y) => st.agg(st.pick, y).share, fmt: (x) => d3.format(".1f")(x) + "%", delta: R.dPts });
  R.kpi({ id: "k5-3", label: () => "65+ share, Australia", value: (y) => st.agg("AUS", y).share, fmt: (x) => d3.format(".1f")(x) + "%", delta: R.dPts });
  R.kpi({
    id: "k5-4", label: () => "65+ share went up in",
    value: (y) => App.STATES.filter((x) => { const a = st.agg(x, y); const b = st.agg(x, R.FIRST); return !a.flag && !b.flag && a.share > b.share; }).length,
    fmt: (x) => `${Math.round(x)} of ${App.STATES.filter((s) => !st.agg(s, R.f.year).flag && !st.agg(s, R.FIRST).flag).length}`,
    delta: () => "states since 2011 (no n.p.)",
  });

  // V1 columns: share aged 65+ in each state for the selected year (striped = includes n.p.)
  R.tile({
    id: "v5-1", file: "states_older_share_year",
    title: () => `Share aged 65+ by state, ${R.f.year}`,
    ctx: () => `${R.ctx()} · darker = higher · click a state · * includes n.p.`,
    draw: (el, opt) => Charts.tilemap(el, {
      ...opt, ariaLabel: `Tile map of the share aged 65+ by state in ${R.f.year}`,
      // each state sits roughly where it is on the map of Australia
      tiles: App.STATES.map((x) => { const a = st.agg(x, R.f.year); const [col, row] = TILE[x]; return { ...a, key: x, col, row, value: a.share }; }),
      selected: st.pick, min: st.min(), max: st.max(), format: (x) => d3.format(".1f")(x) + "%",
      onSelect: (d) => st.setPick(d.key),
      tip: (d) => App.tipCard({ kicker: "Share aged 65+", chip: R.f.year, title: name(d.key), colour: App.css("--c-older"), value: App.pct(d.share),
        rows: [[R.M() + " 65+", App.fmt(d.older)], [R.M() + " all ages", App.fmt(d.all)], ...np(d)] }),
    }),
    table: () => ({
      columns: [{ key: "state", label: "State" }, { key: "older", label: "Aged 65+", num: true, format: App.fmt }, { key: "all", label: "All ages", num: true, format: App.fmt }, { key: "share", label: "Share (%)", num: true, format: d3.format(".1f") }, { key: "f", label: "Includes n.p." }],
      rows: App.STATES.map((x) => { const a = st.agg(x, R.f.year); return { ...a, f: a.flag ? "yes" : "no" }; }),
    }),
  });

  // V2 dumbbell: 2011 vs selected year
  R.tile({
    id: "v5-2", file: "states_2011_vs_year",
    title: () => `Share aged 65+ by state, 2011 vs ${R.f.year}`,
    ctx: () => `${R.ctx()} · * includes n.p.`,
    draw: (el, opt) => Charts.dumbbell(el, {
      ...opt, ariaLabel: "Dumbbell chart of the share aged 65+ by state", aLabel: "2011", bLabel: String(R.f.year),
      rows: App.STATES.map((x) => { const a = st.agg(x, R.FIRST); const b = st.agg(x, R.f.year); return { label: x, a: a.share, b: b.share, emphasis: x === st.pick, flag: a.flag || b.flag, ao: a, bo: b }; }),
      xMax: st.max(), format: (x) => d3.format(".0f")(x) + "%",
      onSelect: (d) => st.setPick(d.label),
      tip: (d, which) => { const o = which === "a" ? d.ao : d.bo; return App.tipCard({ kicker: "Share aged 65+", chip: o.year, title: name(d.label), colour: which === "a" ? App.css("--c-neutral") : App.css("--c-older"), value: App.pct(o.share), rows: [[R.M() + " 65+", App.fmt(o.older)], ...np(o)] }); },
    }),
    table: () => ({
      columns: [{ key: "s", label: "State" }, { key: "a", label: "2011 (%)", num: true, format: d3.format(".1f") }, { key: "b", label: R.f.year + " (%)", num: true, format: d3.format(".1f") }, { key: "f", label: "Includes n.p." }],
      rows: App.STATES.map((x) => { const a = st.agg(x, R.FIRST); const b = st.agg(x, R.f.year); return { s: x, a: a.share, b: b.share, f: a.flag || b.flag ? "yes" : "no" }; }),
    }),
  });

  // V3 picked state vs Australia over time
  const lines = () => [st.pick, "AUS"].map((x) => ({
    key: x, label: x === "AUS" ? "Australia" : x, colour: x === "AUS" ? App.css("--c-younger") : App.css("--c-older"), emphasis: x !== "AUS",
    values: App.YEARS.map((y) => { const a = st.agg(x, y); return { x: y, y: a.share, flag: a.flag, older: a.older }; }),
  }));
  R.tile({
    id: "v5-3", file: "state_vs_australia",
    title: () => `Share aged 65+, ${name(st.pick)} vs Australia, 2011 to 2021`,
    ctx: () => "2011 to 2021 · click a dot to pick the year",
    draw: (el, opt) => Charts.line(el, {
      ...opt, legend: false, ariaLabel: "Line chart of the picked state against Australia", series: lines(),
      yMin: 0, yFormat: (x) => x + "%", focusX: R.f.year,
      onSelect: (d) => { R.stop(); R.set("year", d.x); },
      tip: (s, d) => App.tipCard({ kicker: "Share aged 65+", chip: d.x, title: name(s.key), colour: s.colour, value: App.pct(d.y), rows: [[R.M() + " 65+", App.fmt(d.older)], ...np(d)] }),
    }),
    table: () => { const l = lines(); return {
      columns: [{ key: "y", label: "Year" }, { key: "a", label: st.pick + " (%)", num: true, format: d3.format(".1f") }, { key: "b", label: "Australia (%)", num: true, format: d3.format(".1f") }],
      rows: App.YEARS.map((y, i) => ({ y, a: l[0].values[i].y, b: l[1].values[i].y })) }; },
  });
  if (R.page === 5) R.refresh();
};

/* =========================================================
   Page 6: First Nations (First Nations file)
   ========================================================= */
R.page6 = (rows) => {
  const v = (r) => (R.f.measure === "hosp" ? r.hosp : r.bed);
  const age = rows.filter((r) => r.breakdown === "Age");
  const remote = rows.filter((r) => r.breakdown === "Remoteness");
  const FN = "First Nations people";
  const NI = "Non-Indigenous";
  const total = (s, y) => d3.sum(age.filter((r) => r.status === s && r.year === y), (r) => v(r) || 0);
  const shares = (list, cats, s, y) => {
    const l = list.filter((r) => r.status === s && r.year === y);
    const tot = d3.sum(l.filter((r) => cats.includes(r.category)), (r) => v(r) || 0);
    return cats.map((c) => { const x = l.filter((r) => r.category === c); const n = d3.sum(x, (r) => v(r) || 0); return { c, n, share: tot ? (n / tot) * 100 : 0, flag: x.length < 2 || x.some((r) => v(r) === null) }; }); // fewer than 2 half-years = n.p. rows removed
  };
  const pick = (list, cats, s, y, c) => shares(list, cats, s, y).find((d) => d.c === c);

  R.kpi({ id: "k6-1", label: () => `${R.K()}, First Nations`, value: (y) => total(FN, y), fmt: R.fmtS, delta: R.dPct });
  R.kpi({ id: "k6-2", label: () => `${R.K()}, non-Indigenous`, value: (y) => total(NI, y), fmt: R.fmtS, delta: R.dPct });
  R.kpi({ id: "k6-3", label: () => "Aged 65+, First Nations", value: (y) => pick(age, App.FN_AGES, FN, y, "65+").share, fmt: (x) => d3.format(".1f")(x) + "%",
    delta: () => `vs <b>${App.pct(pick(age, App.FN_AGES, NI, R.f.year, "65+").share)}</b> non-Indigenous` });
  R.kpi({ id: "k6-4", label: () => "Remote areas, First Nations", value: (y) => pick(remote, ["Major Cities", "Regional", "Remote"], FN, y, "Remote").share, fmt: (x) => d3.format(".1f")(x) + "%",
    delta: () => `vs <b>${App.pct(pick(remote, ["Major Cities", "Regional", "Remote"], NI, R.f.year, "Remote").share)}</b> non-Indigenous` });

  const G = () => [
    { key: FN, label: "First Nations", colour: App.css("--c-older-2") },
    { key: NI, label: "Non-Indigenous", colour: App.css("--c-younger") },
  ];

  // V1 growth since 2011
  const growth = () => G().map((g) => {
    const vals = App.YEARS.map((y) => total(g.key, y));
    return { key: g.key, label: g.label, short: g.label.split(" ")[0].replace("-", ""), colour: g.colour, emphasis: g.key === FN,
      values: App.YEARS.map((y, i) => ({ x: y, y: vals[0] ? (vals[i] / vals[0]) * 100 : 0, count: vals[i] })) };
  });
  R.tile({
    id: "v6-1", file: "first_nations_growth",
    title: () => `Growth in ${R.m()} by First Nations status since 2011`,
    ctx: () => "2011 to 2021 · 2011 = 100 · click a dot to pick the year",
    draw: (el, opt) => Charts.line(el, {
      ...opt, legend: false, ariaLabel: "Line chart of growth since 2011", series: growth(), refLine: 100, yMin: 80, yFormat: d3.format("d"), focusX: R.f.year,
      onSelect: (d) => { R.stop(); R.set("year", d.x); },
      tip: (s, d) => App.tipCard({ kicker: "Growth, 2011 = 100", chip: d.x, title: s.label, colour: s.colour, value: d3.format(".0f")(d.y), rows: [[R.M(), App.fmt(d.count)]] }),
    }),
    table: () => { const g = growth(); return {
      columns: [{ key: "y", label: "Year" }, { key: "a", label: "First Nations", num: true, format: App.fmt }, { key: "b", label: "Non-Indigenous", num: true, format: App.fmt }],
      rows: App.YEARS.map((y, i) => ({ y, a: g[0].values[i].count, b: g[1].values[i].count })) }; },
  });

  // V2 age profile butterfly
  R.tile({
    id: "v6-2", file: "first_nations_age_profile",
    title: () => `${R.M()} by age group and First Nations status, ${R.f.year}`,
    ctx: () => `${R.ctx()} · % of each group`,
    draw: (el, opt) => {
      const [a, b] = G();
      const sa = shares(age, App.FN_AGES, FN, R.f.year);
      const sb = shares(age, App.FN_AGES, NI, R.f.year);
      Charts.butterfly(el, {
        ...opt, ariaLabel: "Back-to-back bars of the age profile", categories: [...App.FN_AGES].reverse(),
        left: { key: FN, label: a.label, colour: a.colour, value: (c) => sa.find((d) => d.c === c).share },
        right: { key: NI, label: b.label, colour: b.colour, value: (c) => sb.find((d) => d.c === c).share },
        tip: (d) => { const r = (d.side.key === FN ? sa : sb).find((x) => x.c === d.category);
          return App.tipCard({ kicker: "Age profile", chip: R.f.year, title: `${d.side.label}, age ${d.category}`, colour: d.side.colour, value: App.pct(d.value), unit: "of the group",
            rows: [[R.M(), App.fmt(r.n)], ...(r.flag ? [["Note", "includes n.p. values"]] : [])] }); },
      });
    },
    table: () => ({
      columns: [{ key: "c", label: "Age group" }, { key: "a", label: "First Nations (%)", num: true, format: d3.format(".1f") }, { key: "b", label: "Non-Indigenous (%)", num: true, format: d3.format(".1f") }],
      rows: App.FN_AGES.map((c) => ({ c, a: pick(age, App.FN_AGES, FN, R.f.year, c).share, b: pick(age, App.FN_AGES, NI, R.f.year, c).share })),
    }),
  });

  // V3 remoteness
  const AR = ["Major Cities", "Regional", "Remote"];
  R.tile({
    id: "v6-3", file: "first_nations_remoteness",
    title: () => `${R.M()} by remoteness area and First Nations status, ${R.f.year}`,
    ctx: () => `${R.ctx()} · % of each group`,
    draw: (el, opt) => {
      const COL = { "Major Cities": "--c-car", Regional: "--c-cycle", Remote: "--c-ped" };
      Charts.stack100(el, {
        ...opt, ariaLabel: "100% stacked bars of where people live, First Nations and non-Indigenous",
        rows: ["First Nations", "Non-Indigenous"],
        parts: AR.map((c) => ({ key: c, label: c, colour: App.css(COL[c]) })),
        value: (r, c) => pick(remote, AR, r === "First Nations" ? FN : NI, R.f.year, c).share,
        tip: (d) => App.tipCard({ kicker: "Where they live", chip: R.f.year, title: `${d.row}, ${d.part.label}`, colour: d.part.colour, value: App.pct(d.value), unit: "of the group" }),
      });
    },
    table: () => ({
      columns: [{ key: "c", label: "Remoteness" }, { key: "a", label: "First Nations (%)", num: true, format: d3.format(".1f") }, { key: "b", label: "Non-Indigenous (%)", num: true, format: d3.format(".1f") }],
      rows: AR.map((c) => ({ c, a: pick(remote, AR, FN, R.f.year, c).share, b: pick(remote, AR, NI, R.f.year, c).share })),
    }),
  });
  if (R.page === 6) R.refresh();
};

/* Colour key on the notes page (follows the theme) */
R.legend = () => {
  const items = [["--c-older", "Aged 65 to 74"], ["--c-older-2", "Aged 75+"], ["--c-neutral", "Ages under 65"], ["--c-car", "Car occupants"], ["--c-other", "Truck, bus or van"],
    ["--c-moto", "Motorcyclists"], ["--c-cycle", "Pedal cyclists"], ["--c-ped", "Pedestrians"]];
  document.getElementById("legendList").innerHTML = items.map(([c, l]) => `<li><span class="sw" style="background:var(${c})"></span>${l}</li>`).join("") +
    '<li><span class="sw hatch"></span>Includes n.p. values</li>';
};

/* =========================================================
   How to use guide
   ========================================================= */
App.guide = {
  open() {
    const body = App.modal.open("How to use this report");
    body.innerHTML = `<div class="guide"><div class="guide-grid">
      <div><h3 style="margin-top:0">Mouse and touch</h3><table class="wrap"><tbody>
        <tr><td><strong>Page tabs</strong></td><td>Bottom bar. Seven pages, one topic each.</td></tr>
        <tr><td><strong>Filters</strong></td><td>Top bar: year, measure, sex, age, road user, remoteness. Greyed out filters do not apply to that page.</td></tr>
        <tr><td><strong>Play</strong></td><td>Steps through 2011 to 2021 and every chart moves.</td></tr>
        <tr><td><strong>Click a chart</strong></td><td>Filters the page by that bar, year or line. Click it again to clear.</td></tr>
        <tr><td><strong>Hover or tap</strong></td><td>Tooltip with the exact number.</td></tr>
        <tr><td><strong>Visual buttons</strong></td><td>Focus mode, View data, Download CSV, Download PNG.</td></tr>
        <tr><td><strong>Grey line under a title</strong></td><td>The filters that visual is using right now.</td></tr>
        <tr><td><strong>Display</strong></td><td>Six themes, including high contrast and colour-blind safe, and view size.</td></tr>
        <tr><td><strong>Share</strong></td><td>Copies a link to this exact page and filters.</td></tr>
      </tbody></table></div>
      <div><h3 style="margin-top:0">Keyboard</h3><table class="wrap key-table"><tbody>
        <tr><td><kbd>1</kbd> to <kbd>7</kbd></td><td>Go to a page</td></tr>
        <tr><td><kbd>Tab</kbd></td><td>Next filter, button or chart</td></tr>
        <tr><td><kbd>&larr;</kbd><kbd>&uarr;</kbd><kbd>&rarr;</kbd><kbd>&darr;</kbd> / <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></td><td>Move between points in a chart, or between page tabs</td></tr>
        <tr><td><kbd>Enter</kbd></td><td>Filter by the focused point</td></tr>
        <tr><td><kbd>P</kbd></td><td>Play or pause the years</td></tr>
        <tr><td><kbd>Q</kbd> / <kbd>E</kbd></td><td>Previous / next year</td></tr>
        <tr><td><kbd>R</kbd></td><td>Reset all filters</td></tr>
        <tr><td><kbd>T</kbd></td><td>Next theme</td></tr>
        <tr><td><kbd>?</kbd></td><td>This guide</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Close a tooltip or pop-up</td></tr>
      </tbody></table></div></div></div>`;
  },
  hint() {
    if (App.store.get("reportGuideSeen")) return;
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "dialog");
    t.setAttribute("aria-label", "Tip");
    t.innerHTML = `<p><strong>New here?</strong> Click any bar to filter, press play to animate the years, or open the guide (<kbd>?</kbd>).</p>
      <div class="row"><button class="tbtn accent" type="button">Show me</button><button class="tbtn" type="button">Got it</button></div>`;
    document.body.appendChild(t);
    const close = () => { App.store.set("reportGuideSeen", "1"); t.remove(); };
    const [show, ok] = t.querySelectorAll("button");
    show.addEventListener("click", () => { close(); App.guide.open(); });
    ok.addEventListener("click", close);
  },
};

/* =========================================================
   Header: logo, display settings, guide; keyboard shortcuts
   ========================================================= */
R.setupHeader = () => {
  document.getElementById("logo").innerHTML = App.logo();
  const themeSel = document.getElementById("themeSelect");
  themeSel.innerHTML = App.theme.options.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
  App.theme.apply(App.theme.pref, false);
  themeSel.addEventListener("change", () => App.theme.apply(themeSel.value));
  const viewSel = document.getElementById("viewSelect");
  viewSel.innerHTML = App.view.options.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
  App.view.apply(App.view.pref, false);
  viewSel.addEventListener("change", () => App.view.apply(viewSel.value));

  const dBtn = document.getElementById("displayBtn");
  const panel = document.getElementById("settings");
  const setOpen = (open) => { panel.hidden = !open; dBtn.setAttribute("aria-expanded", open); };
  dBtn.addEventListener("click", () => { setOpen(panel.hidden); if (!panel.hidden) themeSel.focus(); });
  document.addEventListener("pointerdown", (e) => { if (!panel.hidden && !e.target.closest("#settings, #displayBtn")) setOpen(false); });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { setOpen(false); dBtn.focus(); } });
  document.getElementById("howBtn").addEventListener("click", () => App.guide.open());
  // logo and title go back to the Overview page
  document.getElementById("homeLink").addEventListener("click", (e) => { e.preventDefault(); R.go(1, true); });
  // the report description pop-up next to the title (hover, focus or click)
  const pop = document.querySelector(".about-pop");
  const info = document.getElementById("infoBtn");
  info.addEventListener("click", () => { const on = !pop.classList.contains("open"); pop.classList.toggle("open", on); info.setAttribute("aria-expanded", on); });
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".about-pop")) { pop.classList.remove("open"); info.setAttribute("aria-expanded", false); } });
  info.addEventListener("keydown", (e) => { if (e.key === "Escape") { pop.classList.remove("open"); info.setAttribute("aria-expanded", false); } });

  App.keys.handlers.push((e, key) => {
    if (App.modal.el && App.modal.el.classList.contains("open")) return false;
    if (/^[1-7]$/.test(key)) { R.go(+key, true); return true; }
    if (key === "p") { e.preventDefault(); R.timer ? R.stop() : R.play(); return true; }
    if (key === "q" && R.f.year > R.FIRST) { R.stop(); R.set("year", R.f.year - 1); return true; }
    if (key === "e" && R.f.year < R.LAST) { R.stop(); R.set("year", R.f.year + 1); return true; }
    if (key === "r") { R.reset(); return true; }
    return false;
  });
};

/* =========================================================
   Start
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  R.readURL();
  R.setupHeader();
  R.setupTabs();
  R.setupSlicers();
  R.syncControls();
  R.legend();
  App.redrawers.add(() => { R.kpis.forEach((k) => { if (k.page === R.page) k.draw(); }); R.legend(); });

  App.data.load().then((rows) => {
    // roll the 71,000 monthly rows up into a smaller "cube" so every filter change is instant
    const cube = d3.rollups(rows, (l) => ({ hosp: d3.sum(l, (d) => d.hosp), bed: d3.sum(l, (d) => d.bedDays) }),
      (d) => [d.year, d.age, d.sex, d.ruGroup, d.remoteness, d.counterparty].join("|"));
    R.cube = cube.map(([k, s]) => {
      const [year, age, sex, ru, area, cp] = k.split("|");
      return { year: +year, age, sex, ru, area, cp, older: App.OLDER_AGES.includes(age), hosp: s.hosp, bed: s.bed };
    })
      // leave out uncertain records: road user "Other or unknown" and remoteness area not stated
      // (unknown age and sex were already removed in App.data.load)
      .filter((d) => d.ru !== "Not recorded" && d.area !== "Missing");

    // show what D3 loaded, like Lab 6
    console.log("d3.csv loaded", rows.length, "rows. First 3:", rows.slice(0, 3));
    console.log("Grouped with d3.rollups:", R.cube.length, "rows", R.cube.slice(0, 3));
    R.page1();
    R.page2();
    R.page3();
    R.page4();
    R.go(R.page);
    App.data.loadState().then(R.page5).catch((err) => App.showLoadError("#v5-1", err));
    App.data.loadFN().then(R.page6).catch((err) => App.showLoadError("#v6-1", err));
    App.guide.hint();
  }).catch((err) => App.showLoadError("#v1-1", err));
});
