/* datapage.js  -  live counts, cleaning summary and a filterable, paginated data table */

const DataPage = { rows: [], view: [], page: 0, perPage: 25 };

DataPage.columns = [
  { key: "year", label: "Calendar year" },
  { key: "month", label: "Month" },
  { key: "remoteness", label: "ABS remoteness area" },
  { key: "age", label: "Age group" },
  { key: "ageBand", label: "Older group" },
  { key: "sex", label: "Sex" },
  { key: "roadUser", label: "Road user" },
  { key: "ruGroup", label: "Road user group" },
  { key: "counterparty", label: "Counterparty" },
  { key: "bedDays", label: "Bed days", num: true, format: App.fmt },
  { key: "hosp", label: "Hospitalisations", num: true, format: App.fmt },
];

DataPage.apply = () => {
  const val = (id) => document.getElementById(id).value;
  const year = val("tYear");
  const age = val("tAge");
  const sex = val("tSex");
  const road = val("tRoad");
  const q = val("tSearch").trim().toLowerCase();
  DataPage.view = DataPage.rows.filter(
    (d) =>
      (year === "All" || d.year === +year) &&
      (age === "All" || d.age === age) &&
      (sex === "All" || d.sex === sex) &&
      (road === "All" || d.ruGroup === road) &&
      (!q || `${d.month} ${d.remoteness} ${d.roadUser} ${d.counterparty}`.toLowerCase().includes(q))
  );
  DataPage.page = 0;
  DataPage.render();
};

DataPage.render = () => {
  const pages = Math.max(1, Math.ceil(DataPage.view.length / DataPage.perPage));
  DataPage.page = Math.min(DataPage.page, pages - 1);
  const start = DataPage.page * DataPage.perPage;
  const slice = DataPage.view.slice(start, start + DataPage.perPage);

  const holder = document.getElementById("tTable");
  holder.innerHTML = "";
  holder.appendChild(App.buildTable(DataPage.columns, slice));

  document.getElementById("tPage").textContent = `Page ${DataPage.page + 1} of ${App.fmt(pages)}`;
  document.getElementById("tPrev").disabled = DataPage.page === 0;
  document.getElementById("tNext").disabled = DataPage.page >= pages - 1;
  document.getElementById("tStatus").textContent =
    `${App.fmt(DataPage.view.length)} rows match, ${App.fmt(d3.sum(DataPage.view, (d) => d.hosp))} hospitalisations.`;
};

// count the n.p. cells in the two extra files
App.data.loadState().then((r) => { document.getElementById("npState").textContent = `${App.fmt(r.filter((d) => d.hosp === null).length)} n.p. cells`; }).catch(() => {});
App.data.loadFN().then((r) => { document.getElementById("npFN").textContent = `${App.fmt(r.filter((d) => d.hosp === null).length)} n.p. cells`; }).catch(() => {});

App.data
  .load()
  .then((rows) => {
    DataPage.rows = rows;
    const info = App.data.info;

    document.getElementById("gRows").textContent = App.fmt(info.cleanRows);
    document.getElementById("gHosp").textContent = App.fmt(info.cleanHosp);
    document.getElementById("gBed").textContent = App.fmt(d3.sum(rows, (d) => d.bedDays));

    document.getElementById("cleanCounts").innerHTML = `
      <h3>Rows before and after the browser check</h3>
      <table class="wrap">
        <tbody>
          <tr><th scope="row" >Rows in the CSV file</th><td class="num">${App.fmt(info.rawRows)}</td></tr>
          <tr><th scope="row" >Rows removed (unknown age or sex)</th><td class="num">${App.fmt(info.droppedRows)}</td></tr>
          <tr><th scope="row" >Rows used on this site</th><td class="num">${App.fmt(info.cleanRows)}</td></tr>
          <tr><th scope="row" >Hospitalisations removed</th><td class="num">${App.fmt(info.droppedHosp)} of ${App.fmt(info.rawHosp)}</td></tr>
        </tbody>
      </table>
      <p class="muted" style="margin-top:10px">That is ${d3.format(".3f")((info.droppedHosp / info.rawHosp) * 100)}% of all hospitalisations, so it does not change any pattern.</p>`;

    App.YEARS.forEach((y) => document.getElementById("tYear").add(new Option(y, y)));
    App.AGE_ORDER.forEach((a) => document.getElementById("tAge").add(new Option(a, a)));
    App.RU_ORDER.forEach((g) => document.getElementById("tRoad").add(new Option(g, g)));

    ["tYear", "tAge", "tSex", "tRoad"].forEach((id) => document.getElementById(id).addEventListener("change", DataPage.apply));
    let timer;
    document.getElementById("tSearch").addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(DataPage.apply, 200);
    });
    document.getElementById("tPrev").addEventListener("click", () => { DataPage.page--; DataPage.render(); });
    document.getElementById("tNext").addEventListener("click", () => { DataPage.page++; DataPage.render(); });
    document.getElementById("tDownload").addEventListener("click", () =>
      App.downloadCSV("road_crash_hospitalisations_filtered.csv", DataPage.view, DataPage.columns)
    );

    DataPage.apply();
  })
  .catch((err) => App.showLoadError("#tTable", err));
