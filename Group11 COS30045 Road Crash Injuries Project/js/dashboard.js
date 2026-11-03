/* =========================================================
   dashboard.js
   - year player (slider + Play/Pause autoplay)
   - filters: measure, sex, remoteness, road user
   - snapshot panel, story guide text and 8 charts, all linked
   - four storyline tabs
   ========================================================= */

const Dash = {
  state: { year: 2021, sex: "All", area: "All", road: "All", measure: "hosp", view: "count" },
  defaults: null,
  cube: [],   // the 86,000 rows summed into about 3,000 groups, so filtering is instant
  cards: {},
  timer: null,
  FIRST: 2011,
  LAST: 2021,
};

/* ---------- small helpers ---------- */
Dash.m = () => (Dash.state.measure === "hosp" ? "hospitalisations" : "bed days");
Dash.M = () => (Dash.state.measure === "hosp" ? "Hospitalisations" : "Bed days");
Dash.val = (r) => (Dash.state.measure === "hosp" ? r.hosp : r.bed);

Dash.match = (r, ignoreRoad = false) => {
  const s = Dash.state;
  return (s.sex === "All" || r.sex === s.sex) &&
    (s.area === "All" || r.area === s.area) &&
    (ignoreRoad || s.road === "All" || r.ru === s.road);
};
Dash.rows = (ignoreRoad = false) => Dash.cube.filter((r) => Dash.match(r, ignoreRoad));

Dash.filterText = () => {
  const s = Dash.state;
  const who = s.sex === "All" ? "all people" : s.sex === "Male" ? "males" : "females";
  const where = s.area === "All" ? "all areas" : s.area === "Missing" ? "area not recorded" : s.area;
  const how = s.road === "All" ? "all road users" : s.road.toLowerCase();
  return `${who}, ${where}, ${how}`;
};

/* Sums by year for a set of rows. */
Dash.byYear = (rows, value = Dash.val) => {
  const m = d3.rollup(rows, (v) => d3.sum(v, value), (r) => r.year);
  return App.YEARS.map((y) => m.get(y) || 0);
};
Dash.idx = (y) => y - Dash.FIRST;

/* Generic tooltip for a year point. */
Dash.tip = (kicker, title, colour, year, value, rows = []) =>
  App.tipCard({ kicker, chip: year, title, colour, value: App.fmt(Math.round(value)), unit: Dash.m(), rows });

/* =========================================================
   Year player and autoplay
   ========================================================= */
Dash.setYear = (y, fromPlayer = false) => {
  y = Math.max(Dash.FIRST, Math.min(Dash.LAST, y));
  if (!fromPlayer) Dash.stop();
  Dash.state.year = y;
  document.getElementById("yearRange").value = y;
  document.getElementById("yearOut").textContent = y;
  Dash.refresh();
};

Dash.play = () => {
  if (Dash.timer) return;
  if (Dash.state.year >= Dash.LAST) Dash.setYear(Dash.FIRST, true);
  Dash.timer = setInterval(() => {
    const next = Dash.state.year >= Dash.LAST ? Dash.FIRST : Dash.state.year + 1;
    Dash.setYear(next, true);
    App.announce(`Year ${next}`);
  }, 1400);
  Dash.syncPlay();
};

Dash.stop = () => {
  if (!Dash.timer) return;
  clearInterval(Dash.timer);
  Dash.timer = null;
  Dash.syncPlay();
};

Dash.toggle = () => (Dash.timer ? Dash.stop() : Dash.play());

Dash.syncPlay = () => {
  const on = !!Dash.timer;
  const b = document.getElementById("playBtn");
  b.setAttribute("aria-pressed", on);
  b.setAttribute("aria-label", on ? "Pause" : "Play years automatically");
  b.innerHTML = on ? "&#10074;&#10074;" : "&#9654;";
  document.getElementById("heroPlay").innerHTML = on ? "&#10074;&#10074; Pause" : "&#9654; Play the decade";
};

/* =========================================================
   Snapshot panel, status line and story guides
   ========================================================= */
Dash.updateText = () => {
  const s = Dash.state;
  const y = s.year;
  const i = Dash.idx(y);
  const rows = Dash.rows();
  const total = Dash.byYear(rows);
  const older = Dash.byYear(rows.filter((r) => r.older));
  const share = (k) => (total[k] ? (older[k] / total[k]) * 100 : 0);
  const stay = (list) => (d3.sum(list, (r) => r.hosp) ? d3.sum(list, (r) => r.bed) / d3.sum(list, (r) => r.hosp) : 0);
  const inY = rows.filter((r) => r.year === y);
  const stayOld = stay(inY.filter((r) => r.older));
  const stayYoung = stay(inY.filter((r) => !r.older));

  document.getElementById("snapYear").textContent = y;
  document.getElementById("snapFilters").textContent = Dash.filterText().replace(/^./, (c) => c.toUpperCase());
  document.getElementById("kTotal").textContent = App.fmt(total[i]);
  document.getElementById("kTotalLabel").textContent = `${Dash.M()} in ${y}`;
  document.getElementById("kOlder").textContent = App.fmt(older[i]);
  document.getElementById("kOlderLabel").textContent =
    y === Dash.FIRST ? "Aged 65+" : `Aged 65+ (${older[0] ? App.signedPct(((older[i] - older[0]) / older[0]) * 100) : "n/a"} since 2011)`;
  document.getElementById("kShare").textContent = App.pct(share(i));
  document.getElementById("kStay").textContent = `${d3.format(".1f")(stayOld)} vs ${d3.format(".1f")(stayYoung)}`;

  document.getElementById("status").textContent =
    `Showing ${y}, ${Dash.filterText()}. Measure: ${Dash.m()}. Tip: press P to play, Q and E to change year, 1 to 6 for tabs.`;

  // ---- story guides (one per tab) ----
  const chg = total[0] ? ((total[i] - total[0]) / total[0]) * 100 : 0;
  document.getElementById("g1").innerHTML =
    `In <strong>${y}</strong> there were <strong>${App.fmt(total[i])}</strong> road crash ${Dash.m()} (${Dash.filterText()})` +
    (y > Dash.FIRST ? `, <strong>${App.signedPct(chg)}</strong> compared with 2011. ` : ". ") +
    `People aged 65 and over made up <strong>${App.pct(share(i))}</strong> of them, up from ${App.pct(share(0))} in 2011.` +
    (y === 2020 ? " 2020 was the first year of COVID-19, when people travelled less, so most numbers dip." : "");

  const age = d3.rollup(rows, (v) => d3.sum(v, Dash.val), (r) => r.age, (r) => r.year);
  const getAge = (a, yy) => (age.get(a) && age.get(a).get(yy)) || 0;
  const growth = (a) => (getAge(a, Dash.FIRST) ? ((getAge(a, y) - getAge(a, Dash.FIRST)) / getAge(a, Dash.FIRST)) * 100 : 0);
  const biggest = d3.greatest(App.AGE_ORDER, (a) => getAge(a, y));
  const fastest = d3.greatest(App.AGE_ORDER, (a) => growth(a));
  document.getElementById("g2").innerHTML = y === Dash.FIRST
    ? `2011 is the starting year. Pick a later year, or press play, to see which age groups grow. The biggest group in 2011 was <strong>${biggest}</strong>.`
    : `From 2011 to <strong>${y}</strong>, ages <strong>65 to 74</strong> changed by <strong>${App.signedPct(growth("65-74"))}</strong> and <strong>75+</strong> by <strong>${App.signedPct(growth("75+"))}</strong>. ` +
      `The fastest growing group was <strong>${fastest}</strong>, while the biggest group was still <strong>${biggest}</strong>.`;

  const mix = Dash.mixData();
  const pick = (band, g) => (mix.find((d) => d.band === band && d.group === g) || { share: 0 }).share;
  const cyc = Dash.byYear(Dash.rows(true).filter((r) => r.older && r.ru === "Pedal cyclist"));
  document.getElementById("g3").innerHTML =
    `In <strong>${y}</strong>, <strong>${App.pct(pick("Older (65+)", "Pedal cyclist"))}</strong> of older ${Dash.m()} were cyclists and ` +
    `<strong>${App.pct(pick("Older (65+)", "Pedestrian"))}</strong> were pedestrians. Car occupants were the largest group at ${App.pct(pick("Older (65+)", "Car occupants"))}. ` +
    (y > Dash.FIRST && cyc[0] ? `Older cyclists alone went from ${App.fmt(cyc[0])} in 2011 to ${App.fmt(cyc[i])} in ${y}.` : "");

  const bedOld = Dash.byYear(rows.filter((r) => r.older), (r) => r.bed);
  const bedAll = Dash.byYear(rows, (r) => r.bed);
  const hospOld = Dash.byYear(rows.filter((r) => r.older), (r) => r.hosp);
  const hospAll = Dash.byYear(rows, (r) => r.hosp);
  document.getElementById("g4").innerHTML =
    `In <strong>${y}</strong>, a patient aged 65+ stayed <strong>${d3.format(".1f")(stayOld)} days</strong> on average, against <strong>${d3.format(".1f")(stayYoung)}</strong> for patients under 65. ` +
    `So people aged 65+ were ${App.pct(hospAll[i] ? (hospOld[i] / hospAll[i]) * 100 : 0)} of patients but used <strong>${App.pct(bedAll[i] ? (bedOld[i] / bedAll[i]) * 100 : 0)}</strong> of the bed days.`;
};

