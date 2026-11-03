/* =========================================================
   home.js
   - the four headline numbers
   - "Three questions we answer": click a question to open its answer,
     with a key number, a mini chart and links into the storyline
   - "Find people like you": pick age, sex and road user for a personal card
   ========================================================= */

const Home = {};

/* Small, quiet chart for answers and the finder (no axes, just the shape + end labels). */
Home.spark = (el, series, opts = {}) => {
  el.innerHTML = "";
  const W = 420;
  const H = opts.height || 110;
  const m = { top: 12, right: 92, bottom: 18, left: 8 };
  const all = series.flatMap((s) => s.values);
  const x = d3.scaleLinear().domain(d3.extent(all, (d) => d.x)).range([m.left, W - m.right]);
  const y = d3.scaleLinear().domain([opts.yMin !== undefined ? opts.yMin : d3.min(all, (d) => d.y) * 0.9, d3.max(all, (d) => d.y) * 1.05]).range([H - m.bottom, m.top]);
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", opts.label || "Mini chart");
  [x.domain()[0], x.domain()[1]].forEach((yr) =>
    svg.append("text").attr("x", x(yr)).attr("y", H - 3).attr("text-anchor", yr === x.domain()[0] ? "start" : "end").attr("fill", "var(--muted)").style("font-size", "11px").text(yr));
  series.forEach((s) => {
    const path = svg.append("path").datum(s.values).attr("fill", "none").attr("stroke", s.colour).attr("stroke-width", s.bold ? 3 : 2)
      .attr("stroke-dasharray", s.dash || null).attr("stroke-linecap", "round").attr("d", d3.line().x((d) => x(d.x)).y((d) => y(d.y)));
    // draw the line in, left to right
    if (Charts.motion()) {
      const len = path.node().getTotalLength();
      path.attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len)
        .transition().duration(900).ease(d3.easeCubicOut).attr("stroke-dashoffset", 0)
        .on("end", () => path.attr("stroke-dasharray", s.dash || null));
    }
    const last = s.values[s.values.length - 1];
    svg.append("circle").attr("cx", x(last.x)).attr("cy", y(last.y)).attr("r", 4).attr("fill", s.colour);
    svg.append("text").attr("x", x(last.x) + 8).attr("y", y(last.y)).attr("dy", "0.35em").attr("fill", s.colour)
      .style("font-size", "12px").style("font-weight", s.bold ? 800 : 600).text(s.label);
  });
};

Home.miniBars = (el, data, opts = {}) => {
  el.innerHTML = "";
  const W = 420;
  const row = 22;
  const H = data.length * row + 8;
  const left = 104;
  const x = d3.scaleLinear().domain([Math.min(0, d3.min(data, (d) => d.value)), d3.max(data, (d) => d.value)]).range([left, W - 120]);
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", opts.label || "Mini bar chart");
  data.forEach((d, i) => {
    const yy = 4 + i * row;
    svg.append("text").attr("x", left - 8).attr("y", yy + 11).attr("text-anchor", "end").attr("fill", "var(--text)").style("font-size", "12px").text(d.label);
    const r = svg.append("rect").attr("x", x(Math.min(0, d.value))).attr("y", yy).attr("height", 15).attr("rx", 4).attr("fill", d.colour)
      .attr("width", Charts.motion() ? 0 : Math.abs(x(d.value) - x(0)));
    if (Charts.motion()) r.transition().duration(700).delay(i * 60).attr("width", Math.abs(x(d.value) - x(0)));
    svg.append("text").attr("x", (d.value >= 0 ? x(d.value) : x(0)) + 6).attr("y", yy + 11).attr("fill", "var(--text)")
      .style("font-size", "12px").style("font-weight", 700).text(opts.fmt ? opts.fmt(d) : d.value);
  });
};

