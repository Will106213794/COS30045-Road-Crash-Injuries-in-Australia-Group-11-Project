/* =========================================================
   story.js  -  the six storylines
   Every chart card gets its own small control bar:
   - Admissions / Bed days switch (which number to count)
   - a year player: drag the slider or press play to watch the
     years build up (lines grow, bars light up, comparisons move)
   The callout numbers in the text always use admissions.
   ========================================================= */

const Story = {};

/* Adds a control bar to a chart card and returns its live state.
   opts.measure: show the Admissions / Bed days switch
   opts.player: {min, max, label} shows a year slider with play
   onChange(state) is called whenever something changes. */
Story.controls = (cardEl, opts, onChange) => {
  const st = { measure: "hosp", year: opts.player ? opts.player.max : null };
  const box = document.createElement("div");
  box.className = "story-controls";
  let html = "";
  if (opts.measure) {
    html += `<div class="mini-seg" role="group" aria-label="What to count">
      <button type="button" data-m="hosp" aria-pressed="true">Admissions</button>
      <button type="button" data-m="bed" aria-pressed="false">Bed days</button></div>`;
  }
  if (opts.player) {
    const id = cardEl.id + "Yr";
    html += `<div class="player small-player">
      <label for="${id}">${opts.player.label || "Up to"}</label>
      <output for="${id}">${opts.player.max}</output>
      <input type="range" id="${id}" min="${opts.player.min}" max="${opts.player.max}" step="1" value="${opts.player.max}">
      <button class="play-btn" type="button" aria-pressed="false" aria-label="Play the years">&#9654;</button></div>`;
  }
  box.innerHTML = html;
  cardEl.querySelector("header").insertAdjacentElement("afterend", box);

  box.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => {
    st.measure = b.dataset.m;
    box.querySelectorAll("[data-m]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    onChange(st);
  }));

  if (opts.player) {
    const range = box.querySelector("input[type=range]");
    const out = box.querySelector("output");
    const btn = box.querySelector(".play-btn");
    let timer = null;
    const set = (y) => { st.year = y; range.value = y; out.textContent = y; onChange(st); };
    const stop = () => { clearInterval(timer); timer = null; btn.setAttribute("aria-pressed", "false"); btn.innerHTML = "&#9654;"; btn.setAttribute("aria-label", "Play the years"); };
    range.addEventListener("input", () => { stop(); set(+range.value); });
    btn.addEventListener("click", () => {
      if (timer) return stop();
      if (st.year >= opts.player.max) set(opts.player.min);
      btn.setAttribute("aria-pressed", "true");
      btn.innerHTML = "&#10074;&#10074;";
      btn.setAttribute("aria-label", "Pause");
      timer = setInterval(() => {
        if (st.year >= opts.player.max) return stop();
        set(st.year + 1);
        App.announce(`${opts.player.label || "Up to"} ${st.year}`);
      }, 900);
    });
  }
  return st;
};

Story.word = (st) => (st.measure === "hosp" ? "hospitalisations" : "bed days");
Story.Word = (st) => (st.measure === "hosp" ? "Hospitalisations" : "Bed days");

