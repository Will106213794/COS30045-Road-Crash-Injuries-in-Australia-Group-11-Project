/* =========================================================
   charts.js  -  reusable D3 chart functions
   ---------------------------------------------------------
   Every function has the same shape:  Charts.xxx(el, options)
   - el is the <div class="chart"> to draw into
   - it redraws a fresh SVG at the current width
   - options.fill = true makes it use the full height (expanded view)

   Built-in interaction on every chart:
   - Smooth transitions: marks glide from where they were to their new place
     (Charts.tween remembers each mark's last position by a key).
   - Hover or keyboard focus highlights one series or bar and dims the rest.
   - Line charts get a clickable legend to show or hide each line.
   - Bar charts can get a "Largest first / Default order" sort switch.
   Colour is never the only cue: lines have direct labels, bars have value
   labels, and every mark has a tooltip and an aria-label.
   ========================================================= */

const Charts = {};
Charts.DUR = 550;
Charts.motion = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Creates the SVG and inner drawing group with margins.
   Also rotates the "last positions" memory used by Charts.tween. */
Charts.frame = (el, o, m) => {
  el.__prev = el.__next || new Map();
  el.__next = new Map();
  el.innerHTML = "";
  const width = el.clientWidth || 640;
  const height = o.fill
    ? Math.max(340, (el.clientHeight || Math.round(window.innerHeight * 0.6)) - (o.reserve || 0))
    : o.height || Math.round(Math.max(260, Math.min(430, width * 0.58)));
  const svg = d3
    .select(el)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "group")
    .attr("aria-label", o.ariaLabel || "Chart");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
  return { svg, g, width, height, w: width - m.left - m.right, h: height - m.top - m.bottom };
};

/* Smooth transitions between redraws.
   For each mark, look up where it was last time (by key). If it existed, put it
   back there and glide to its new attributes. If it is new, start it from
   "enter" attributes (e.g. a bar with zero height) and grow. */
Charts.tween = (el, sel, key, attrs, enter) => {
  const motion = Charts.motion();
  sel.each(function (d, i) {
    const k = key(d, i);
    const fin = {};
    attrs.forEach((a) => { fin[a] = this.getAttribute(a); });
    el.__next.set(k, fin);
    if (!motion) return;
    const old = el.__prev.get(k);
    const start = old || (enter ? enter.call(this, d, i) : null);
    if (!start) return;
    const s = d3.select(this);
    attrs.forEach((a) => { if (start[a] != null) s.attr(a, start[a]); });
    const t = s.transition().duration(Charts.DUR).ease(d3.easeCubicOut);
    attrs.forEach((a) => t.attr(a, fin[a]));
  });
};

/* Hover / focus highlight: the hovered series or mark stays bright, the rest dim. */
Charts.highlight = (node, on) => {
  const svg = node.closest("svg");
  if (!svg) return;
  const target = node.closest(".series") || node;
  svg.classList.toggle("hovering", on);
  svg.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl"));
  if (on) target.classList.add("hl");
};

/* Diagonal stripe pattern used to mark values that include suppressed (n.p.) cells. */
Charts.hatch = (() => {
  let n = 0;
  return (svg) => {
    const id = "hatch" + n++;
    const p = svg.append("defs").append("pattern").attr("id", id).attr("patternUnits", "userSpaceOnUse")
      .attr("width", 7).attr("height", 7).attr("patternTransform", "rotate(45)");
    p.append("rect").attr("width", 7).attr("height", 7).attr("fill", "var(--surface)").attr("opacity", 0.35);
    p.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 7).attr("stroke", "var(--text)").attr("stroke-width", 2.4).attr("opacity", 0.7);
    return `url(#${id})`;
  };
})();

/* Picks dark or white text, whichever has more contrast on a given fill (WCAG luminance). */
Charts.textOn = (fill) => {
  const c = d3.rgb(fill);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  return (L + 0.05) / 0.0562 >= 1.05 / (L + 0.05) ? "#0b1220" : "#ffffff";
};

/* Pushes labels apart so they never overlap (used for direct line labels). */
Charts.spread = (items, minGap, top, bottom) => {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) {
    if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
  }
  const overflow = items.length ? items[items.length - 1].y - bottom : 0;
  if (overflow > 0) items.forEach((it) => (it.y -= overflow));
  items.forEach((it) => (it.y = Math.max(top, it.y)));
  return items;
};

