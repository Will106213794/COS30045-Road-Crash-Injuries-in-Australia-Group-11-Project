/* =========================================================
   core.js  -  shared helpers for the report
   ---------------------------------------------------------
   App.theme     6 colour themes (Match my device, Dark, Light,
                 High contrast, Colour-blind safe, Soft reading)
   App.view      view size / magnification (Auto fits the device)
   App.tip       styled tooltip card (mouse, touch and keyboard)
   App.nav       arrow key / W A S D movement between chart points
   App.keys      keyboard shortcuts
   App.modal     pop-up used by Focus mode, View data and the guide
   App.data      loads and cleans the three CSV files
   App.responsive  redraws a chart when its box or the theme changes
   ========================================================= */

const App = {};

/* ---------- Constants used across pages ---------- */
App.DATA_FILE = "data/road_crash_hospitalisations.csv";
App.AGE_ORDER = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+"];
App.OLDER_AGES = ["65-74", "75+"];
App.RU_ORDER = ["Car occupants", "Motorcyclist", "Pedal cyclist", "Pedestrian", "Other"];
App.YEARS = d3.range(2011, 2022);

App.fmt = d3.format(",");
App.fmt1 = d3.format(",.1f");
App.pct = (v) => d3.format(".1f")(v) + "%";
App.signedPct = (v) => (v > 0 ? "+" : "") + d3.format(".0f")(v) + "%";

/* Reads a colour from the active theme, so charts always match it. */
App.css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

App.ageColour = (age) =>
  age === "65-74" ? App.css("--c-older") : age === "75+" ? App.css("--c-older-2") : App.css("--c-neutral");

App.ruColour = (group) =>
  ({
    "Car occupants": App.css("--c-car"),
    Motorcyclist: App.css("--c-moto"),
    "Pedal cyclist": App.css("--c-cycle"),
    Pedestrian: App.css("--c-ped"),
    Other: App.css("--c-other"),
  })[group] || App.css("--c-other");

/* In the colour-blind theme every series also gets its own dash pattern. */
App.DASHES = [null, "8 4", "2 4", "10 3 2 3", "4 4", "1 3", "12 6"];
App.isCvd = () => document.documentElement.dataset.theme === "cvd";

/* localStorage can throw in private windows, so wrap it. */
App.store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } },
};

/* Simple event hub so pages can react to theme or view changes. */
App.redrawers = new Set();
App.redrawAll = () => App.redrawers.forEach((fn) => fn());

/* =========================================================
   Themes
   ========================================================= */
App.theme = {
  options: [
    { id: "system", label: "Match my device" },
    { id: "dark", label: "Dark" },
    { id: "light", label: "Light" },
    { id: "contrast", label: "High contrast" },
    { id: "cvd", label: "Colour-blind safe" },
    { id: "soft", label: "Soft reading" },
  ],
  pref: "dark",

  init() {
    const saved = App.store.get("themePref");
    this.pref = this.options.some((o) => o.id === saved) ? saved : "dark";
    this.apply(this.pref, false);
    // follow the operating system when "System" is chosen
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if (this.pref === "system") this.apply("system", false);
    });
  },

  resolve(pref) {
    if (pref !== "system") return pref;
    return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  },

  apply(pref, save = true) {
    this.pref = pref;
    document.documentElement.dataset.theme = this.resolve(pref);
    if (save) App.store.set("themePref", pref);
    const sel = document.getElementById("themeSelect");
    if (sel) {
      sel.value = pref;
      // show which theme "Match my device" is using right now, so it never looks like a duplicate
      const resolved = this.resolve("system") === "light" ? "Light" : "Dark";
      const opt = sel.querySelector('option[value="system"]');
      if (opt) opt.textContent = `Match my device (${resolved})`;
    }
    App.redrawAll();
  },

  next() {
    const ids = this.options.map((o) => o.id).filter((id) => id !== "system");
    const i = ids.indexOf(document.documentElement.dataset.theme);
    this.apply(ids[(i + 1) % ids.length]);
    App.announce(`Theme: ${this.options.find((o) => o.id === this.pref).label}`);
  },
};

