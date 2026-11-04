# The Growing Older Group

**Road Crash Injuries Across Ages: The Growing Older Group**
COS30045 Data Visualisation, Group 11

A single-page, Power BI style report built with D3.js v7 about road crash hospitalisations in Australia from 2011 to 2021, focusing on people aged 65 and over.

## One page, seven report pages

Everything is in `index.html`. The tabs at the bottom show one report page at a time (no separate HTML files, no page scrolling on a laptop or desktop).

| Tab | Page | Visuals |
|---|---|---|
| 1 | Overview | 4 KPI cards, admissions by year (65+ vs under 65), by age, by road user, by remoteness |
| 2 | Age and sex | growth since 2011 by age, men vs women by age, age by year heatmap |
| 3 | Road users | road users over time, what they collided with, road user mix 65+ vs under 65 |
| 4 | Hospital stay | average days by age, average stay by road user, 65+ share of admissions vs bed days |
| 5 | States | 65+ share by state, 2011 vs selected year, selected state vs Australia |
| 6 | First Nations | growth since 2011, age profile, where people live |
| 7 | About the data | source, key terms, colour key, team, CSV downloads |

## Folder structure

```
index.html          the whole report
css/report.css      themes, layout, charts
js/core.js          themes, view size, tooltip, keyboard, pop-up, data loading, CSV and PNG download
js/charts.js        reusable D3 charts (line, column, stacked column, bars, grouped bars, dumbbell, heatmap, butterfly)
js/report.js        filters, cross-filtering, KPI cards and every visual
data/               the three KNIME CSV outputs
images/             title tile photos and illustrations
```

## Interaction

- Filters (top): year with Play, Admissions or Bed days, sex, age group, road user, remoteness. Filters that do not apply to a page are greyed out.
- Click any bar, point or cell to filter the page (click again to clear), like Power BI cross-filtering.
- The grey line under each visual title lists the filters it is using.
- Each visual: Focus mode, View data, Download CSV, Download PNG.
- Display menu: six themes (including high contrast and colour-blind safe) and view size.
- Keyboard: 1 to 7 pages, Tab, arrows or W A S D inside charts, Enter to filter, P play, Q and E year, R reset, T theme, ? guide.

## How to run

Use VS Code Live Server or GitHub Pages. Double-clicking `index.html` blocks the CSV files.

## Credits

Data: BITRE (2023) *Hospitalised Injury*. Charts: D3.js v7. Generative AI (Claude) helped draft and debug code; numbers were checked against the source files.