/* =========================================================
   Chart data
   ========================================================= */
Dash.mixData = () => {
  const rows = Dash.rows(true).filter((r) => r.year === Dash.state.year);
  const totals = d3.rollup(rows, (v) => d3.sum(v, Dash.val), (r) => (r.older ? "Older (65+)" : "Under 65"));
  const by = d3.rollup(rows, (v) => d3.sum(v, Dash.val), (r) => (r.older ? "Older (65+)" : "Under 65"), (r) => r.ru);
  return App.RU_ORDER.flatMap((g) =>
    ["Older (65+)", "Under 65"].map((band) => {
      const n = (by.get(band) && by.get(band).get(g)) || 0;
      const t = totals.get(band) || 0;
      return { group: g, band, count: n, share: t ? (n / t) * 100 : 0 };
    })
  );
};

Dash.ageSeries = () => {
  const roll = d3.rollup(Dash.rows(), (v) => d3.sum(v, Dash.val), (r) => r.age, (r) => r.year);
  const idx = Dash.state.view === "index";
  return App.AGE_ORDER.map((age) => {
    const counts = App.YEARS.map((y) => (roll.get(age) && roll.get(age).get(y)) || 0);
    return {
      key: age,
      label: age,
      emphasis: App.OLDER_AGES.includes(age),
      dash: App.OLDER_AGES.includes(age) ? null : "4 3",
      values: App.YEARS.map((y, i) => ({ x: y, count: counts[i], y: idx ? (counts[0] ? (counts[i] / counts[0]) * 100 : null) : counts[i] }))
        .filter((v) => v.y !== null),
    };
  }).filter((s) => s.values.length && d3.sum(s.values, (v) => v.count) > 0);
};

/* =========================================================
   Chart cards
   ========================================================= */