/* =========================================================
   View size (magnification)
   Auto picks a size from the screen width and height:
   phones and tablets 100%, short laptop screens 90%,
   large monitors 115%, very large or 4K screens 130%.
   ========================================================= */
App.view = {
  options: [
    { id: "auto", label: "Auto" },
    { id: "0.75", label: "75%" },
    { id: "0.9", label: "90%" },
    { id: "1", label: "100%" },
    { id: "1.1", label: "110%" },
    { id: "1.25", label: "125%" },
    { id: "1.5", label: "150%" },
  ],
  pref: "auto",

  auto() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w < 768) return 1;                 // phones
    if (w < 1100) return h < 700 ? 0.9 : 1; // tablets and small laptops
    if (w >= 2400) return 1.3;             // 4K and ultra-wide
    if (w >= 1900) return 1.15;            // large monitors
    if (h < 720) return 0.9;               // short laptop screens
    return 1;
  },

  init() {
    const saved = App.store.get("viewPref");
    this.pref = this.options.some((o) => o.id === saved) ? saved : "auto";
    this.apply(this.pref, false);
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => { if (this.pref === "auto") this.apply("auto", false); }, 150);
    });
  },

  apply(pref, save = true) {
    this.pref = pref;
    const z = pref === "auto" ? this.auto() : +pref;
    document.documentElement.style.setProperty("--zoom", z);
    if (save) App.store.set("viewPref", pref);
    const sel = document.getElementById("viewSelect");
    if (sel) {
      sel.value = pref;
      const opt = sel.querySelector('option[value="auto"]');
      if (opt) opt.textContent = `Auto (${Math.round(z * 100)}%)`;
    }
  },
};

App.theme.init(); // run straight away so the page never flashes the wrong theme
App.view.init();

/* Screen reader announcements (theme changes, autoplay year, etc.) */
App.announce = (text) => {
  let live = document.getElementById("srLive");
  if (!live) {
    live = document.createElement("div");
    live.id = "srLive";
    live.className = "sr-live";
    live.setAttribute("aria-live", "polite");
    document.body.appendChild(live);
  }
  live.textContent = text;
};

/* =========================================================
   Logo: a road running toward a rising sun (getting older),
   drawn in the theme's own colours so it changes with the theme.
   ========================================================= */