Charts.yTitle = (g, f, text) => {
  if (!text) return;
  g.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)")
    .attr("x", -f.h / 2).attr("y", -f.marginLeft + 14).attr("text-anchor", "middle").text(text);
};

/* A small toolbar row placed above the SVG (legend buttons, sort switch). */
Charts.toolbar = (el, f) => {
  const bar = document.createElement("div");
  bar.className = "chart-toolbar";
  el.insertBefore(bar, f.svg.node());
  return bar;
};

/* After a legend or sort click, redraw just this chart and keep keyboard order sane. */
Charts.redrawSelf = (el, fn) => {
  fn();
  if (window.App && App.nav) App.nav.prepare(el);
};

/* Sort switch: "Largest first" or the order the data came in. */
Charts.sortSwitch = (el, f, o, redraw) => {
  if (!o.sortable) return el.__sort || o.sortDefault || "default";
  const mode = el.__sort || o.sortDefault || "default";
  const bar = Charts.toolbar(el, f);
  bar.insertAdjacentHTML("beforeend", `<div class="mini-seg" role="group" aria-label="Sort bars">
    <button type="button" data-sort="value" aria-pressed="${mode === "value"}">Largest first</button>
    <button type="button" data-sort="default" aria-pressed="${mode === "default"}">${o.defaultLabel || "Default order"}</button></div>`);
  bar.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
    el.__sort = b.dataset.sort;
    Charts.redrawSelf(el, redraw);
    const again = el.querySelector(`[data-sort="${b.dataset.sort}"]`);
    if (again) again.focus();
  }));
  return mode;
};

/* ---------------------------------------------------------
   Line chart
   o.series: [{key, label, short, colour, dash, emphasis, values:[{x, y}]}]
   o.yFormat, o.yLabel, o.yMin, o.yMax, o.xDomain, o.refLine,
   o.annotations:[{x, text}], o.focusX, o.legend (default on for 2+ lines)
   o.tip(series, point) returns tooltip HTML
   --------------------------------------------------------- */