Dash.setupCards = () => {
  const select = (d) => Dash.setYear(d.x !== undefined ? +d.x : d.year);

  /* N1: total per year */
  Dash.cards.N1 = App.card(document.getElementById("N1"), {
    filename: "dashboard_total_per_year.csv",
    draw: (el, opt) => {
      const rows = Dash.rows();
      const tot = Dash.byYear(rows);
      const old = Dash.byYear(rows.filter((r) => r.older));
      document.getElementById("N1sub").textContent = `${Dash.M()}, ${Dash.filterText()}`;
      Charts.line(el, {
        ...opt,
        ariaLabel: `Line chart of ${Dash.m()} per year`,
        series: [{ key: "all", label: "All ages", short: "All", colour: App.css("--c-younger"), emphasis: true,
          values: App.YEARS.map((y, i) => ({ x: y, y: tot[i], older: old[i] })) }],
        yMin: 0,
        yLabel: Dash.M(),
        yFormat: d3.format("~s"),
        focusX: Dash.state.year,
        annotations: [{ x: 2020, text: "COVID-19" }],
        onSelect: select,
        tip: (s, d) => Dash.tip("National trend", "All ages", s.colour, d.x, d.y,
          [["Aged 65+", App.fmt(d.older)], ["Older share", App.pct(d.y ? (d.older / d.y) * 100 : 0)]]),
      });
    },
    table: () => {
      const rows = Dash.rows();
      const tot = Dash.byYear(rows);
      const old = Dash.byYear(rows.filter((r) => r.older));
      return {
        columns: [{ key: "year", label: "Year" }, { key: "t", label: `${Dash.M()} all ages`, num: true, format: App.fmt }, { key: "o", label: `${Dash.M()} aged 65+`, num: true, format: App.fmt }],
        rows: App.YEARS.map((y, i) => ({ year: y, t: tot[i], o: old[i] })),
      };
    },
  });

  /* N2: older share bars */
  const shareData = () => {
    const rows = Dash.rows();
    const tot = Dash.byYear(rows);
    const old = Dash.byYear(rows.filter((r) => r.older));
    return App.YEARS.map((y, i) => ({ x: String(y), year: y, older: old[i], all: tot[i], y: tot[i] ? (old[i] / tot[i]) * 100 : 0 }));
  };
  Dash.cards.N2 = App.card(document.getElementById("N2"), {
    filename: "dashboard_older_share.csv",
    draw: (el, opt) => {
      document.getElementById("N2sub").textContent = `People aged 65+, % of all ${Dash.m()}`;
      const data = shareData();
      Charts.bar(el, {
        ...opt,
        ariaLabel: "Bar chart of older share by year",
        data: data.map((d, i) => ({ ...d, colour: App.css("--c-older"), showLabel: i === 0 })),
        yLabel: "Share (%)",
        yFormat: (v) => v + "%",
        valueFormat: (v) => d3.format(".1f")(v) + "%",
        focusX: Dash.state.year,
        onSelect: select,
        tip: (d) => App.tipCard({ kicker: "Older share", chip: d.x, title: "Aged 65+", colour: App.css("--c-older"), value: App.pct(d.y),
          rows: [[`${Dash.M()} 65+`, App.fmt(d.older)], [`${Dash.M()} all ages`, App.fmt(d.all)]] }),
      });
    },
    table: () => ({
      columns: [{ key: "year", label: "Year" }, { key: "older", label: "Aged 65+", num: true, format: App.fmt }, { key: "all", label: "All ages", num: true, format: App.fmt }, { key: "y", label: "Older share (%)", num: true, format: d3.format(".1f") }],
      rows: shareData(),
    }),
  });

  /* A1: age group lines */
  Dash.cards.A1 = App.card(document.getElementById("A1"), {
    filename: "dashboard_age_groups.csv",
    draw: (el, opt) => {
      const series = Dash.ageSeries();
      if (!series.length) { el.innerHTML = '<p class="loading">No data for these filters.</p>'; return; }
      const idx = Dash.state.view === "index";
      Charts.line(el, {
        ...opt,
        ariaLabel: `Line chart of ${Dash.m()} by age group`,
        series: series.map((s) => ({ ...s, colour: App.ageColour(s.key) })),
        yMin: idx ? Math.min(80, d3.min(series.flatMap((s) => s.values), (v) => v.y) * 0.95) : 0,
        refLine: idx ? 100 : undefined,
        yLabel: idx ? "Growth (2011 = 100)" : Dash.M(),
        yFormat: idx ? d3.format("d") : d3.format("~s"),
        focusX: Dash.state.year,
        annotations: [{ x: 2020, text: "COVID-19" }],
        onSelect: select,
        tip: (s, d) => Dash.tip("Age group", `Age ${s.label}`, s.colour, d.x, d.count, idx ? [["Growth since 2011", App.signedPct(d.y - 100)]] : []),
      });
    },
    table: () => ({
      columns: [{ key: "age", label: "Age group" }, { key: "year", label: "Year" }, { key: "count", label: Dash.M(), num: true, format: App.fmt }],
      rows: Dash.ageSeries().flatMap((s) => s.values.map((v) => ({ age: s.key, year: v.x, count: v.count }))),
    }),
  });

  /* A2: heatmap */
  const heat = () => d3.rollup(Dash.rows(), (v) => d3.sum(v, Dash.val), (r) => r.age, (r) => r.year);
  Dash.cards.A2 = App.card(document.getElementById("A2"), {
    filename: "dashboard_heatmap_age_year.csv",
    draw: (el, opt) => {
      const h = heat();
      document.getElementById("A2sub").textContent = `${Dash.M()}. Stronger colour = more`;
      Charts.heatmap(el, {
        ...opt,
        ariaLabel: "Heatmap of age group by year",
        rows: App.AGE_ORDER,
        cols: App.YEARS,
        value: (r, c) => (h.get(r) && h.get(r).get(c)) || 0,
        focusCol: Dash.state.year,
        onSelect: (d) => Dash.setYear(d.col),
        tip: (d) => Dash.tip("Heatmap", `Age ${d.row}`, "", d.col, d.value),
      });
    },
    table: () => {
      const h = heat();
      return {
        columns: [{ key: "age", label: "Age group" }, ...App.YEARS.map((y) => ({ key: y, label: String(y), num: true, format: App.fmt }))],
        rows: App.AGE_ORDER.map((age) => { const r = { age }; App.YEARS.forEach((y) => { r[y] = (h.get(age) && h.get(age).get(y)) || 0; }); return r; }),
      };
    },
  });

  /* R1: road user mix in the selected year */
  Dash.cards.R1 = App.card(document.getElementById("R1"), {
    filename: "dashboard_road_user_mix.csv",
    draw: (el, opt) => {
      const data = Dash.mixData();
      const groups = [
        { key: "Older (65+)", label: "Aged 65+", colour: App.css("--c-older") },
        { key: "Under 65", label: "Under 65", colour: App.css("--c-younger") },
      ];
      document.getElementById("R1sub").textContent = `% of each age band's ${Dash.m()}, ${Dash.state.year}`;
      document.getElementById("R1legend").innerHTML = groups.map((g) => `<li><span class="swatch" style="background:${g.colour}"></span>${g.label}</li>`).join("");
      Charts.groupedHbar(el, {
        ...opt,
        ariaLabel: "Grouped bars of road user mix for people aged 65+ and under 65",
        categories: App.RU_ORDER,
        groups,
        sortable: true,
        value: (c, k) => (data.find((d) => d.group === c && d.band === k) || { share: 0 }).share,
        format: (v) => d3.format(".0f")(v) + "%",
        tip: (d) => {
          const row = data.find((r) => r.group === d.category && r.band === d.group.key);
          return App.tipCard({ kicker: "Road user mix", chip: Dash.state.year, title: `${d.category}, ${d.group.label}`, colour: d.group.colour,
            value: App.pct(d.value), unit: "of this age band", rows: [[Dash.M(), App.fmt(row.count)]] });
        },
      });
    },
    table: () => ({
      columns: [{ key: "group", label: "Road user group" }, { key: "band", label: "Age band" }, { key: "count", label: Dash.M(), num: true, format: App.fmt }, { key: "share", label: "Share of age band (%)", num: true, format: d3.format(".1f") }],
      rows: Dash.mixData(),
    }),
  });

  /* R2: older people by road user group over time */
  const ruSeries = () => {
    const rows = Dash.rows().filter((r) => r.older);
    return App.RU_ORDER.filter((g) => Dash.state.road === "All" || g === Dash.state.road).map((g) => {
      const v = Dash.byYear(rows.filter((r) => r.ru === g));
      return { key: g, label: g, short: g.split(" ")[0], emphasis: g === "Pedal cyclist" || g === "Motorcyclist",
        values: App.YEARS.map((y, i) => ({ x: y, y: v[i] })) };
    });
  };
  Dash.cards.R2 = App.card(document.getElementById("R2"), {
    filename: "dashboard_older_by_road_user.csv",
    draw: (el, opt) => {
      document.getElementById("R2sub").textContent = `${Dash.M()} per year, people aged 65+`;
      Charts.line(el, {
        ...opt,
        ariaLabel: "Line chart of people aged 65 and over by road user group",
        series: ruSeries().map((s) => ({ ...s, colour: App.ruColour(s.key) })),
        yMin: 0,
        yLabel: Dash.M(),
        yFormat: d3.format("~s"),
        focusX: Dash.state.year,
        annotations: [{ x: 2020, text: "COVID-19" }],
        onSelect: select,
        tip: (s, d) => {
          const first = s.values[0].y;
          return Dash.tip("Aged 65+", s.label, s.colour, d.x, d.y, d.x > Dash.FIRST && first ? [["Change since 2011", App.signedPct(((d.y - first) / first) * 100)]] : []);
        },
      });
    },
    table: () => ({
      columns: [{ key: "g", label: "Road user group" }, { key: "year", label: "Year" }, { key: "v", label: `${Dash.M()} aged 65+`, num: true, format: App.fmt }],
      rows: ruSeries().flatMap((s) => s.values.map((v) => ({ g: s.key, year: v.x, v: v.y }))),
    }),
  });

  /* H1: average stay by age, 2011 vs selected year */
  const stayRows = () => {
    const rows = Dash.rows();
    const st = (a, y) => {
      const l = rows.filter((r) => r.age === a && r.year === y);
      const h = d3.sum(l, (r) => r.hosp);
      return h ? d3.sum(l, (r) => r.bed) / h : 0;
    };
    return App.AGE_ORDER.map((a) => ({ label: a, emphasis: App.OLDER_AGES.includes(a), a: st(a, Dash.FIRST), b: st(a, Dash.state.year) }));
  };
  Dash.cards.H1 = App.card(document.getElementById("H1"), {
    filename: "dashboard_average_stay.csv",
    draw: (el, opt) => {
      document.getElementById("H1sub").textContent = `2011 vs ${Dash.state.year}`;
      Charts.dumbbell(el, {
        ...opt,
        ariaLabel: "Dumbbell chart of average days in hospital by age",
        rows: stayRows(),
        aLabel: "2011",
        bLabel: String(Dash.state.year),
        format: (v) => d3.format(".1f")(v) + " d",
        tip: (d, which) => App.tipCard({ kicker: "Average stay", chip: which === "a" ? 2011 : Dash.state.year, title: `Age ${d.label}`,
          colour: which === "a" ? App.css("--c-neutral") : App.css("--c-older"), value: d3.format(".1f")(which === "a" ? d.a : d.b), unit: "days per patient" }),
      });
    },
    table: () => ({
      columns: [{ key: "label", label: "Age group" }, { key: "a", label: "Average days 2011", num: true, format: d3.format(".2f") }, { key: "b", label: `Average days ${Dash.state.year}`, num: true, format: d3.format(".2f") }],
      rows: stayRows(),
    }),
  });

  /* H2: older share of patients vs older share of bed days */
  const shareLines = () => {
    const rows = Dash.rows();
    const ho = Dash.byYear(rows.filter((r) => r.older), (r) => r.hosp);
    const ha = Dash.byYear(rows, (r) => r.hosp);
    const bo = Dash.byYear(rows.filter((r) => r.older), (r) => r.bed);
    const ba = Dash.byYear(rows, (r) => r.bed);
    return [
      { key: "p", label: "Share of patients", short: "Patients", values: App.YEARS.map((y, i) => ({ x: y, y: ha[i] ? (ho[i] / ha[i]) * 100 : 0 })) },
      { key: "b", label: "Share of bed days", short: "Bed days", emphasis: true, values: App.YEARS.map((y, i) => ({ x: y, y: ba[i] ? (bo[i] / ba[i]) * 100 : 0 })) },
    ];
  };
  Dash.cards.H2 = App.card(document.getElementById("H2"), {
    filename: "dashboard_older_share_patients_vs_bed_days.csv",
    draw: (el, opt) => {
      Charts.line(el, {
        ...opt,
        ariaLabel: "Line chart comparing the older share of patients and of bed days",
        series: shareLines().map((s) => ({ ...s, colour: App.css(s.key === "b" ? "--c-older" : "--c-younger"), dash: s.key === "p" ? "7 4" : null })),
        yMin: 0,
        yLabel: "Aged 65+ (% of total)",
        yFormat: (v) => v + "%",
        focusX: Dash.state.year,
        onSelect: select,
        tip: (s, d) => App.tipCard({ kicker: "Aged 65+", chip: d.x, title: s.label, colour: s.colour, value: App.pct(d.y) }),
      });
    },
    table: () => {
      const [p, b] = shareLines();
      return {
        columns: [{ key: "year", label: "Year" }, { key: "p", label: "Older share of patients (%)", num: true, format: d3.format(".1f") }, { key: "b", label: "Older share of bed days (%)", num: true, format: d3.format(".1f") }],
        rows: App.YEARS.map((y, i) => ({ year: y, p: p.values[i].y, b: b.values[i].y })),
      };
    },
  });
};