App.data
  .load()
  .then((rows) => {
    const first = 2011;
    const last = 2021;
    const years = App.YEARS;
    const val = (st) => (d) => (st.measure === "hosp" ? d.hosp : d.bedDays);
    const sum = (filter, value = (d) => d.hosp) => d3.sum(rows.filter(filter), value);
    // fast lookups: totals by year (and by age, sex, road user) for both measures
    const cube = d3.rollup(rows, (v) => ({ hosp: d3.sum(v, (d) => d.hosp), bedDays: d3.sum(v, (d) => d.bedDays) }),
      (d) => d.year, (d) => d.age, (d) => d.sex, (d) => d.ruGroup);
    const total = (st, f) => {
      let t = 0;
      cube.forEach((ages, y) => ages.forEach((sexes, a) => sexes.forEach((rus, s) => rus.forEach((v, r) => {
        if (f({ year: y, age: a, sex: s, ru: r, older: App.OLDER_AGES.includes(a) })) t += v[st.measure === "hosp" ? "hosp" : "bedDays"];
      }))));
      return t;
    };

    /* ---------- 01: national total ---------- */
    const t1 = sum((d) => d.year === first);
    const t2 = sum((d) => d.year === last);
    document.getElementById("s1Change").textContent = App.signedPct(((t2 - t1) / t1) * 100);
    const c1el = document.getElementById("c1");
    let c1;
    const s1 = Story.controls(c1el, { measure: true, player: { min: 2012, max: last } }, () => c1.redraw());
    const c1series = () => years.map((y) => ({ x: y, y: total(s1, (k) => k.year === y) }));
    c1 = App.card(c1el, {
      filename: "storyline01_total_per_year.csv",
      draw: (el, opt) => {
        const all = c1series();
        Charts.line(el, {
          ...opt,
          ariaLabel: `Line chart of road crash ${Story.word(s1)} per year`,
          series: [{ key: "all", label: "All ages", short: "All", colour: App.css("--c-younger"), emphasis: true, values: all.filter((d) => d.x <= s1.year) }],
          xDomain: [first, last],
          yMin: 0,
          yMax: d3.max(all, (d) => d.y) * 1.06,
          yLabel: Story.Word(s1),
          yFormat: d3.format("~s"),
          annotations: s1.year >= 2020 ? [{ x: 2020, text: "COVID-19" }] : [],
          tip: (s, d) => App.tipCard({ kicker: "All ages", chip: d.x, title: "Road crash " + Story.word(s1), colour: s.colour, value: App.fmt(d.y), unit: Story.word(s1) }),
        });
      },
      table: () => ({ columns: [{ key: "x", label: "Year" }, { key: "y", label: Story.Word(s1), num: true, format: App.fmt }], rows: c1series() }),
    });

    /* ---------- 01: older share ---------- */
    const share = (st) => years.map((y) => {
      const older = total(st, (k) => k.older && k.year === y);
      const all = total(st, (k) => k.year === y);
      return { x: String(y), year: y, older, all, y: (older / all) * 100 };
    });
    document.getElementById("s3Share").textContent = App.pct(share({ measure: "hosp" })[10].y);
    const c3el = document.getElementById("c3");
    let c3;
    const s3 = Story.controls(c3el, { measure: true, player: { min: first, max: last, label: "Year" } }, () => c3.redraw());
    c3 = App.card(c3el, {
      filename: "storyline01_older_share.csv",
      draw: (el, opt) => {
        const data = share(s3);
        Charts.bar(el, {
          ...opt,
          ariaLabel: `Bar chart of the share of ${Story.word(s3)} for people aged 65 and over`,
          data: data.map((d) => ({ ...d, colour: App.css("--c-older"), showLabel: d.year === first })),
          focusX: s3.year,
          yMin: 0,
          yMax: d3.max(data, (d) => d.y) * 1.15,
          yLabel: `Share of all ${Story.word(s3)} (%)`,
          yFormat: (v) => v + "%",
          valueFormat: (v) => d3.format(".1f")(v) + "%",
          tip: (d) => App.tipCard({ kicker: "Older share", chip: d.x, title: "Aged 65+", colour: App.css("--c-older"), value: App.pct(d.y),
            rows: [["Aged 65+", App.fmt(d.older)], ["All ages", App.fmt(d.all)]] }),
        });
      },
      table: () => ({
        columns: [{ key: "year", label: "Year" }, { key: "older", label: "Aged 65+", num: true, format: App.fmt }, { key: "all", label: "All ages", num: true, format: App.fmt },
          { key: "y", label: "Older share (%)", num: true, format: d3.format(".1f") }],
        rows: share(s3),
      }),
    });

    /* ---------- 02: age index ---------- */
    const ageSeries = (st) => App.AGE_ORDER.map((age) => {
      const counts = years.map((y) => total(st, (k) => k.age === age && k.year === y));
      return {
        key: age, label: age, emphasis: App.OLDER_AGES.includes(age), dash: App.OLDER_AGES.includes(age) ? null : "4 3",
        values: years.map((y, i) => ({ x: y, y: (counts[i] / counts[0]) * 100, count: counts[i] })),
      };
    });
    const a65 = ageSeries({ measure: "hosp" }).find((s) => s.key === "65-74");
    document.getElementById("s2Change").textContent = App.signedPct(a65.values[10].y - 100);
    const c2el = document.getElementById("c2");
    let c2;
    const s2 = Story.controls(c2el, { measure: true, player: { min: 2012, max: last } }, () => c2.redraw());
    c2 = App.card(c2el, {
      filename: "storyline02_age_index.csv",
      draw: (el, opt) => {
        const full = ageSeries(s2);
        const ys = full.flatMap((s) => s.values.map((v) => v.y));
        Charts.line(el, {
          ...opt,
          ariaLabel: `Line chart of ${Story.word(s2)} indexed to 2011 for seven age groups`,
          series: full.map((s) => ({ ...s, colour: App.ageColour(s.key), values: s.values.filter((v) => v.x <= s2.year) })),
          xDomain: [first, last],
          yMin: Math.min(80, d3.min(ys) * 0.95),
          yMax: d3.max(ys) * 1.04,
          refLine: 100,
          yLabel: "Index (2011 = 100)",
          yFormat: d3.format("d"),
          tip: (s, d) => App.tipCard({ kicker: "Growth since 2011", chip: d.x, title: `Age ${s.label}`, colour: s.colour,
            value: d3.format(".0f")(d.y), unit: "index", rows: [[Story.Word(s2), App.fmt(d.count)], ["Change since 2011", App.signedPct(d.y - 100)]] }),
        });
      },
      table: () => ({
        columns: [{ key: "age", label: "Age group" }, { key: "year", label: "Year" }, { key: "count", label: Story.Word(s2), num: true, format: App.fmt },
          { key: "index", label: "Index (2011 = 100)", num: true, format: d3.format(".1f") }],
        rows: ageSeries(s2).flatMap((s) => s.values.map((v) => ({ age: s.key, year: v.x, count: v.count, index: v.y }))),
      }),
    });

    /* ---------- 03: road users aged 65+ ---------- */
    const ruFor = (st) => App.RU_ORDER.map((g) => {
      const a = total(st, (k) => k.older && k.year === first && k.ru === g);
      const b = total(st, (k) => k.older && k.year === st.year && k.ru === g);
      return { label: g, a, b, value: ((b - a) / a) * 100 };
    });
    const cyc = ruFor({ measure: "hosp", year: last }).find((d) => d.label === "Pedal cyclist");
    document.getElementById("s4Cyc").textContent = `${d3.format(".1f")(cyc.b / cyc.a)}x`;
    const c4el = document.getElementById("c4");
    const oldPlayer = c4el.querySelector(".player");
    if (oldPlayer) oldPlayer.remove(); // replaced by the shared control bar
    let c4;
    const s4 = Story.controls(c4el, { measure: true, player: { min: 2012, max: last } }, () => {
      document.getElementById("c4sub").textContent = `% change in ${Story.word(s4)} from 2011 to ${s4.year}, by road user group`;
      c4.redraw();
    });
    const xMax4 = d3.max(d3.range(2012, last + 1).flatMap((y) => ["hosp", "bed"].flatMap((m) => ruFor({ measure: m, year: y }).map((d) => d.value))));
    c4 = App.card(c4el, {
      filename: "storyline03_older_road_users.csv",
      draw: (el, opt) =>
        Charts.hbar(el, {
          ...opt,
          ariaLabel: `Bar chart of percentage change in ${Story.word(s4)} for people aged 65 and over by road user group, 2011 to ${s4.year}`,
          data: ruFor(s4).map((d) => ({ ...d, colour: App.ruColour(d.label) })),
          sortable: true,
          sortDefault: "value",
          xMax: xMax4, // fixed scale, so bars visibly grow as the years play
          format: (v) => App.signedPct(v),
          axisFormat: (v) => v + "%",
          valueText: (d) => `${App.signedPct(d.value)} (${App.fmt(d.a)} to ${App.fmt(d.b)})`,
          labelSpace: 150,
          tip: (d) => App.tipCard({ kicker: "Aged 65+", chip: `2011 to ${s4.year}`, title: d.label, colour: d.colour, value: App.signedPct(d.value),
            rows: [[`${Story.Word(s4)} 2011`, App.fmt(d.a)], [`${Story.Word(s4)} ${s4.year}`, App.fmt(d.b)]] }),
        }),
      table: () => ({
        columns: [{ key: "label", label: "Road user group" }, { key: "a", label: `${Story.Word(s4)} 2011`, num: true, format: App.fmt },
          { key: "b", label: `${Story.Word(s4)} ${s4.year}`, num: true, format: App.fmt }, { key: "value", label: "Change (%)", num: true, format: d3.format(".1f") }],
        rows: ruFor(s4),
      }),
    });

    /* ---------- 03: older men vs women ---------- */
    const sexSeries = (st) => ["Male", "Female"].map((sex) => ({
      key: sex, label: sex === "Male" ? "Men 65+" : "Women 65+", short: sex === "Male" ? "Men" : "Women",
      dash: sex === "Female" ? "7 4" : null, emphasis: true,
      values: years.map((y) => ({ x: y, y: total(st, (k) => k.older && k.sex === sex && k.year === y) })),
    }));
    const sx = sexSeries({ measure: "hosp" });
    document.getElementById("s5Gap").textContent = App.fmt(sx[0].values[10].y - sx[1].values[10].y);
    const c5el = document.getElementById("c5");
    let c5;
    const s5 = Story.controls(c5el, { measure: true, player: { min: 2012, max: last } }, () => c5.redraw());
    c5 = App.card(c5el, {
      filename: "storyline03_older_by_sex.csv",
      draw: (el, opt) => {
        const full = sexSeries(s5);
        const ys = full.flatMap((s) => s.values.map((v) => v.y));
        Charts.line(el, {
          ...opt,
          ariaLabel: `Line chart of ${Story.word(s5)} for men and women aged 65 and over`,
          series: full.map((s) => ({ ...s, colour: App.css(s.key === "Male" ? "--c-male" : "--c-female"), values: s.values.filter((v) => v.x <= s5.year) })),
          xDomain: [first, last],
          yMin: d3.min(ys) * 0.8,
          yMax: d3.max(ys) * 1.06,
          yLabel: Story.Word(s5),
          yFormat: d3.format(","),
          annotations: s5.year >= 2020 ? [{ x: 2020, text: "COVID-19" }] : [],
          tip: (s, d) => App.tipCard({ kicker: "Aged 65+", chip: d.x, title: s.label, colour: s.colour, value: App.fmt(d.y), unit: Story.word(s5) }),
        });
      },
      table: () => {
        const s = sexSeries(s5);
        return {
          columns: [{ key: "year", label: "Year" }, { key: "m", label: "Men 65+", num: true, format: App.fmt }, { key: "f", label: "Women 65+", num: true, format: App.fmt }],
          rows: years.map((y, i) => ({ year: y, m: s[0].values[i].y, f: s[1].values[i].y })),
        };
      },
    });

    /* ---------- 04: length of stay ---------- */
    const stay = (age, y) => total({ measure: "bed" }, (k) => k.age === age && k.year === y) / total({ measure: "hosp" }, (k) => k.age === age && k.year === y);
    const bedShare = total({ measure: "bed" }, (k) => k.older && k.year === last) / total({ measure: "bed" }, (k) => k.year === last);
    document.getElementById("s6Bed").textContent = App.pct(bedShare * 100);
    document.getElementById("s6Hosp").textContent = App.pct(share({ measure: "hosp" })[10].y);
    const c6el = document.getElementById("c6");
    let c6;
    const s6 = Story.controls(c6el, { measure: false, player: { min: 2012, max: last, label: "Compare 2011 with" } }, () => {
      c6el.querySelector(".subtitle").textContent = `Bed days divided by hospitalisations, 2011 and ${s6.year}`;
      c6.redraw();
    });
    const stayRows = () => App.AGE_ORDER.map((age) => ({ label: age, emphasis: App.OLDER_AGES.includes(age), a: stay(age, first), b: stay(age, s6.year) }));
    const stayMax = d3.max(App.AGE_ORDER.flatMap((a) => years.map((y) => stay(a, y)))) * 1.08;
    c6 = App.card(c6el, {
      filename: "storyline04_average_stay.csv",
      draw: (el, opt) =>
        Charts.dumbbell(el, {
          ...opt,
          ariaLabel: `Dumbbell chart of average days in hospital per crash by age group, 2011 and ${s6.year}`,
          rows: stayRows(),
          xMax: stayMax,
          aLabel: String(first),
          bLabel: String(s6.year),
          format: (v) => d3.format(".1f")(v) + " days",
          tip: (d, which) => App.tipCard({ kicker: "Average stay", chip: which === "a" ? first : s6.year, title: `Age ${d.label}`,
            colour: which === "a" ? App.css("--c-neutral") : App.css("--c-older"), value: d3.format(".1f")(which === "a" ? d.a : d.b), unit: "days per patient" }),
        }),
      table: () => ({
        columns: [{ key: "label", label: "Age group" }, { key: "a", label: "Average days 2011", num: true, format: d3.format(".2f") },
          { key: "b", label: `Average days ${s6.year}`, num: true, format: d3.format(".2f") }],
        rows: stayRows(),
      }),
    });

    /* ---------- Reality check: per-person rates (ABS population) ---------- */
    Story.realityCheck(rows);
  })
  .catch((err) => document.querySelectorAll(".chart").forEach((el) => App.showLoadError(el, err)));