Charts.line = (el, o) => {
  const redraw = () => Charts.line(el, o);
  const small = el.clientWidth < 520;
  const m = { top: 28, right: small ? 70 : 118, bottom: 40, left: small ? 50 : 66 };
  const withLegend = o.legend !== false && o.series.length > 1;
  const f = Charts.frame(el, { ...o, reserve: withLegend ? 44 : 0 }, m);
  f.marginLeft = m.left;

  // legend buttons: click to show or hide a line
  el.__hidden = el.__hidden || new Set();
  if (withLegend) {
    const bar = Charts.toolbar(el, f);
    const cvd = App.isCvd();
    bar.insertAdjacentHTML("beforeend", `<div class="chart-legend" role="group" aria-label="Show or hide lines">${o.series
      .map((s, i) => {
        const on = !el.__hidden.has(s.key);
        const dash = cvd ? s.dash || App.DASHES[i % App.DASHES.length] : s.dash;
        return `<button type="button" data-key="${s.key}" aria-pressed="${on}" title="${on ? "Hide" : "Show"} ${s.label}">
          <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="${s.colour}" stroke-width="3" ${dash ? `stroke-dasharray="${dash}"` : ""}/></svg>${s.label}</button>`;
      })
      .join("")}</div>`);
    bar.querySelectorAll("[data-key]").forEach((b) => {
      b.addEventListener("click", () => {
        const k = b.dataset.key;
        if (el.__hidden.has(k)) el.__hidden.delete(k);
        else if (o.series.length - el.__hidden.size > 1) el.__hidden.add(k); // always keep one line
        Charts.redrawSelf(el, redraw);
        const again = el.querySelector(`.chart-legend [data-key="${CSS.escape(k)}"]`);
        if (again) again.focus();
      });
      // hovering a legend item highlights its line
      const lit = (on) => { const g = el.querySelector(`.series[data-key="${CSS.escape(b.dataset.key)}"]`); if (g) Charts.highlight(g, on); };
      b.addEventListener("pointerenter", () => lit(true));
      b.addEventListener("pointerleave", () => lit(false));
    });
  }

  const shown = o.series.filter((s) => !el.__hidden.has(s.key));
  const all = shown.flatMap((s) => s.values);
  const allX = o.series.flatMap((s) => s.values).map((d) => d.x);
  const x = d3.scaleLinear().domain(o.xDomain || d3.extent(allX)).range([0, f.w]);
  const yMin = o.yMin !== undefined ? o.yMin : 0;
  const yTop = o.yMax !== undefined ? o.yMax : (d3.max(all, (d) => d.y) || 1) * 1.06;
  const y = d3.scaleLinear().domain([yMin, yTop]).nice().range([f.h, 0]);
  const yFormat = o.yFormat || d3.format("~s");

  f.g.append("g").attr("class", "grid-lines").call(d3.axisLeft(y).ticks(5).tickSize(-f.w).tickFormat(""));
  const years = d3.range(x.domain()[0], x.domain()[1] + 1);
  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.h})`)
    .call(d3.axisBottom(x).tickValues(small ? years.filter((d, i) => i % 2 === 0) : years).tickFormat(d3.format("d")));
  f.g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(yFormat));
  Charts.yTitle(f.g, f, o.yLabel);

  if (o.refLine !== undefined) {
    f.g.append("line").attr("x1", 0).attr("x2", f.w).attr("y1", y(o.refLine)).attr("y2", y(o.refLine))
      .attr("stroke", "var(--c-axis)").attr("stroke-dasharray", "6 4");
  }
  (o.annotations || []).forEach((a) => {
    if (a.x < x.domain()[0] || a.x > x.domain()[1]) return;
    const ann = f.g.append("g").attr("class", "annotation");
    ann.append("line").attr("x1", x(a.x)).attr("x2", x(a.x)).attr("y1", -6).attr("y2", f.h);
    ann.append("text").attr("x", x(a.x)).attr("y", -12).attr("text-anchor", "middle").text(a.text);
  });
  if (o.focusX !== undefined && o.focusX >= x.domain()[0] && o.focusX <= x.domain()[1]) {
    const fl = f.g.append("line").attr("class", "focus-line").attr("x1", x(o.focusX)).attr("x2", x(o.focusX)).attr("y1", 0).attr("y2", f.h);
    Charts.tween(el, fl, () => "__focus", ["x1", "x2"]);
  }

  const line = d3.line().x((d) => x(d.x)).y((d) => y(d.y));
  const cvd = App.isCvd();
  o.series.forEach((s, idx) => { s._idx = idx; s._dash = cvd ? s.dash || App.DASHES[idx % App.DASHES.length] : s.dash; });
  // background series first, so the highlighted ones sit on top
  const ordered = [...shown].sort((a, b) => (a.emphasis ? 1 : 0) - (b.emphasis ? 1 : 0));

  ordered.forEach((s) => {
    const g = f.g.append("g").attr("class", "series").attr("data-key", s.key);
    const path = g.append("path").datum(s.values)
      .attr("fill", "none").attr("stroke", s.colour)
      .attr("stroke-width", s.emphasis ? 3.5 : 2)
      .attr("stroke-dasharray", s._dash || null)
      .attr("stroke-linejoin", "round")
      .attr("d", line);
    Charts.tween(el, path, () => "path:" + s.key + ":" + s.values.length, ["d"]);
    // wide invisible line on top so the whole line can be hovered
    g.append("path").datum(s.values).attr("class", "hit").attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 14).attr("d", line)
      .on("pointerenter", function () { Charts.highlight(this, true); })
      .on("pointerleave", function () { Charts.highlight(this, false); });

    const pts = g.append("g").selectAll("circle").data(s.values).join("circle")
      .attr("cx", (d) => x(d.x))
      .attr("cy", (d) => y(d.y))
      .attr("r", (d) => (o.focusX === d.x ? 6.5 : s.emphasis ? 5 : 3.5))
      .attr("fill", (d) => (d.flag ? "var(--surface)" : s.colour))
      .attr("data-flag", (d) => (d.flag ? 1 : null))
      .attr("data-s", s._idx)
      .attr("data-i", (d, i) => i)
      .attr("stroke", "rgba(0,0,0,0)")
      .attr("stroke-width", 14);
    Charts.tween(el, pts, (d) => "pt:" + s.key + ":" + d.x, ["cx", "cy", "r"],
      function () { return { cy: y(yMin), r: 0 }; });
    App.tip.bind(pts, (d) => o.tip(s, d), { onSelect: o.onSelect ? (d) => o.onSelect(d, s) : null });
    pts.filter((d) => d.flag).style("stroke", s.colour).style("stroke-width", "2.5px");
  });

  // direct labels at the end of each line
  const labels = Charts.spread(
    shown.filter((s) => s.values.length).map((s) => {
      const last = s.values[s.values.length - 1];
      return { s, y: y(last.y), x: x(last.x) };
    }),
    15, 0, f.h
  );
  const lab = f.g.append("g").selectAll("text").data(labels).join("text")
    .attr("class", "direct-label")
    .attr("x", (d) => d.x + 10).attr("y", (d) => d.y).attr("dy", "0.35em")
    .attr("fill", (d) => d.s.colour)
    .style("font-weight", (d) => (d.s.emphasis ? 800 : 600))
    .text((d) => (small ? d.s.short || d.s.label : d.s.label));
  Charts.tween(el, lab, (d) => "lab:" + d.s.key, ["x", "y"]);
};

/* ---------------------------------------------------------
   Vertical bar chart
   o.data: [{x, y, colour, showLabel, flag}], o.yMax, o.focusX, o.sortable
   --------------------------------------------------------- */
Charts.bar = (el, o) => {
  const redraw = () => Charts.bar(el, o);
  const small = el.clientWidth < 520;
  const m = { top: 28, right: 16, bottom: 40, left: small ? 50 : 66 };
  const f = Charts.frame(el, { ...o, reserve: o.sortable ? 44 : 0 }, m);
  f.marginLeft = m.left;
  const mode = Charts.sortSwitch(el, f, o, redraw);
  const data = mode === "value" ? [...o.data].sort((a, b) => b.y - a.y) : o.data;
  const x = d3.scaleBand().domain(data.map((d) => d.x)).range([0, f.w]).padding(0.22);
  const top = o.yMax !== undefined ? o.yMax : (d3.max(data, (d) => d.y) || 1) * 1.12;
  const y = d3.scaleLinear().domain([o.yMin || 0, top]).nice().range([f.h, 0]);
  const yFormat = o.yFormat || d3.format("~s");

  f.g.append("g").attr("class", "grid-lines").call(d3.axisLeft(y).ticks(5).tickSize(-f.w).tickFormat(""));
  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.h})`)
    .call(d3.axisBottom(x).tickValues(small && data.length > 8 ? x.domain().filter((d, i) => i % 2 === 0) : x.domain()));
  f.g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(yFormat));
  Charts.yTitle(f.g, f, o.yLabel);

  const bars = f.g.append("g").selectAll("rect").data(data).join("rect")
    .attr("x", (d) => x(d.x))
    .attr("width", x.bandwidth())
    .attr("y", (d) => y(d.y))
    .attr("height", (d) => f.h - y(d.y))
    .attr("rx", 4)
    .attr("fill", (d) => d.colour)
    .attr("opacity", (d) => (o.focusX === undefined || String(d.x) === String(o.focusX) ? 1 : 0.42));
  Charts.tween(el, bars, (d) => "bar:" + d.x, ["x", "y", "height", "width"], () => ({ y: f.h, height: 0 }));
  App.tip.bind(bars, o.tip, { onSelect: o.onSelect });
  if (data.some((d) => d.flag)) {
    const hatch = Charts.hatch(f.svg);
    const hb = f.g.append("g").selectAll("rect").data(data.filter((d) => d.flag)).join("rect")
      .attr("x", (d) => x(d.x)).attr("width", x.bandwidth()).attr("y", (d) => y(d.y)).attr("height", (d) => f.h - y(d.y))
      .attr("rx", 4).attr("fill", hatch).style("pointer-events", "none");
    Charts.tween(el, hb, (d) => "hatch:" + d.x, ["x", "y", "height"], () => ({ y: f.h, height: 0 }));
  }

  const fmt = o.valueFormat || yFormat;
  const vl = f.g.append("g").selectAll("text")
    .data(data.filter((d) => d.showLabel || String(d.x) === String(o.focusX) || (!small && o.labelAll)))
    .join("text").attr("class", "value-label")
    .attr("x", (d) => x(d.x) + x.bandwidth() / 2).attr("y", (d) => y(d.y) - 6).attr("text-anchor", "middle")
    .text((d) => fmt(d.y));
  Charts.tween(el, vl, (d) => "vl:" + d.x, ["x", "y"], () => ({ y: f.h - 6 }));
};