/* ---------- share link: the address bar always describes the current view ---------- */
Dash.tab = 1;
Dash.syncURL = () => {
  const s = Dash.state;
  const p = new URLSearchParams();
  if (s.year !== 2021) p.set("year", s.year);
  if (s.measure !== "hosp") p.set("measure", s.measure);
  if (s.sex !== "All") p.set("sex", s.sex);
  if (s.area !== "All") p.set("area", s.area);
  if (s.road !== "All") p.set("road", s.road);
  if (s.view !== "count") p.set("view", s.view);
  if (Dash.st && Dash.st.pick !== "NSW") p.set("state", Dash.st.pick);
  const q = p.toString();
  try { history.replaceState(null, "", `${location.pathname}${q ? "?" + q : ""}#tab-${Dash.tab}`); } catch (e) { /* ignore */ }
};
Dash.readURL = () => {
  const p = new URLSearchParams(location.search);
  const s = Dash.state;
  const y = +p.get("year");
  if (y >= 2011 && y <= 2021) s.year = y;
  if (["hosp", "bedDays"].includes(p.get("measure"))) s.measure = p.get("measure");
  if (["Male", "Female"].includes(p.get("sex"))) s.sex = p.get("sex");
  if (["Major Cities", "Regional", "Remote", "Missing"].includes(p.get("area"))) s.area = p.get("area");
  if (App.RU_ORDER.includes(p.get("road"))) s.road = p.get("road");
  if (p.get("view") === "index") s.view = "index";
  Dash.urlState = App.STATES.includes(p.get("state")) ? p.get("state") : null;
};

Dash.refresh = () => {
  Dash.syncURL();
  Dash.updateText();
  if (Dash.st) Dash.st.text();
  if (Dash.fn) Dash.fn.text();
  Object.values(Dash.cards).forEach((c) => c.redraw()); // hidden tabs skip drawing until shown
};

/* =========================================================
   Controls, tabs and shortcuts
   ========================================================= */