App.data
  .load()
  .then((rows) => {
    const sumBy = (filter, value = (d) => d.hosp) => d3.sum(rows.filter(filter), value);
    const first = 2011;
    const last = 2021;
    const years = App.YEARS;
    const older = (y) => sumBy((d) => d.older && d.year === y);
    const total = (y) => sumBy((d) => d.year === y);

    /* ---------- headline numbers ---------- */
    const change = ((older(last) - older(first)) / older(first)) * 100;
    document.getElementById("kOlderChange").textContent = App.signedPct(change);
    document.getElementById("kOlderChangeLabel").textContent = `Hospitalisations aged 65+, ${App.fmt(older(first))} in ${first} to ${App.fmt(older(last))} in ${last}`;
    document.getElementById("kShare").textContent = `${App.pct((older(first) / total(first)) * 100)} to ${App.pct((older(last) / total(last)) * 100)}`;
    const bed = (filter) => sumBy(filter, (d) => d.bedDays);
    document.getElementById("kBedShare").textContent = App.pct((bed((d) => d.older && d.year === last) / bed((d) => d.year === last)) * 100);
    const cyc = (y) => sumBy((d) => d.older && d.year === y && d.ruGroup === "Pedal cyclist");
    document.getElementById("kCyclists").textContent = `${d3.format(".1f")(cyc(last) / cyc(first))}x`;
    document.getElementById("kCyclistsLabel").textContent = `Cyclists aged 65+ in hospital, ${App.fmt(cyc(first))} to ${App.fmt(cyc(last))}`;

    /* ---------- Three questions: open / close and draw the mini charts ---------- */
    const roll = d3.rollup(rows, (v) => d3.sum(v, (d) => d.hosp), (d) => d.age, (d) => d.year);
    const idx = (age) => years.map((y) => ({ x: y, y: (roll.get(age).get(y) / roll.get(age).get(first)) * 100 }));
    const q1 = idx("65-74");
    document.querySelector('[data-qa="q1big"]').textContent = App.signedPct(q1[10].y - 100);
    document.querySelector('[data-qa="q2big"]').textContent = App.pct((older(last) / total(last)) * 100);
    document.querySelector('[data-qa="q3big"]').textContent = `${d3.format(".1f")(cyc(last) / cyc(first))}x`;
    const sexChg = (sex) => { const a = sumBy((d) => d.older && d.sex === sex && d.year === first); const b = sumBy((d) => d.older && d.sex === sex && d.year === last); return ((b - a) / a) * 100; };
    const stay = (o) => bed((d) => d.year === last && d.older === o) / sumBy((d) => d.year === last && d.older === o);
    document.querySelector('[data-qa="q3text"]').textContent =
      `Cyclists and motorcyclists grew the most. Older men rose ${App.signedPct(sexChg("Male"))} against ${App.signedPct(sexChg("Female"))} for older women. ` +
      `In ${last}, patients aged 65+ stayed ${d3.format(".1f")(stay(true))} days on average, against ${d3.format(".1f")(stay(false))} for under 65.`;

    const draw = {
      q1chart: (el) => Home.spark(el, [
        { label: "65 to 74", colour: App.css("--c-older"), bold: true, values: q1 },
        { label: "75+", colour: App.css("--c-older-2"), bold: true, values: idx("75+") },
        { label: "17 to 25", colour: App.css("--c-neutral"), dash: "4 3", values: idx("17-25") },
      ], { label: "Growth since 2011 for ages 65 to 74, 75 and over, and 17 to 25" }),
      q2chart: (el) => Home.spark(el, [
        { label: "Aged 65+", colour: App.css("--c-older"), bold: true, values: years.map((y) => ({ x: y, y: (older(y) / total(y)) * 100 })) },
      ], { label: "Older share of hospitalisations from 2011 to 2021", yMin: 10 }),
      q3chart: (el) => Home.miniBars(el, App.RU_ORDER.map((g) => {
        const a = sumBy((d) => d.older && d.year === first && d.ruGroup === g);
        const b = sumBy((d) => d.older && d.year === last && d.ruGroup === g);
        return { label: g, value: ((b - a) / a) * 100, colour: App.ruColour(g) };
      }).sort((p, q) => q.value - p.value), { label: "Change since 2011 by road user, aged 65+", fmt: (d) => App.signedPct(d.value) }),
    };
    document.querySelectorAll(".qa-q").forEach((btn) => btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", open);
      const panel = document.getElementById(btn.getAttribute("aria-controls"));
      panel.hidden = !open;
      const chart = panel.querySelector(".qa-chart");
      if (open && chart && draw[chart.dataset.qa]) draw[chart.dataset.qa](chart);
    }));
    // redraw open mini charts when the theme changes so their colours match
    App.redrawers.add(() => document.querySelectorAll(".qa-a:not([hidden]) .qa-chart").forEach((c) => draw[c.dataset.qa] && draw[c.dataset.qa](c)));

    /* ---------- Find people like you ---------- */
    const ageSel = document.getElementById("fiAge");
    const sexSel = document.getElementById("fiSex");
    const ruSel = document.getElementById("fiRu");
    const AGE_TEXT = { "0-7": "0 to 7", "8-16": "8 to 16", "17-25": "17 to 25", "26-39": "26 to 39", "40-64": "40 to 64", "65-74": "65 to 74", "75+": "75 and over" };
    const RU_TEXT = { "Car occupants": "Car driver or passenger", Motorcyclist: "Motorcyclist", "Pedal cyclist": "Cyclist", Pedestrian: "Pedestrian", Other: "Other (bus, truck, van...)" };
    App.AGE_ORDER.forEach((a) => ageSel.add(new Option(AGE_TEXT[a], a)));
    App.RU_ORDER.forEach((g) => ruSel.add(new Option(RU_TEXT[g], g)));
    ageSel.value = "65-74";
    ruSel.value = "Pedal cyclist";

    const finder = () => {
      const a = ageSel.value;
      const s = sexSel.value;
      const g = ruSel.value;
      const mine = rows.filter((d) => d.age === a && d.sex === s && d.ruGroup === g);
      const per = years.map((y) => ({ x: y, y: d3.sum(mine.filter((d) => d.year === y), (d) => d.hosp) }));
      const now = per[10].y;
      const then = per[0].y;
      const inLast = mine.filter((d) => d.year === last);
      const hosp = d3.sum(inLast, (d) => d.hosp);
      const cp = d3.greatest(d3.rollups(inLast, (v) => d3.sum(v, (d) => d.hosp), (d) => d.counterparty), (d) => d[1]);
      document.getElementById("fiCount").textContent = App.fmt(now);
      document.getElementById("fiCountLabel").textContent =
        `${sexSel.value === "Male" ? "males" : "females"} aged ${AGE_TEXT[a]}, ${RU_TEXT[g].toLowerCase()}, hospitalised after a road crash in ${last}`;
      document.getElementById("fiChange").textContent = then ? App.signedPct(((now - then) / then) * 100) : "n/a";
      document.getElementById("fiStay").textContent = hosp ? d3.format(".1f")(d3.sum(inLast, (d) => d.bedDays) / hosp) : "n/a";
      document.getElementById("fiCp").textContent = cp ? cp[0] : "n/a";
      document.getElementById("fiNote").textContent = now < 30
        ? "Small numbers: a few crashes either way change these figures a lot, so read them with care."
        : `That is about ${d3.format(".1f")((now / total(last)) * 100)}% of all road crash hospitalisations in ${last}.`;
      Home.spark(document.getElementById("fiChart"), [{ label: "People like you", colour: App.css("--c-older"), bold: true, values: per }],
        { label: "Hospitalisations per year for this group", yMin: 0, height: 100 });
    };
    [ageSel, sexSel, ruSel].forEach((el) => el.addEventListener("change", finder));
    App.redrawers.add(finder);
    finder();
  })
  .catch((err) => App.showLoadError("#heroKpis", err));