/* ---------------------------------------------------------
   Horizontal bar chart (works with negative values too)
   o.data: [{label, value, colour}], o.sortable, o.valueText, o.labelSpace
   --------------------------------------------------------- */
Charts.hbar = (el, o) => {
  const redraw = () => Charts.hbar(el, o);
  const small = el.clientWidth < 520;
  const m = { top: 12, right: o.labelSpace ? (small ? o.labelSpace * 0.8 : o.labelSpace) : small ? 56 : 72, bottom: 36, left: small ? 104 : 140 };
  const height = o.fill ? undefined : Math.max(220, o.data.length * (small ? 46 : 54) + 48);
  const f = Charts.frame(el, { ...o, height, reserve: o.sortable ? 44 : 0 }, m);
  const mode = Charts.sortSwitch(el, f, o, redraw);
  const data = mode === "value" ? [...o.data].sort((a, b) => b.value - a.value) : o.data;
  const fmt = o.format || d3.format(",");
  const lo = Math.min(0, d3.min(data, (d) => d.value));
  const hi = Math.max(0, o.xMax !== undefined ? o.xMax : d3.max(data, (d) => d.value));
  const x = d3.scaleLinear().domain([o.xMin !== undefined ? Math.min(lo, o.xMin) : lo, hi * 1.08]).nice().range([0, f.w]);
  const y = d3.scaleBand().domain(data.map((d) => d.label)).range([0, f.h]).padding(0.28);

  f.g.append("g").attr("class", "grid-lines").attr("transform", `translate(0,${f.h})`)
    .call(d3.axisBottom(x).ticks(small ? 4 : 6).tickSize(-f.h).tickFormat(""));
  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.h})`)
    .call(d3.axisBottom(x).ticks(small ? 4 : 6).tickFormat(o.axisFormat || fmt));
  const ya = f.g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0));
  ya.select(".domain").remove();
  Charts.tween(el, ya.selectAll(".tick"), (d) => "tick:" + d, ["transform"]);
  f.g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", f.h).attr("stroke", "var(--c-axis)");

  const bars = f.g.append("g").selectAll("rect").data(data).join("rect")
    .attr("y", (d) => y(d.label))
    .attr("height", y.bandwidth())
    .attr("x", (d) => x(Math.min(0, d.value)))
    .attr("width", (d) => Math.abs(x(d.value) - x(0)))
    .attr("rx", 4)
    .attr("fill", (d) => d.colour);
  Charts.tween(el, bars, (d) => "hb:" + d.label, ["x", "y", "width", "height"], () => ({ x: x(0), width: 0 }));
  App.tip.bind(bars, o.tip, { onSelect: o.onSelect });

  // value labels: right of the bar end, or right of zero for negative bars so they never hit the axis labels
  const vl = f.g.append("g").selectAll("text").data(data).join("text").attr("class", "value-label")
    .attr("x", (d) => (d.value >= 0 ? x(d.value) + 6 : x(0) + 6))
    .attr("y", (d) => y(d.label) + y.bandwidth() / 2).attr("dy", "0.35em")
    .text((d) => (o.valueText ? o.valueText(d) : fmt(d.value)));
  Charts.tween(el, vl, (d) => "hv:" + d.label, ["x", "y"], () => ({ x: x(0) + 6 }));
};

/* ---------------------------------------------------------
   Grouped horizontal bars
   o.categories, o.groups: [{key, label, colour}], o.value(category, groupKey)
   o.sortable sorts categories by the first group's value
   --------------------------------------------------------- */
Charts.groupedHbar = (el, o) => {
  const redraw = () => Charts.groupedHbar(el, o);
  const small = el.clientWidth < 520;
  const m = { top: 8, right: 60, bottom: 36, left: small ? 104 : 140 };
  const height = o.fill ? undefined : Math.max(260, o.categories.length * o.groups.length * 22 + o.categories.length * 18 + 48);
  const f = Charts.frame(el, { ...o, height, reserve: o.sortable ? 44 : 0 }, m);
  const mode = Charts.sortSwitch(el, f, o, redraw);
  const cats = mode === "value" ? [...o.categories].sort((a, b) => o.value(b, o.groups[0].key) - o.value(a, o.groups[0].key)) : o.categories;
  const fmt = o.format || d3.format(",");
  const rows = cats.flatMap((c) => o.groups.map((g) => ({ category: c, group: g, value: o.value(c, g.key) })));
  const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.value) * 1.1 || 1]).nice().range([0, f.w]);
  const y0 = d3.scaleBand().domain(cats).range([0, f.h]).paddingInner(0.25);
  const y1 = d3.scaleBand().domain(o.groups.map((g) => g.key)).range([0, y0.bandwidth()]).padding(0.08);

  f.g.append("g").attr("class", "grid-lines").attr("transform", `translate(0,${f.h})`)
    .call(d3.axisBottom(x).ticks(5).tickSize(-f.h).tickFormat(""));
  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.h})`).call(d3.axisBottom(x).ticks(5).tickFormat(fmt));
  const ya = f.g.append("g").attr("class", "axis").call(d3.axisLeft(y0).tickSize(0));
  ya.select(".domain").remove();
  Charts.tween(el, ya.selectAll(".tick"), (d) => "tick:" + d, ["transform"]);

  const bars = f.g.append("g").selectAll("rect").data(rows).join("rect")
    .attr("y", (d) => y0(d.category) + y1(d.group.key))
    .attr("height", y1.bandwidth())
    .attr("x", 0)
    .attr("width", (d) => x(d.value))
    .attr("rx", 3)
    .attr("fill", (d) => d.group.colour);
  Charts.tween(el, bars, (d) => "gb:" + d.category + ":" + d.group.key, ["y", "width"], () => ({ width: 0 }));
  App.tip.bind(bars, o.tip, { onSelect: o.onSelect });

  const vl = f.g.append("g").selectAll("text").data(rows).join("text").attr("class", "value-label").style("font-size", "11px")
    .attr("x", (d) => x(d.value) + 4)
    .attr("y", (d) => y0(d.category) + y1(d.group.key) + y1.bandwidth() / 2).attr("dy", "0.35em")
    .text((d) => fmt(d.value));
  Charts.tween(el, vl, (d) => "gv:" + d.category + ":" + d.group.key, ["x", "y"], () => ({ x: 4 }));
};