Dash.setupControls = () => {
  const road = document.getElementById("fRoad");
  road.add(new Option("All road users", "All"));
  App.RU_ORDER.forEach((g) => road.add(new Option(g, g)));

  const sync = () => {
    const s = Dash.state;
    document.getElementById("fArea").value = s.area;
    road.value = s.road;
    document.querySelectorAll(".segmented[data-filter]").forEach((seg) =>
      seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === s[seg.dataset.filter])))
    );
    document.getElementById("yearRange").value = s.year;
    document.getElementById("yearOut").textContent = s.year;
  };

  document.getElementById("yearRange").addEventListener("input", (e) => Dash.setYear(+e.target.value));
  document.getElementById("playBtn").addEventListener("click", Dash.toggle);
  document.getElementById("heroPlay").addEventListener("click", Dash.toggle);
  document.getElementById("heroGuide").addEventListener("click", () => App.guide.open());
  document.getElementById("fArea").addEventListener("change", (e) => { Dash.state.area = e.target.value; Dash.refresh(); });
  road.addEventListener("change", (e) => { Dash.state.road = e.target.value; Dash.refresh(); });

  document.querySelectorAll(".segmented[data-filter]").forEach((seg) =>
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      Dash.state[seg.dataset.filter] = b.dataset.value;
      sync();
      Dash.refresh();
    })
  );

  document.getElementById("shareBtn").addEventListener("click", async () => {
    Dash.syncURL();
    const btn = document.getElementById("shareBtn");
    let ok = false;
    try { await navigator.clipboard.writeText(location.href); ok = true; } catch (e) {
      const t = document.createElement("textarea"); t.value = location.href; document.body.appendChild(t); t.select();
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } t.remove();
    }
    btn.innerHTML = ok ? "&#10003; Link copied" : "Copy the address bar";
    App.announce(ok ? "Link to this view copied" : "Copy the address from the address bar");
    setTimeout(() => { btn.innerHTML = "&#128279; Share view"; }, 2200);
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    Dash.stop();
    Dash.state = { ...Dash.defaults };
    sync();
    Dash.refresh();
  });

  document.getElementById("downloadBtn").addEventListener("click", () => {
    const out = Dash.rows().map((r) => ({ ...r, olderTxt: r.older ? "Older (65+)" : "Under 65" }))
      .sort((p, q) => p.year - q.year || App.AGE_ORDER.indexOf(p.age) - App.AGE_ORDER.indexOf(q.age));
    App.downloadCSV("dashboard_filtered_all_years.csv", out, [
      { key: "year", label: "Year" }, { key: "age", label: "Age group" }, { key: "olderTxt", label: "Older group" },
      { key: "sex", label: "Sex" }, { key: "area", label: "Remoteness area" }, { key: "ru", label: "Road user group" },
      { key: "hosp", label: "Hospitalisations" }, { key: "bed", label: "Bed days" },
    ]);
  });

  // storyline tabs
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  Dash.showTab = (n) => {
    Dash.tab = n;
    tabs.forEach((t, i) => {
      const on = i === n - 1;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    Dash.syncURL();
  };
  tabs.forEach((t, i) => t.addEventListener("click", () => {
    Dash.showTab(i + 1);
    try { history.replaceState(null, "", `#tab-${i + 1}`); } catch (e) { /* ignore */ }
  }));

  // the same six storylines as the story page: name, story anchor and illustration
  const LINES = [
    { name: "National trend", story: "ch1", art: "trend-calendar" },
    { name: "Age groups", story: "ch2", art: "older-pedestrian" },
    { name: "Road users", story: "ch3", art: "older-cyclist" },
    { name: "Hospital stays", story: "ch4", art: "hospital-bed" },
    { name: "States", story: "ch5", art: "states-map" },
    { name: "First Nations", story: "ch6", art: "outback-road" },
  ];
  const pad = (n) => String(n).padStart(2, "0");
  LINES.forEach((line, i) => {
    const n = i + 1;
    const panel = document.getElementById(`panel-${n}`);
    // illustration beside the story guide
    const box = panel.querySelector(".guide-box");
    const text = document.createElement("div");
    while (box.firstChild) text.appendChild(box.firstChild);
    box.classList.add("with-art");
    box.innerHTML = `<img src="images/illustrations/${line.art}.svg" alt="" width="150" height="112">`;
    box.appendChild(text);
    // previous / where am I / next
    const prev = n > 1 ? `<button class="btn" type="button" data-go="${n - 1}">&larr; ${pad(n - 1)} ${LINES[i - 1].name}</button>` : "<span></span>";
    const next = n < 6 ? `<button class="btn btn-primary" type="button" data-go="${n + 1}">Next: ${pad(n + 1)} ${LINES[i + 1].name} &rarr;</button>`
      : `<a class="btn btn-primary" href="data.html">Step 3: About the data &rarr;</a>`;
    panel.insertAdjacentHTML("beforeend", `<div class="tab-foot">${prev}
      <span class="where">Storyline ${pad(n)} of 06 &middot; <a href="story.html#${line.story}">read it in the story</a></span>${next}</div>`);
  });
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
    const n = +b.dataset.go;
    Dash.showTab(n);
    try { history.replaceState(null, "", `#tab-${n}`); } catch (e) { /* ignore */ }
    document.getElementById("tabsTop").scrollIntoView();
    document.getElementById(`tab-${n}`).focus({ preventScroll: true });
  }));

  // open the tab named in the link, e.g. dashboard.html#tab-3 from the story page
  const m = location.hash.match(/^#tab-([1-6])$/);
  Dash.showTab(m ? +m[1] : 1);
  if (m) setTimeout(() => document.getElementById("tabsTop").scrollIntoView(), 50);

  // page shortcuts: P play/pause, Q/E previous/next year, 1 to 4 tabs
  App.keys.handlers.push((e, key) => {
    if (key === "p") { Dash.toggle(); return true; }
    if (key === "q") { Dash.setYear(Dash.state.year - 1); App.announce(`Year ${Dash.state.year}`); return true; }
    if (key === "e") { Dash.setYear(Dash.state.year + 1); App.announce(`Year ${Dash.state.year}`); return true; }
    if (["1", "2", "3", "4", "5", "6"].includes(key)) { Dash.showTab(+key); return true; }
    return false;
  });

  sync();
};


/* =========================================================
   05 States and territories (state file)
   Uses the "Age Group" breakdown. n.p. cells are null: sums skip them and
   the result is flagged so the chart can stripe it.
   ========================================================= */