App.logo = () => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M24 3.5 L44.5 24 L24 44.5 L3.5 24 Z" style="fill:var(--c-older);stroke:var(--text)" stroke-width="2.6" stroke-linejoin="round"/>
      <g style="stroke:var(--bg);fill:var(--bg)" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="21.5" cy="14.6" r="3" stroke="none"/>
        <path d="M21.6 19.2 Q19.6 23.2 19.8 28" stroke-width="4.2" fill="none"/>
        <path d="M19.8 28 L16.8 34.4 M19.8 28 L23.4 34.4" stroke-width="3" fill="none"/>
        <path d="M21.2 21.4 L26.6 25.2" stroke-width="2.6" fill="none"/>
        <path d="M26.6 25.2 L27.8 35" stroke-width="1.8" fill="none"/>
      </g>
    </svg>`;

/* =========================================================
   Tooltip
   App.tipCard() builds the styled card. App.tip.bind() wires it to
   chart marks for mouse, touch (tap) and keyboard (focus).
   ========================================================= */
App.tipCard = ({ kicker = "", chip = "", title = "", colour = "", value = "", unit = "", rows = [] }) =>
  `<div class="tt-head"><span class="tt-kicker">${kicker}</span>${chip !== "" ? `<span class="tt-chip">${chip}</span>` : ""}</div>` +
  `<div class="tt-title">${colour ? `<i style="background:${colour}"></i>` : ""}${title}</div>` +
  (value !== "" ? `<div class="tt-value">${value}${unit ? `<small>${unit}</small>` : ""}</div>` : "") +
  (rows.length ? `<div class="tt-rows">${rows.map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join("")}</div>` : "");

App.tip = {
  el: null,

  ensure() {
    if (this.el) return this.el;
    this.el = document.createElement("div");
    this.el.className = "tooltip";
    this.el.setAttribute("role", "status");
    document.body.appendChild(this.el);
    // tap or click away hides the tooltip; a mouse click inside a chart keeps it (that chart becomes active)
    document.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".mark")) return;
      if (e.pointerType !== "touch" && e.target.closest(".chart")) return;
      this.hide();
    });
    // Scrolling hides a mouse or touch tooltip. Tab also scrolls the focused
    // point into view, so a keyboard-focused point keeps its tooltip and it moves along.
    window.addEventListener("scroll", () => {
      const f = document.activeElement;
      if (f && f.classList && f.classList.contains("mark") && this.el.classList.contains("show")) this.near(f);
      else this.hide();
    }, { passive: true });
    return this.el;
  },

  show(html, x, y) {
    const el = this.ensure();
    el.innerHTML = html;
    el.classList.add("show");
    this.place(x, y);
  },

  near(node) {
    const r = node.getBoundingClientRect();
    this.place(r.left + r.width / 2, r.top);
  },

  place(x, y) {
    const el = this.el;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pad = 8;
    let left = x + 16;
    if (left + w > window.innerWidth - pad) left = x - w - 16; // flip to the left side
    left = Math.max(pad, left);
    let top = y - h - 14;
    if (top < pad) top = y + 20; // flip below near the top edge
    top = Math.min(top, window.innerHeight - h - pad);
    el.style.left = left + "px";
    el.style.top = top + "px";
  },

  hide() { if (this.el) this.el.classList.remove("show"); },

  /* htmlFn(d) returns tooltip HTML. opts.onSelect(d) runs on click, tap or Enter. */
  bind(selection, htmlFn, opts = {}) {
    selection
      .classed("mark", true)
      .attr("tabindex", -1) // App.nav.prepare() makes one mark per chart the Tab stop
      .attr("role", "img")
      .attr("aria-label", (d) => htmlFn(d).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .on("pointerenter", function (event, d) { App.tip.show(htmlFn(d), event.clientX, event.clientY); Charts.highlight(this, true); })
      .on("pointermove", (event, d) => App.tip.show(htmlFn(d), event.clientX, event.clientY))
      .on("pointerleave", function (event) { if (event.pointerType !== "touch") App.tip.hide(); Charts.highlight(this, false); })
      .on("focus", function (event, d) {
        App.tip.show(htmlFn(d), 0, 0);
        App.tip.near(this);
        Charts.highlight(this, true);
      })
      .on("blur", function () { App.tip.hide(); Charts.highlight(this, false); });
    if (opts.onSelect) {
      selection.style("cursor", "pointer").on("click", (event, d) => opts.onSelect(d)).each(function (d) { this.__select = () => opts.onSelect(d); });
    }
  },
};

/* =========================================================
   Keyboard navigation inside charts
   Each chart is ONE Tab stop (a "roving tabindex"), so Tab moves
   chart to chart. Inside a chart:
   Left / A, Right / D   previous / next point
   Up / W, Down / S      the point above / below
   Home, End             first / last point
   Enter or Space        select (on the dashboard: jump to that year)
   ========================================================= */
App.nav = {
  /* Clicking anywhere on a chart with the mouse makes it the "active" chart:
     the nearest point gets focus, so the arrow keys, W A S D, Home and End
     work straight away without pressing Tab first. */
  clickToFocus(el) {
    if (el.__clickFocus) return;
    el.__clickFocus = true;
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      if (e.target.closest("button, a, select, input")) return; // legend and sort buttons keep their own job
      const marks = [...el.querySelectorAll(".mark")];
      if (!marks.length) return;
      let target = e.target.closest(".mark");
      if (!target) {
        let best = Infinity;
        marks.forEach((m) => {
          const r = m.getBoundingClientRect();
          const d = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY);
          if (d < best) { best = d; target = m; }
        });
      }
      marks.forEach((m) => m.setAttribute("tabindex", "-1"));
      target.setAttribute("tabindex", "0");
      e.preventDefault(); // stop the browser from moving focus back to the page
      target.focus({ preventScroll: true });
    });
  },

  prepare(el, focusIndex) {
    const marks = [...el.querySelectorAll(".mark")];
    marks.forEach((m) => m.setAttribute("tabindex", "-1"));
    if (!marks.length) return;
    const i = focusIndex != null ? Math.min(focusIndex, marks.length - 1) : 0;
    marks[i].setAttribute("tabindex", "0");
    if (focusIndex != null) marks[i].focus({ preventScroll: true });
  },

  move(from, to) {
    if (!to) return;
    from.setAttribute("tabindex", "-1");
    to.setAttribute("tabindex", "0");
    to.focus();
  },

  centre(m) {
    const r = m.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },

  /* Finds the next mark in a direction. Line charts move along the same line
     for left/right and jump between lines for up/down; other charts use position. */
  find(cur, dir) {
    const root = cur.closest("svg");
    const marks = [...root.querySelectorAll(".mark")];
    const s = cur.dataset.s;
    const i = cur.dataset.i;
    if (s !== undefined && i !== undefined) {
      if (dir === "left" || dir === "right") {
        const step = dir === "left" ? -1 : 1;
        return marks.find((m) => m.dataset.s === s && +m.dataset.i === +i + step);
      }
      const c = this.centre(cur);
      const same = marks.filter((m) => m !== cur && m.dataset.i === i).map((m) => ({ m, y: this.centre(m).y }));
      const cand = same.filter((o) => (dir === "up" ? o.y < c.y - 0.5 : o.y > c.y + 0.5));
      cand.sort((a, b) => Math.abs(a.y - c.y) - Math.abs(b.y - c.y));
      return cand.length ? cand[0].m : null;
    }
    const c = this.centre(cur);
    let best = null;
    let bestScore = Infinity;
    marks.forEach((m) => {
      if (m === cur) return;
      const p = this.centre(m);
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      let main;
      let side;
      if (dir === "left") { main = -dx; side = Math.abs(dy); }
      if (dir === "right") { main = dx; side = Math.abs(dy); }
      if (dir === "up") { main = -dy; side = Math.abs(dx); }
      if (dir === "down") { main = dy; side = Math.abs(dx); }
      if (main <= 1) return;
      const score = main + side * 3;
      if (score < bestScore) { bestScore = score; best = m; }
    });
    return best;
  },
};

App.keys = {
  handlers: [], // pages add their own shortcuts here: fn(event) returns true if handled

  init() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { App.tip.hide(); return; }
      const t = e.target;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      // Typing in a text box: never steal keys.
      const textBox = t.closest && t.closest("textarea, [contenteditable], input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button])");
      if (textBox) return;
      // On a slider or dropdown, the arrow keys, Home and End keep their normal job
      // (change the slider or the option), but the page shortcuts still work.
      const formCtl = t.closest && t.closest("select, input[type=range]");
      if (formCtl && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", " ", "Enter"].includes(key)) return;
      if (formCtl && t.tagName === "SELECT" && !/^[1-7qepr?]$/.test(key)) return; // letters still jump through options
      const dir = { ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right", ArrowUp: "up", w: "up", ArrowDown: "down", s: "down" }[key];

      // 1. inside a chart
      if (t.classList && t.classList.contains("mark")) {
        if (dir) { e.preventDefault(); App.nav.move(t, App.nav.find(t, dir)); return; }
        if (key === "Home" || key === "End") {
          e.preventDefault();
          const marks = [...t.closest("svg").querySelectorAll(".mark")];
          App.nav.move(t, key === "Home" ? marks[0] : marks[marks.length - 1]);
          return;
        }
        if ((key === "Enter" || key === " ") && t.__select) { e.preventDefault(); t.__select(); return; }
      }

      // 2. along the main menu or tab lists (left/right also with A/D)
      const navLink = t.closest && t.closest(".main-nav a, .chapter-nav a, [role='tab']");
      if (navLink && (dir === "left" || dir === "right")) {
        const group = navLink.closest("ul, ol, [role='tablist']");
        const items = [...group.querySelectorAll("a, [role='tab']")];
        const i = items.indexOf(navLink);
        const next = items[(i + (dir === "left" ? -1 : 1) + items.length) % items.length];
        e.preventDefault();
        next.focus();
        if (next.getAttribute("role") === "tab") next.click();
        return;
      }

      // 3. global shortcuts
      if (e.key === "?") { e.preventDefault(); App.guide.open(); return; }
      if (key === "t") { App.theme.next(); return; }
      for (const h of this.handlers) if (h(e, key)) return;
    });
  },
};
App.keys.init();

/* =========================================================
   Modal (Expand, View data, How to use)
   ========================================================= */
App.modal = {
  el: null,
  lastFocus: null,
  onClose: null,

  ensure() {
    if (this.el) return this.el;
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal-head">
          <h2 id="modalTitle"></h2>
          <div class="card-tools" id="modalTools"></div>
          <button class="btn" type="button" id="modalClose">Close &#10005;</button>
        </div>
        <div class="modal-body" id="modalBody"></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (e) => { if (e.target === m) this.close(); });
    m.querySelector("#modalClose").addEventListener("click", () => this.close());
    document.addEventListener("keydown", (e) => {
      if (!m.classList.contains("open")) return;
      if (e.key === "Escape") this.close();
      if (e.key === "Tab") {
        // keep keyboard focus inside the pop-up
        const f = [...m.querySelectorAll("button, a, [tabindex='0'], select, input")].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    this.el = m;
    return m;
  },

  open(title, onClose) {
    const m = this.ensure();
    this.lastFocus = document.activeElement;
    this.onClose = onClose || null;
    m.querySelector("#modalTitle").textContent = title;
    m.querySelector("#modalTools").innerHTML = "";
    const body = m.querySelector("#modalBody");
    body.innerHTML = "";
    m.classList.add("open");
    document.body.style.overflow = "hidden";
    m.querySelector("#modalClose").focus();
    return body;
  },

  close() {
    if (!this.el || !this.el.classList.contains("open")) return;
    this.el.classList.remove("open");
    document.body.style.overflow = "";
    App.tip.hide();
    if (this.onClose) this.onClose();
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },
};

/* =========================================================
   Data loading and cleaning
   ========================================================= */
App.data = {
  promise: null,
  info: null,

  load() {
    if (this.promise) return this.promise;
    // KNIME can put an invisible byte-order mark (﻿) inside the first header,
    // so d["Calendar year"] would be undefined. get() checks both spellings.
    const get = (d, key) => (d[key] !== undefined ? d[key] : d["﻿" + key]);
    const ruGroup = (ru) =>
      ru.startsWith("Car ") ? "Car occupants"
        : ru === "Motorcyclist" ? "Motorcyclist"
        : ru === "Pedal cyclist" ? "Pedal cyclist"
        : ru === "Pedestrian" ? "Pedestrian"
        : "Other";

    this.promise = d3
      .csv(App.DATA_FILE, (d) => ({
        year: +get(d, "Calendar year"),
        month: get(d, "Month"),
        remoteness: get(d, "ABS remoteness area"),
        cause: get(d, "Cause of injury"),
        age: get(d, "Age group"),
        sex: get(d, "Sex"),
        roadUser: get(d, "Road user"),
        counterparty: get(d, "Counterparty"),
        bedDays: +get(d, "Bed days") || 0,
        hosp: +get(d, "Hospitalisations") || 0,
      }))
      .then((raw) => {
        // Excel can turn "8-16" into a date when a CSV is re-saved. Fix it if it happens.
        raw.forEach((d) => { if (d.age === "16-Aug" || d.age === "Aug-16") d.age = "8-16"; });
        const traffic = raw.filter((d) => !d.cause || d.cause === "Traffic");
        const clean = traffic.filter((d) => App.AGE_ORDER.includes(d.age) && (d.sex === "Male" || d.sex === "Female"));
        clean.forEach((d) => {
          d.older = App.OLDER_AGES.includes(d.age);
          d.ageBand = d.older ? "Older (65+)" : "Under 65";
          d.ruGroup = ruGroup(d.roadUser);
        });
        this.info = {
          rawRows: raw.length,
          rawHosp: d3.sum(raw, (d) => d.hosp),
          cleanRows: clean.length,
          cleanHosp: d3.sum(clean, (d) => d.hosp),
          droppedRows: raw.length - clean.length,
          droppedHosp: d3.sum(raw, (d) => d.hosp) - d3.sum(clean, (d) => d.hosp),
        };
        return clean;
      });
    return this.promise;
  },
};

/* State and territory file, and First Nations file.
   Each file is the five side-by-side tables from the BITRE "raw" tab, stacked by KNIME
   into one long table with a Breakdown column (e.g. "Age Group") and a Category column
   (e.g. "65-74"). Blank cells are "n.p." (not published because the count is too small);
   they are kept as null so charts can mark them, never treated as zero. */
App.num = (v) => (v === undefined || v === null || v === "" || isNaN(+v) ? null : +v);
App.data.state = null;
App.data.loadState = () => {
  if (App.data.state) return App.data.state;
  const get = (d, key) => (d[key] !== undefined ? d[key] : d["\ufeff" + key]);
  App.data.state = d3.csv("data/state_territory_hospitalisations.csv", (d) => ({
    year: +get(d, "Calendar year"),
    half: d["6-monthly"],
    state: d["state or territory"],
    breakdown: d.Breakdown,
    category: d.Category || "",
    hosp: App.num(d["count of cases excluding died in hospitals within 30 days"]),
    bed: App.num(d["Bed days excluding died in hospitals within 30 days"]),
  }));
  return App.data.state;
};
App.data.fn = null;
App.data.loadFN = () => {
  if (App.data.fn) return App.data.fn;
  const get = (d, key) => (d[key] !== undefined ? d[key] : d["\ufeff" + key]);
  App.data.fn = d3
    .csv("data/first_nations_hospitalisations.csv", (d) => ({
      year: +get(d, "Calendar year"),
      half: d["6-monthly"],
      status: d["First Nations status"],
      breakdown: d.Breakdown,
      category: d.Category || "",
      hosp: App.num(d.Hospitalisations),
      bed: App.num(d["Bed days excluding died in hospitals within 30 days"]),
    }))
    // "Overall" is an exact copy of the "Age" rows in this export, so it is dropped to avoid double counting
    .then((rows) => rows.filter((r) => r.breakdown !== "Overall"));
  return App.data.fn;
};
App.STATES = ["NSW", "Vic", "Qld", "WA", "SA", "Tas", "ACT", "NT"];
App.STATE_NAMES = { NSW: "New South Wales", Vic: "Victoria", Qld: "Queensland", WA: "Western Australia", SA: "South Australia", Tas: "Tasmania", ACT: "Australian Capital Territory", NT: "Northern Territory" };
App.FN_AGES = ["0-7", "8-16", "17-25", "26-39", "40-64", "65+"];

App.showLoadError = (container, err) => {
  console.error(err);
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) return;
  el.innerHTML = `<div class="error-box" role="alert"><strong>The data could not be loaded.</strong>
    <p>Open this site through VS Code Live Server (right-click <code>index.html</code>, Open with Live Server) or GitHub Pages.
    Opening the HTML file directly from your folder blocks the CSV. Also check that <code>${App.DATA_FILE}</code> exists.</p></div>`;
};

/* =========================================================
   Helpers: tables and CSV download
   ========================================================= */
App.buildTable = (columns, rows) => {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", "Data table");
  const table = document.createElement("table");
  table.innerHTML =
    `<thead><tr>${columns.map((c) => `<th scope="col"${c.num ? ' class="num"' : ""}>${c.label}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows
      .map((r) => `<tr>${columns.map((c) => `<td${c.num ? ' class="num"' : ""}>${c.format ? c.format(r[c.key]) : r[c.key]}</td>`).join("")}</tr>`)
      .join("")}</tbody>`;
  wrap.appendChild(table);
  return wrap;
};

App.downloadCSV = (filename, rows, columns) => {
  const out = rows.map((r) => {
    const o = {};
    columns.forEach((c) => { o[c.label] = r[c.key]; });
    return o;
  });
  const csv = d3.csvFormat(out, columns.map((c) => c.label));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* Saves a chart as a PNG image, with its title, caption and source,
   using the current theme's colours (good for reports and slides). */
App.downloadPNG = (chartEl, title, caption, filename) => {
  const svg = chartEl.querySelector("svg");
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  const scale = 2;
  const pad = 24;
  const head = 56;
  // wrap the caption onto as many lines as it needs
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "12px system-ui, sans-serif";
  const lines = [];
  let cur = "";
  (caption || "").split(/\s+/).filter(Boolean).forEach((w) => {
    const t = cur ? cur + " " + w : w;
    if (measure.measureText(t).width > vb.width && cur) { lines.push(cur); cur = w; } else cur = t;
  });
  if (cur) lines.push(cur);
  const foot = 20 + lines.length * 16 + 16;
  const W = vb.width + pad * 2;
  const H = vb.height + head + foot;
  // copy the SVG and bake the CSS colours in, so the image looks like the screen
  const clone = svg.cloneNode(true);
  const srcEls = [svg, ...svg.querySelectorAll("*")];
  const dstEls = [clone, ...clone.querySelectorAll("*")];
  srcEls.forEach((src, i) => {
    const cs = getComputedStyle(src);
    const dst = dstEls[i];
    ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-size", "font-weight", "font-family", "paint-order"].forEach((p) => {
      const v = cs.getPropertyValue(p);
      if (v) dst.style.setProperty(p, v);
    });
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", vb.width);
  clone.setAttribute("height", vb.height);
  const data = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = W * scale;
    c.height = H * scale;
    const ctx = c.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = App.css("--surface") || "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = App.css("--text") || "#000000";
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.fillText(title, pad, 34);
    ctx.drawImage(img, pad, head);
    ctx.fillStyle = App.css("--muted") || "#555555";
    ctx.font = "12px system-ui, sans-serif";
    const src = "Source: BITRE (2023) Hospitalised Injury. The Growing Older Group, COS30045 Group 11.";
    lines.forEach((l, i) => ctx.fillText(l, pad, head + vb.height + 18 + i * 16));
    ctx.fillText(src, pad, head + vb.height + 18 + lines.length * 16);
    c.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);
};

/* =========================================================
   Responsive drawing
   Redraws a chart when its box changes width (phone, tablet, desktop,
   expanded view, view size) and when the theme changes. If a chart point
   had keyboard focus, focus goes back to the same point after the redraw.
   ========================================================= */
App.responsive = (el, drawFn) => {
  // Redraws when the chart box changes size (window, view size, focus mode)
  // or when the theme or filters change. A chart on a hidden report page has
  // no size, so it is skipped and drawn fresh the moment its page opens.
  let last = "";
  let frame = null;
  const run = (force) => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w) { last = ""; return; }
    const size = w + "x" + h;
    if (!force && size === last) return;
    last = size;
    const a = document.activeElement;
    let keep = null;
    if (a && el.contains(a) && a.classList.contains("mark")) keep = [...el.querySelectorAll(".mark")].indexOf(a);
    drawFn();
    App.nav.prepare(el, keep);
    App.nav.clickToFocus(el);
  };
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => run(false));
  });
  ro.observe(el);
  const themeRedraw = () => run(true);
  App.redrawers.add(themeRedraw);
  run(true);
  return {
    redraw: () => run(true),
    stop: () => { ro.disconnect(); App.redrawers.delete(themeRedraw); },
  };
};