/* ---------- 05 and 06: state and First Nations files ---------- */
Promise.all([App.data.loadState(), App.data.loadFN()])
  .then(([stRows, fnRows]) => {
    const age = stRows.filter((r) => r.breakdown === "Age Group");
    const agg = (st, state, y) => {
      const v = (r) => (st.measure === "hosp" ? r.hosp : r.bed);
      const l = age.filter((r) => r.state === state && r.year === y);
      const all = d3.sum(l, (r) => v(r) || 0);
      const old = d3.sum(l.filter((r) => App.OLDER_AGES.includes(r.category)), (r) => v(r) || 0);
      return { share: all ? (old / all) * 100 : 0, np: l.filter((r) => App.OLDER_AGES.includes(r.category)).some((r) => v(r) === null), old, all };
    };
    const rowsFor = (st) => App.STATES.map((s) => {
      const a = agg(st, s, 2011);
      const b = agg(st, s, st.year);
      return { label: s, a: a.share, b: b.share, flag: a.np || b.np, ra: a, rb: b };
    }).sort((p, q) => (p.flag - q.flag) || q.b - p.b);
    const base = rowsFor({ measure: "hosp", year: 2021 });
    const reliable = base.filter((r) => !r.flag);
    document.getElementById("s7Rose").textContent = `${reliable.filter((r) => r.b > r.a).length} of ${reliable.length}`;
    const c7el = document.getElementById("c7");
    let c7;
    const s7 = Story.controls(c7el, { measure: true, player: { min: 2012, max: 2021, label: "Compare 2011 with" } }, () => {
      c7el.querySelector(".subtitle").textContent = `People aged 65+, % of each state's ${Story.word(s7)}, 2011 and ${s7.year}`;
      c7.redraw();
    });
    const max7 = d3.max(d3.range(2011, 2022).flatMap((y) => ["hosp", "bed"].flatMap((m) => App.STATES.map((s) => agg({ measure: m }, s, y).share)))) * 1.05;
    c7 = App.card(c7el, {
      filename: "storyline05_states_older_share.csv",
      draw: (el, opt) => Charts.dumbbell(el, {
        ...opt,
        ariaLabel: `Dumbbell chart of the older share in each state, 2011 and ${s7.year}`,
        rows: rowsFor(s7),
        xMax: max7,
        aLabel: "2011",
        bLabel: String(s7.year),
        format: (v) => d3.format(".1f")(v) + "%",
        tip: (d, which) => {
          const r = which === "a" ? d.ra : d.rb;
          return App.tipCard({ kicker: "Older share", chip: which === "a" ? 2011 : s7.year, title: App.STATE_NAMES[d.label],
            colour: which === "a" ? App.css("--c-neutral") : App.css("--c-older"), value: App.pct(r.share),
            rows: [["Aged 65+", App.fmt(r.old)], ["All ages", App.fmt(r.all)], ...(d.flag ? [["Note", "includes n.p. values"]] : [])] });
        },
      }),
      table: () => ({
        columns: [{ key: "label", label: "State" }, { key: "a", label: "Older share 2011 (%)", num: true, format: d3.format(".1f") },
          { key: "b", label: `Older share ${s7.year} (%)`, num: true, format: d3.format(".1f") }, { key: "f", label: "Includes n.p." }],
        rows: rowsFor(s7).map((r) => ({ ...r, f: r.flag ? "yes" : "no" })),
      }),
    });

    const fa = fnRows.filter((r) => r.breakdown === "Age");
    const fval = (st, k, c) => d3.sum(fa.filter((r) => r.year === st.year && r.status === k && (!c || r.category === c)), (r) => (st.measure === "hosp" ? r.hosp : r.bed) || 0);
    const fshare = (st, k, c) => { const t = fval(st, k); return t ? (fval(st, k, c) / t) * 100 : 0; };
    document.getElementById("s8Share").textContent = App.pct(fshare({ measure: "hosp", year: 2021 }, "First Nations people", "65+"));
    const c8el = document.getElementById("c8");
    let c8;
    const s8 = Story.controls(c8el, { measure: true, player: { min: 2011, max: 2021, label: "Year" } }, () => {
      c8el.querySelector("h3").textContent = `Age profile of ${Story.word(s8)}, ${s8.year}`;
      c8.redraw();
    });
    const max8 = d3.max(d3.range(2011, 2022).flatMap((y) => ["hosp", "bed"].flatMap((m) => ["First Nations people", "Non-Indigenous"].flatMap((k) => App.FN_AGES.map((c) => fshare({ measure: m, year: y }, k, c))))));
    c8 = App.card(c8el, {
      filename: "storyline06_first_nations_age_profile.csv",
      draw: (el, opt) =>
        Charts.butterfly(el, {
          ...opt,
          ariaLabel: `Back-to-back bar chart of the age profile, First Nations people on the left and non-Indigenous people on the right, ${s8.year}`,
          categories: [...App.FN_AGES].reverse(),
          xMax: max8,
          left: { key: "First Nations people", label: "First Nations people", colour: App.css("--c-older-2"), value: (c) => fshare(s8, "First Nations people", c) },
          right: { key: "Non-Indigenous", label: "Non-Indigenous people", colour: App.css("--c-younger"), value: (c) => fshare(s8, "Non-Indigenous", c) },
          tip: (d) => App.tipCard({ kicker: "Age profile", chip: s8.year, title: `Age ${d.category}, ${d.side.label}`, colour: d.side.colour,
            value: App.pct(d.value), unit: "of this group", rows: [[Story.Word(s8), App.fmt(fval(s8, d.side.key, d.category))]] }),
        }),
      table: () => ({
        columns: [{ key: "age", label: "Age group" }, { key: "fn", label: "First Nations (%)", num: true, format: d3.format(".1f") }, { key: "ni", label: "Non-Indigenous (%)", num: true, format: d3.format(".1f") }],
        rows: App.FN_AGES.map((c) => ({ age: c, fn: fshare(s8, "First Nations people", c), ni: fshare(s8, "Non-Indigenous", c) })),
      }),
    });
  })
  .catch((err) => ["#c7 .chart", "#c8 .chart"].forEach((sel) => App.showLoadError(sel, err)));