Dash.setupStates = (rows) => {
  const age = rows.filter((r) => r.breakdown === "Age Group");
  const overall = rows.filter((r) => r.breakdown === "Overall");
  const v = (r) => (Dash.state.measure === "hosp" ? r.hosp : r.bed);
  const st = { pick: "NSW" };
  Dash.st = st;

  // share aged 65+ for one state and year, plus whether any n.p. cells were involved
  st.agg = (state, year) => {
    const l = age.filter((r) => r.state === state && r.year === year);
    const old = l.filter((r) => App.OLDER_AGES.includes(r.category));
    const all = d3.sum(l, (r) => v(r) || 0);
    const older = d3.sum(old, (r) => v(r) || 0);
    const np = l.some((r) => v(r) === null);
    return { state, year, older, all, share: all ? (older / all) * 100 : 0, flag: np };
  };
  st.total = (state, year) => d3.sum(overall.filter((r) => r.state === state && r.year === year), (r) => v(r) || 0);
  const np = (d) => (d.flag ? [["Note", "includes n.p. values"]] : []);

  if (Dash.urlState) st.pick = Dash.urlState;
  const pick = document.getElementById("stPick");
  App.STATES.forEach((x) => pick.add(new Option(App.STATE_NAMES[x], x)));
  pick.value = st.pick;
  st.setPick = (x) => { st.pick = x; pick.value = x; Dash.refresh(); };
  pick.addEventListener("change", () => st.setPick(pick.value));

  st.text = () => {
    const y = Dash.state.year;
    const now = App.STATES.map((x) => st.agg(x, y));
    const base = App.STATES.map((x) => st.agg(x, Dash.FIRST));
    const clean = now.filter((d, i) => !d.flag && !base[i].flag);
    const top = d3.greatest(clean, (d) => d.share);
    const low = d3.least(clean, (d) => d.share);
    const rose = clean.filter((d) => d.share > base[App.STATES.indexOf(d.state)].share).length;
    document.getElementById("g5").innerHTML = (top ? `In <strong>${y}</strong>, the share of ${Dash.m()} aged 65+ was highest in <strong>${App.STATE_NAMES[top.state]}</strong> (${App.pct(top.share)}) and lowest in <strong>${App.STATE_NAMES[low.state]}</strong> (${App.pct(low.share)}), among states with no suppressed values. ` : "") +
      (y > Dash.FIRST ? `Compared with 2011, the older share was higher in <strong>${rose} of ${clean.length}</strong> of those states. ` : "Pick a later year, or press play, to compare with 2011. ") +
      "ACT and NT have many n.p. values for older ages, so read their numbers with care.";

    const a = st.agg(st.pick, y);
    const t = st.total(st.pick, y);
    const t0 = st.total(st.pick, Dash.FIRST);
    document.getElementById("stFacts").innerHTML = `
      <h3 style="margin:0 0 6px">${App.STATE_NAMES[st.pick]} <span class="chip">${y}</span></h3>
      <div class="snap-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="card kpi" style="padding:12px;box-shadow:none"><div class="kpi-value" style="font-size:1.4rem">${App.fmt(t)}</div><div class="kpi-label">${Dash.M()}</div></div>
        <div class="card kpi accent" style="padding:12px;box-shadow:none"><div class="kpi-value" style="font-size:1.4rem">${App.pct(a.share)}</div><div class="kpi-label">aged 65+${a.flag ? " (includes n.p.)" : ""}</div></div>
        <div class="card kpi" style="padding:12px;box-shadow:none;grid-column:1/-1"><div class="kpi-value" style="font-size:1.4rem">${y > Dash.FIRST && t0 ? App.signedPct(((t - t0) / t0) * 100) : "2011"}</div><div class="kpi-label">${y > Dash.FIRST ? "change in all " + Dash.m() + " since 2011" : "starting year"}</div></div>
      </div>`;
  };

  Dash.cards.S2 = App.card(document.getElementById("S2"), {
    filename: "dashboard_states_older_share_year.csv",
    draw: (el, opt) => {
      const y = Dash.state.year;
      document.getElementById("S2sub").textContent = `People aged 65+, % of each state's ${Dash.m()}, ${y}`;
      const data = App.STATES.map((x) => st.agg(x, y))
        .map((d) => ({ ...d, x: d.state, y: d.share, colour: d.state === st.pick ? App.css("--c-older") : App.css("--c-younger"), showLabel: true }));
      Charts.bar(el, {
        ...opt,
        ariaLabel: `Bar chart of older share by state in ${y}`,
        data,
        sortable: true,
        sortDefault: "value",
        defaultLabel: "State order",
        yLabel: "Aged 65+ (%)",
        yFormat: (v2) => v2 + "%",
        valueFormat: (v2) => d3.format(".0f")(v2) + "%",
        onSelect: (d) => st.setPick(d.state),
        tip: (d) => App.tipCard({ kicker: "Older share", chip: y, title: App.STATE_NAMES[d.state], colour: d.colour, value: App.pct(d.share),
          rows: [[`${Dash.M()} 65+`, App.fmt(d.older)], [`${Dash.M()} all ages`, App.fmt(d.all)], ...np(d)] }),
      });
    },
    table: () => ({
      columns: [{ key: "state", label: "State" }, { key: "older", label: "Aged 65+", num: true, format: App.fmt }, { key: "all", label: "All ages", num: true, format: App.fmt },
        { key: "share", label: "Older share (%)", num: true, format: d3.format(".1f") }, { key: "flagTxt", label: "Includes n.p." }],
      rows: App.STATES.map((x) => st.agg(x, Dash.state.year)).map((d) => ({ ...d, flagTxt: d.flag ? "yes" : "no" })),
    }),
  });

  const seriesAll = () => App.STATES.map((x) => ({
    key: x, label: x, emphasis: x === st.pick,
    values: App.YEARS.map((y) => { const a = st.agg(x, y); return { x: y, y: a.share, flag: a.flag, older: a.older, all: a.all }; }),
  }));
  Dash.cards.S3 = App.card(document.getElementById("S3"), {
    filename: "dashboard_states_older_share_trend.csv",
    draw: (el, opt) => {
      document.getElementById("S3sub").textContent = `${App.STATE_NAMES[st.pick]} highlighted; share of ${Dash.m()} aged 65+`;
      Charts.line(el, {
        ...opt,
        ariaLabel: "Line chart of older share over time for every state",
        series: seriesAll().map((x) => ({ ...x, colour: x.emphasis ? App.css("--c-older") : App.css("--c-neutral"), dash: x.emphasis ? null : "4 3" })),
        yMin: 0,
        yLabel: "Aged 65+ (%)",
        yFormat: (v2) => v2 + "%",
        focusX: Dash.state.year,
        onSelect: (d, sr) => { st.setPick(sr.key); },
        tip: (sr, d) => App.tipCard({ kicker: "Older share", chip: d.x, title: App.STATE_NAMES[sr.key], colour: sr.colour, value: App.pct(d.y),
          rows: [[`${Dash.M()} 65+`, App.fmt(d.older)], ...np(d)] }),
      });
    },
    table: () => ({
      columns: [{ key: "state", label: "State" }, { key: "year", label: "Year" }, { key: "y", label: "Older share (%)", num: true, format: d3.format(".1f") }, { key: "f", label: "Includes n.p." }],
      rows: seriesAll().flatMap((x) => x.values.map((d) => ({ state: x.key, year: d.x, y: d.y, f: d.flag ? "yes" : "no" }))),
    }),
  });

  Dash.cards.S1 = App.card(document.getElementById("S1"), {
    filename: "dashboard_states_heatmap.csv",
    draw: (el, opt) => {
      const cache = new Map();
      const get = (r, c) => { const k = r + c; if (!cache.has(k)) cache.set(k, st.agg(r, c)); return cache.get(k); };
      Charts.heatmap(el, {
        ...opt,
        ariaLabel: "Heatmap of older share by state and year",
        rows: App.STATES,
        cols: App.YEARS,
        value: (r, c) => get(r, c).share,
        flag: (r, c) => get(r, c).flag,
        cellFormat: (v2) => d3.format(".0f")(v2) + "%",
        focusCol: Dash.state.year,
        onSelect: (d) => { Dash.setYear(d.col); st.setPick(d.row); },
        tip: (d) => App.tipCard({ kicker: "Older share", chip: d.col, title: App.STATE_NAMES[d.row], value: App.pct(d.value), rows: np(get(d.row, d.col)) }),
      });
    },
    table: () => ({
      columns: [{ key: "state", label: "State" }, ...App.YEARS.map((y) => ({ key: y, label: String(y), num: true, format: d3.format(".1f") }))],
      rows: App.STATES.map((x) => { const r = { state: x }; App.YEARS.forEach((y) => { r[y] = st.agg(x, y).share; }); return r; }),
    }),
  });
  st.text();
  Dash.syncURL();
};