/* ---------------------------------------------------------
   Dumbbell chart (two values per row, e.g. 2011 vs 2021)
   o.rows: [{label, a, b, emphasis, flag}], o.aLabel, o.bLabel, o.xMax
   --------------------------------------------------------- */
Charts.dumbbell = (el, o) => {
  const small = el.clientWidth < 520;
  const m = { top: 30, right: 56, bottom: 36, left: small ? 64 : 84 };
  const height = o.fill ? undefined : Math.max(240, o.rows.length * 44 + 70);
  const f = Charts.frame(el, { ...o, height }, m);
  const fmt = o.format || d3.format(".1f");
  const max = o.xMax !== undefined ? o.xMax : d3.max(o.rows, (d) => Math.max(d.a, d.b)) * 1.1;
  const x = d3.scaleLinear().domain([0, max]).nice().range([0, f.w]);
  const y = d3.scaleBand().domain(o.rows.map((d) => d.label)).range([0, f.h]).padding(0.4);
  const aCol = App.css("--c-neutral");
  const bCol = App.css("--c-older");

  f.g.append("g").attr("class", "grid-lines").attr("transform", `translate(0,${f.h})`)
    .call(d3.axisBottom(x).ticks(5).tickSize(-f.h).tickFormat(""));
  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.h})`).call(d3.axisBottom(x).ticks(5));
  f.g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();
  f.g.selectAll(".axis text").filter((d) => o.rows.find((r) => r.label === d && r.emphasis)).style("font-weight", 800);
  f.g.selectAll(".axis text").filter((d) => o.rows.find((r) => r.label === d && r.flag)).text((d) => d + " *").style("font-style", "italic");

  const leg = f.g.append("g").attr("transform", "translate(0,-18)");
  leg.append("circle").attr("cx", 6).attr("cy", 0).attr("r", 6).attr("fill", "none").attr("stroke", aCol).attr("stroke-width", 2.5);
  leg.append("text").attr("x", 16).attr("y", 4).attr("class", "axis-title").text(o.aLabel);
  leg.append("circle").attr("cx", 76).attr("cy", 0).attr("r", 6).attr("fill", bCol);
  leg.append("text").attr("x", 86).attr("y", 4).attr("class", "axis-title").text(o.bLabel);

  const rowG = f.g.append("g").selectAll("g").data(o.rows).join("g").attr("class", "series")
    .attr("transform", (d) => `translate(0,${y(d.label) + y.bandwidth() / 2})`);
  const ln = rowG.append("line").attr("x1", (d) => x(d.a)).attr("x2", (d) => x(d.b)).attr("stroke", "var(--c-axis)").attr("stroke-width", 2);
  Charts.tween(el, ln, (d) => "ln:" + d.label, ["x1", "x2"]);
  const a = rowG.append("circle").attr("cx", (d) => x(d.a)).attr("r", 7).attr("fill", "var(--surface)").attr("stroke", aCol).attr("stroke-width", 2.5);
  const b = rowG.append("circle").attr("cx", (d) => x(d.b)).attr("r", 7).attr("fill", bCol);
  Charts.tween(el, a, (d) => "a:" + d.label, ["cx"]);
  Charts.tween(el, b, (d) => "b:" + d.label, ["cx"], function (d) { return { cx: x(d.a) }; });
  App.tip.bind(a, (d) => o.tip(d, "a"));
  App.tip.bind(b, (d) => o.tip(d, "b"));
  const vl = rowG.append("text").attr("class", "value-label").attr("x", (d) => x(Math.max(d.a, d.b)) + 12).attr("dy", "0.35em").text((d) => fmt(d.b));
  Charts.tween(el, vl, (d) => "dv:" + d.label, ["x"]);
};

/* ---------------------------------------------------------
   Heatmap (rows x columns), one hue from light to strong
   o.rows, o.cols, o.value(row, col), o.tip(cell), o.flag(row, col), o.focusCol
   --------------------------------------------------------- */
Charts.heatmap = (el, o) => {
  const small = el.clientWidth < 520;
  const m = { top: 8, right: 12, bottom: 36, left: small ? 52 : 64 };
  const f = Charts.frame(el, { ...o, height: o.fill ? undefined : Math.max(260, o.rows.length * 40 + 50) }, m);
  const cells = o.rows.flatMap((r) => o.cols.map((c) => ({ row: r, col: c, value: o.value(r, c) })));
  const x = d3.scaleBand().domain(o.cols).range([0, f.w]).padding(0.06);
  const y = d3.scaleBand().domain(o.rows).range([0, f.h]).padding(0.08);
  const colour = d3.scaleLinear().domain([0, d3.max(cells, (d) => d.value) || 1])
    .range([App.css("--heat-low"), App.css("--heat-high")]).interpolate(d3.interpolateRgb);

  f.g.append("g").attr("class", "axis").attr("transform", `translate(0,${f.h})`)
    .call(d3.axisBottom(x).tickSize(0).tickValues(small ? o.cols.filter((d, i) => i % 2 === 0) : o.cols))
    .select(".domain").remove();
  f.g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();

  const rect = f.g.append("g").selectAll("rect").data(cells).join("rect")
    .attr("x", (d) => x(d.col)).attr("y", (d) => y(d.row))
    .attr("width", x.bandwidth()).attr("height", y.bandwidth())
    .attr("rx", 4).attr("fill", (d) => colour(d.value));
  Charts.tween(el, rect, (d) => "c:" + d.row + ":" + d.col, ["fill"]);
  App.tip.bind(rect, o.tip, { onSelect: o.onSelect });
  if (o.flag) {
    const hatch = Charts.hatch(f.svg);
    f.g.append("g").selectAll("rect").data(cells.filter((d) => o.flag(d.row, d.col))).join("rect")
      .attr("x", (d) => x(d.col)).attr("y", (d) => y(d.row)).attr("width", x.bandwidth()).attr("height", y.bandwidth())
      .attr("rx", 4).attr("fill", hatch).style("pointer-events", "none");
  }
  if (o.focusCol !== undefined && x(o.focusCol) !== undefined) {
    const fr = f.g.append("rect").attr("x", x(o.focusCol) - 3).attr("y", -3).attr("width", x.bandwidth() + 6).attr("height", f.h + 6)
      .attr("rx", 8).attr("fill", "none").attr("stroke", "var(--text)").attr("stroke-width", 2).style("pointer-events", "none");
    Charts.tween(el, fr, () => "__focusCol", ["x"]);
  }
  if (x.bandwidth() > 44) {
    const fmt = o.cellFormat || d3.format(".2s");
    f.g.append("g").selectAll("text").data(cells).join("text")
      .attr("x", (d) => x(d.col) + x.bandwidth() / 2).attr("y", (d) => y(d.row) + y.bandwidth() / 2).attr("dy", "0.35em")
      .attr("text-anchor", "middle").style("font-size", "11px").style("font-weight", 700).style("pointer-events", "none")
      .attr("fill", (d) => Charts.textOn(colour(d.value)))
      .text((d) => fmt(d.value));
  }
};

/* ---------------------------------------------------------
   Butterfly (back-to-back) bars, like a population pyramid.
   o.categories: top to bottom (e.g. oldest age at the top)
   o.left / o.right: { key, label, colour, value(category) }
   Both sides share one scale, so bar lengths can be compared.
   --------------------------------------------------------- */
Charts.butterfly = (el, o) => {
  const small = el.clientWidth < 520;
  const gap = small ? 52 : 70;
  const m = { top: 34, right: 44, bottom: 30, left: 44 };
  const height = o.fill ? undefined : Math.max(260, o.categories.length * 40 + 70);
  const f = Charts.frame(el, { ...o, height }, m);
  const half = (f.w - gap) / 2;
  const fmt = o.format || ((v) => d3.format(".0f")(v) + "%");
  const max = o.xMax || d3.max(o.categories.flatMap((c) => [o.left.value(c), o.right.value(c)])) || 1;
  const x = d3.scaleLinear().domain([0, max * 1.12]).range([0, half]);
  const y = d3.scaleBand().domain(o.categories).range([0, f.h]).padding(0.22);

  f.g.append("text").attr("class", "axis-title").attr("x", half / 2).attr("y", -14).attr("text-anchor", "middle").style("font-size", "13px").text(o.left.label);
  f.g.append("text").attr("class", "axis-title").attr("x", half + gap + half / 2).attr("y", -14).attr("text-anchor", "middle").style("font-size", "13px").text(o.right.label);

  const ticks = x.ticks(small ? 3 : 4).filter((t) => t > 0);
  const gl = f.g.append("g").attr("class", "grid-lines");
  ticks.forEach((t) => {
    gl.append("line").attr("x1", half - x(t)).attr("x2", half - x(t)).attr("y1", 0).attr("y2", f.h);
    gl.append("line").attr("x1", half + gap + x(t)).attr("x2", half + gap + x(t)).attr("y1", 0).attr("y2", f.h);
    f.g.append("text").attr("x", half - x(t)).attr("y", f.h + 16).attr("text-anchor", "middle").attr("fill", "var(--c-axis)").style("font-size", "11px").text(fmt(t));
    f.g.append("text").attr("x", half + gap + x(t)).attr("y", f.h + 16).attr("text-anchor", "middle").attr("fill", "var(--c-axis)").style("font-size", "11px").text(fmt(t));
  });

  f.g.append("g").selectAll("text").data(o.categories).join("text")
    .attr("x", half + gap / 2).attr("y", (c) => y(c) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("text-anchor", "middle").attr("fill", "var(--text)").style("font-size", "12px").style("font-weight", 700)
    .text((c) => c);

  const rows = o.categories.flatMap((c) => [
    { category: c, side: o.left, value: o.left.value(c) },
    { category: c, side: o.right, value: o.right.value(c) },
  ]);
  const isLeft = (d) => d.side === o.left;
  const bars = f.g.append("g").selectAll("rect").data(rows).join("rect")
    .attr("x", (d) => (isLeft(d) ? half - x(d.value) : half + gap))
    .attr("y", (d) => y(d.category))
    .attr("width", (d) => x(d.value))
    .attr("height", y.bandwidth())
    .attr("rx", 4)
    .attr("fill", (d) => d.side.colour);
  Charts.tween(el, bars, (d) => "bf:" + d.side.key + ":" + d.category, ["x", "width"],
    (d) => ({ x: isLeft(d) ? half : half + gap, width: 0 }));
  App.tip.bind(bars, o.tip, { onSelect: o.onSelect });

  const vl = f.g.append("g").selectAll("text").data(rows).join("text").attr("class", "value-label")
    .attr("x", (d) => (isLeft(d) ? half - x(d.value) - 6 : half + gap + x(d.value) + 6))
    .attr("y", (d) => y(d.category) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("text-anchor", (d) => (isLeft(d) ? "end" : "start"))
    .text((d) => fmt(d.value));
  Charts.tween(el, vl, (d) => "bv:" + d.side.key + ":" + d.category, ["x"]);
};