/* =========================================================
   Reality check: is it just because there are more older people?
   Population (ABS): 2011 estimated resident population (3235.0, June 2011):
   22.3 million people, 3.08 million aged 65+. 2021 Census count:
   25,422,788 people, 4,378,088 aged 65+. The two years use slightly
   different ABS measures, so rates are approximate.
   ========================================================= */
App.POP = {
  2011: { total: 22300000, older: 3080000 },
  2021: { total: 25422788, older: 4378088 },
};
Story.realityCheck = (rows) => {
  const el = document.getElementById("rc");
  if (!el) return;
  const h = (y, older) => d3.sum(rows.filter((d) => d.year === y && d.older === older), (d) => d.hosp);
  const rate = (y, older) => (h(y, older) / (older ? App.POP[y].older : App.POP[y].total - App.POP[y].older)) * 100000;
  const grow = (a, b) => ((b - a) / a) * 100;
  const R = {
    oPop: grow(App.POP[2011].older, App.POP[2021].older),
    uPop: grow(App.POP[2011].total - App.POP[2011].older, App.POP[2021].total - App.POP[2021].older),
    oH: grow(h(2011, true), h(2021, true)),
    uH: grow(h(2011, false), h(2021, false)),
    oR: [rate(2011, true), rate(2021, true)],
    uR: [rate(2011, false), rate(2021, false)],
  };
  document.getElementById("rcRate").textContent = `${d3.format(".0f")(R.oR[0])} and ${d3.format(".0f")(R.oR[1])}`;
  const data = [
    { group: "Aged 65+", key: "pop", label: "Population growth", value: R.oPop },
    { group: "Aged 65+", key: "hosp", label: "Hospitalisation growth", value: R.oH },
    { group: "Under 65", key: "pop", label: "Population growth", value: R.uPop },
    { group: "Under 65", key: "hosp", label: "Hospitalisation growth", value: R.uH },
  ];
  App.card(el, {
    filename: "reality_check_population_vs_hospitalisations.csv",
    draw: (chartEl, opt) => {
      const groups = [
        { key: "pop", label: "Population growth", colour: App.css("--c-neutral") },
        { key: "hosp", label: "Hospitalisation growth", colour: App.css("--c-older") },
      ];
      document.getElementById("rcLegend").innerHTML = groups.map((g) => `<li><span class="swatch" style="background:${g.colour}"></span>${g.label}, 2011 to 2021</li>`).join("");
      Charts.groupedHbar(chartEl, {
        ...opt,
        ariaLabel: "Grouped bars comparing population growth and hospitalisation growth for people aged 65 and over and under 65",
        categories: ["Aged 65+", "Under 65"],
        groups,
        value: (c, k) => data.find((d) => d.group === c && d.key === k).value,
        format: (v) => "+" + d3.format(".0f")(v) + "%",
        tip: (d) => {
          const r = d.category === "Aged 65+" ? R.oR : R.uR;
          return App.tipCard({ kicker: "2011 to 2021", chip: d.category, title: d.group.label, colour: d.group.colour, value: "+" + d3.format(".1f")(d.value) + "%",
            rows: [["Rate per 100,000 in 2011", d3.format(".0f")(r[0])], ["Rate per 100,000 in 2021", d3.format(".0f")(r[1])]] });
        },
      });
    },
    table: () => ({
      columns: [{ key: "group", label: "Group" }, { key: "label", label: "Measure" }, { key: "value", label: "Growth 2011 to 2021 (%)", num: true, format: d3.format(".1f") }],
      rows: data,
    }),
  });
};