/* =========================================================
   06 First Nations (First Nations file)
   ========================================================= */
Dash.setupFN = (rows) => {
  const v = (r) => (Dash.state.measure === "hosp" ? r.hosp : r.bed);
  const age = rows.filter((r) => r.breakdown === "Age");
  const remote = rows.filter((r) => r.breakdown === "Remoteness");
  const GROUPS = [
    { key: "First Nations people", label: "First Nations people", colour: () => App.css("--c-older-2") },
    { key: "Non-Indigenous", label: "Non-Indigenous people", colour: () => App.css("--c-younger") },
  ];
  const fn = {};
  Dash.fn = fn;

  fn.total = (status, year) => {
    const l = age.filter((r) => r.status === status && r.year === year);
    return { value: d3.sum(l, (r) => v(r) || 0), flag: l.some((r) => v(r) === null) };
  };
  fn.cat = (list, status, year, cat) => {
    const l = list.filter((r) => r.status === status && r.year === year && r.category === cat);
    return { value: d3.sum(l, (r) => v(r) || 0), flag: l.some((r) => v(r) === null) };
  };
  fn.shares = (list, cats, year) => cats.flatMap((c) => GROUPS.map((g) => {
    const tot = d3.sum(cats, (cc) => fn.cat(list, g.key, year, cc).value);
    const x = fn.cat(list, g.key, year, c);
    return { category: c, status: g.key, count: x.value, flag: x.flag, share: tot ? (x.value / tot) * 100 : 0 };
  }));

  fn.text = () => {
    const y = Dash.state.year;
    const t = fn.total("First Nations people", y).value;
    const t0 = fn.total("First Nations people", Dash.FIRST).value;
    const n = fn.total("Non-Indigenous", y).value;
    const n0 = fn.total("Non-Indigenous", Dash.FIRST).value;
    const sh = fn.shares(age, App.FN_AGES, y);
    const s = (status, c) => (sh.find((d) => d.status === status && d.category === c) || { share: 0 });
    const rm = fn.shares(remote, ["Major Cities", "Regional", "Remote"], y);
    const r = (status) => (rm.find((d) => d.status === status && d.category === "Remote") || { share: 0 }).share;
    const o = s("First Nations people", "65+");
    document.getElementById("g6").innerHTML =
      `In <strong>${y}</strong> there were <strong>${App.fmt(t)}</strong> road crash ${Dash.m()} of First Nations people` +
      (y > Dash.FIRST ? ` (<strong>${App.signedPct(((t - t0) / t0) * 100)}</strong> since 2011, compared with ${App.signedPct(((n - n0) / n0) * 100)} for non-Indigenous people)` : "") + ". " +
      (o.flag ? "The 65+ count for part of this year was not published. " : `Only <strong>${App.pct(o.share)}</strong> were aged 65+, against <strong>${App.pct(s("Non-Indigenous", "65+").share)}</strong> for non-Indigenous people. `) +
      `The largest group was ages 17 to 25 (${App.pct(s("First Nations people", "17-25").share)}), and <strong>${App.pct(r("First Nations people"))}</strong> lived in remote areas (${App.pct(r("Non-Indigenous"))} of non-Indigenous people). So the "growing older" pattern is mostly a non-Indigenous trend.`;
  };

  const legend = (id) => { document.getElementById(id).innerHTML = GROUPS.map((g) => `<li><span class="swatch" style="background:${g.colour()}"></span>${g.label}</li>`).join(""); };
  const groupedCard = (id, list, cats, file, label) => App.card(document.getElementById(id), {
    filename: file,
    draw: (el, opt) => {
      legend(id + "legend");
      document.getElementById(id + "sub").textContent = `% of each group's ${Dash.m()}, ${Dash.state.year}`;
      const data = fn.shares(list, cats, Dash.state.year);
      const groups = GROUPS.map((g) => ({ ...g, colour: g.colour() }));
      Charts.groupedHbar(el, {
        ...opt,
        ariaLabel: `Grouped bars of ${label} for First Nations and non-Indigenous people`,
        categories: cats,
        groups,
        value: (c, k) => (data.find((d) => d.category === c && d.status === k) || { share: 0 }).share,
        format: (x) => d3.format(".0f")(x) + "%",
        tip: (d) => {
          const row = data.find((q) => q.category === d.category && q.status === d.group.key);
          return App.tipCard({ kicker: label, chip: Dash.state.year, title: `${d.category}, ${d.group.label}`, colour: d.group.colour,
            value: App.pct(d.value), unit: "of this group", rows: [[Dash.M(), App.fmt(row.count)], ...(row.flag ? [["Note", "includes n.p. values"]] : [])] });
        },
      });
    },
    table: () => ({
      columns: [{ key: "category", label: label }, { key: "status", label: "Group" }, { key: "count", label: Dash.M(), num: true, format: App.fmt },
        { key: "share", label: "Share (%)", num: true, format: d3.format(".1f") }],
      rows: fn.shares(list, cats, Dash.state.year),
    }),
  });
  Dash.cards.F1 = App.card(document.getElementById("F1"), {
    filename: "dashboard_first_nations_age_profile.csv",
    draw: (el, opt) => {
      document.getElementById("F1sub").textContent = `% of each group's ${Dash.m()}, ${Dash.state.year}`;
      const data = fn.shares(age, App.FN_AGES, Dash.state.year);
      const pick = (k, c) => data.find((d) => d.status === k && d.category === c) || { share: 0, count: 0, flag: false };
      const side = (g) => ({ key: g.key, label: g.label, colour: g.colour(), value: (c) => pick(g.key, c).share });
      Charts.butterfly(el, {
        ...opt,
        ariaLabel: "Back-to-back bar chart of the age profile for First Nations and non-Indigenous people",
        categories: [...App.FN_AGES].reverse(),
        left: side(GROUPS[0]),
        right: side(GROUPS[1]),
        tip: (d) => {
          const r = pick(d.side.key, d.category);
          return App.tipCard({ kicker: "Age profile", chip: Dash.state.year, title: `Age ${d.category}, ${d.side.label}`, colour: d.side.colour,
            value: App.pct(d.value), unit: "of this group", rows: [[Dash.M(), App.fmt(r.count)], ...(r.flag ? [["Note", "includes n.p. values"]] : [])] });
        },
      });
    },
    table: () => ({
      columns: [{ key: "category", label: "Age group" }, { key: "status", label: "Group" }, { key: "count", label: Dash.M(), num: true, format: App.fmt },
        { key: "share", label: "Share (%)", num: true, format: d3.format(".1f") }],
      rows: fn.shares(age, App.FN_AGES, Dash.state.year),
    }),
  });
  Dash.cards.F4 = groupedCard("F4", remote, ["Major Cities", "Regional", "Remote"], "dashboard_first_nations_remoteness.csv", "Remoteness");

  const growth = () => GROUPS.map((g) => {
    const vals = App.YEARS.map((y) => fn.total(g.key, y));
    return { key: g.key, label: g.label, short: g.key === "Non-Indigenous" ? "Non-Indig." : "First Nations", emphasis: g.key !== "Non-Indigenous",
      values: App.YEARS.map((y, i) => ({ x: y, y: (vals[i].value / vals[0].value) * 100, count: vals[i].value, flag: vals[i].flag })) };
  });
  Dash.cards.F2 = App.card(document.getElementById("F2"), {
    filename: "dashboard_first_nations_growth.csv",
    draw: (el, opt) => {
      document.getElementById("F2sub").textContent = `Total ${Dash.m()} per year, 2011 = 100`;
      Charts.line(el, {
        ...opt,
        ariaLabel: "Line chart of growth since 2011 for First Nations and non-Indigenous people",
        series: growth().map((x) => ({ ...x, colour: GROUPS.find((g) => g.key === x.key).colour() })),
        yMin: 80,
        refLine: 100,
        yLabel: "Growth (2011 = 100)",
        yFormat: d3.format("d"),
        focusX: Dash.state.year,
        annotations: [{ x: 2020, text: "COVID-19" }],
        onSelect: (d) => Dash.setYear(d.x),
        tip: (x, d) => App.tipCard({ kicker: "Growth since 2011", chip: d.x, title: x.label, colour: x.colour, value: d3.format(".0f")(d.y), unit: "index",
          rows: [[Dash.M(), App.fmt(d.count)], ...(d.flag ? [["Note", "includes n.p. values"]] : [])] }),
      });
    },
    table: () => ({
      columns: [{ key: "g", label: "Group" }, { key: "year", label: "Year" }, { key: "count", label: Dash.M(), num: true, format: App.fmt }, { key: "y", label: "Index (2011 = 100)", num: true, format: d3.format(".1f") }],
      rows: growth().flatMap((x) => x.values.map((d) => ({ g: x.label, year: d.x, count: d.count, y: d.y }))),
    }),
  });

  const older = () => GROUPS.map((g) => ({
    key: g.key, label: g.label, short: g.key === "Non-Indigenous" ? "Non-Indig." : "First Nations", emphasis: true,
    values: App.YEARS.map((y) => {
      const o = fn.cat(age, g.key, y, "65+");
      const t = fn.total(g.key, y).value;
      return { x: y, y: t ? (o.value / t) * 100 : 0, count: o.value, skip: o.flag };
    }).filter((d) => !d.skip),
  }));
  Dash.cards.F3 = App.card(document.getElementById("F3"), {
    filename: "dashboard_first_nations_older_share.csv",
    draw: (el, opt) => {
      document.getElementById("F3sub").textContent = `% of each group's ${Dash.m()} aged 65+`;
      Charts.line(el, {
        ...opt,
        ariaLabel: "Line chart of the share aged 65 and over for First Nations and non-Indigenous people",
        series: older().map((x) => ({ ...x, colour: GROUPS.find((g) => g.key === x.key).colour(), dash: x.key === "Non-Indigenous" ? "7 4" : null })),
        yMin: 0,
        yLabel: "Aged 65+ (%)",
        yFormat: (x) => x + "%",
        focusX: Dash.state.year,
        onSelect: (d) => Dash.setYear(d.x),
        tip: (x, d) => App.tipCard({ kicker: "Aged 65+", chip: d.x, title: x.label, colour: x.colour, value: App.pct(d.y), rows: [[Dash.M() + " 65+", App.fmt(d.count)]] }),
      });
    },
    table: () => ({
      columns: [{ key: "g", label: "Group" }, { key: "year", label: "Year" }, { key: "count", label: `${Dash.M()} 65+`, num: true, format: App.fmt }, { key: "y", label: "Share aged 65+ (%)", num: true, format: d3.format(".1f") }],
      rows: older().flatMap((x) => x.values.map((d) => ({ g: x.label, year: d.x, count: d.count, y: d.y }))),
    }),
  });
  fn.text();
};