/* ---------- Story keyboard shortcuts ----------
   1 to 6: jump to that storyline. Q / E: previous / next chapter.
   P: play or pause the first chart player in the chapter on screen. */
(() => {
  const order = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "check", "end"];
  let target = null; // the chapter we just jumped to (smooth scrolling takes a moment to arrive)
  let clear = null;
  const current = () => {
    if (target) return target;
    let best = order[0];
    order.forEach((id) => { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < innerHeight * 0.4) best = id; });
    return best;
  };
  const go = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    target = id;
    clearTimeout(clear);
    clear = setTimeout(() => { target = null; }, 1200);
    el.scrollIntoView();
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* ignore */ }
    App.announce(el.querySelector("h2") ? el.querySelector("h2").textContent : id);
  };
  App.keys.handlers.push((e, key) => {
    if (/^[1-6]$/.test(key)) { go("ch" + key); return true; }
    if (key === "q" || key === "e") {
      const i = order.indexOf(current());
      go(order[Math.max(0, Math.min(order.length - 1, i + (key === "e" ? 1 : -1)))]);
      return true;
    }
    if (key === "p") {
      const sec = document.getElementById(current());
      const btn = sec && sec.querySelector(".play-btn");
      if (btn) btn.click();
      return true;
    }
    return false;
  });
})();

/* ---------- Reading progress bar and active chapter highlight ---------- */
(() => {
  const bar = document.getElementById("progress");
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + "%";
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  const links = document.querySelectorAll(".chapter-nav a");
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
    }),
    { rootMargin: "-40% 0px -55% 0px" }
  );
  document.querySelectorAll("section.chapter").forEach((s) => io.observe(s));
})();