App.data
  .load()
  .then((rows) => {
    // sum the 86,000 rows into small groups once; all filtering uses this
    const g = d3.rollups(
      rows,
      (v) => ({ hosp: d3.sum(v, (d) => d.hosp), bed: d3.sum(v, (d) => d.bedDays) }),
      (d) => d.year, (d) => d.age, (d) => d.sex, (d) => d.remoteness, (d) => d.ruGroup
    );
    g.forEach(([year, a]) => a.forEach(([age, b]) => b.forEach(([sex, c]) => c.forEach(([area, e]) => e.forEach(([ru, v]) =>
      Dash.cube.push({ year, age, sex, area, ru, older: App.OLDER_AGES.includes(age), hosp: v.hosp, bed: v.bed }))))));

    document.getElementById("heroTotal").textContent = App.fmt(d3.sum(rows, (d) => d.hosp));
    Dash.defaults = { ...Dash.state };
    Dash.readURL(); // a shared link opens the same year, filters and tab
    Dash.setupControls();
    Dash.setupCards();
    Dash.updateText();
    App.data.loadState().then(Dash.setupStates).catch((err) => App.showLoadError("#g5", err));
    App.data.loadFN().then(Dash.setupFN).catch((err) => App.showLoadError("#g6", err));
  })
  .catch((err) => App.showLoadError("#status", err));
