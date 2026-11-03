# The Growing Older Group

**Road Crash Injuries Across Ages: The Growing Older Group in Australian Hospitals**
COS30045 Data Visualisation, Group 11

An interactive D3.js story and dashboard about road crash hospitalisations in Australia from 2011 to 2021, focusing on people aged 65 and over.

## Pages

| Page | File | What it does |
|---|---|---|
| Home | `index.html` | Title, headline numbers, links to the six chapters |
| Story | `story.html` | Eight guided chapters, each with a chart (7 = states, 8 = First Nations) |
| Dashboard | `dashboard.html` | Year player with autoplay, filters, snapshot panel, six storyline tabs |
| About the Data | `data.html` | Source, data dictionary, cleaning, limitations, searchable table, downloads |
| About | `about.html` | Purpose, team, accessibility, AI use, references |

## Folder structure

```
road-crash-older-group/
  index.html, story.html, dashboard.html, data.html, about.html
  css/style.css          one stylesheet, dark and white themes
  js/common.js           theme, menu, tooltip, pop-up, data loading, CSV download
  js/charts.js           reusable D3 charts (line, bar, horizontal bar, grouped bar, dumbbell, heatmap)
  js/home.js             home page numbers
  js/story.js            story charts
  js/dashboard.js        dashboard filters and charts
  js/datapage.js         data table on the About the Data page
  data/road_crash_hospitalisations.csv     national file (KNIME output)
  data/state_territory_hospitalisations.csv state and territory file (KNIME output)
  data/first_nations_hospitalisations.csv   First Nations file (KNIME output)
  images/                background pictures
```

## How to run it

The browser blocks `d3.csv()` when you double-click an HTML file, so always use a local server:

- **VS Code:** install the Live Server extension, right-click `index.html`, choose **Open with Live Server**.
- **GitHub Pages:** the live link works without any extra setup.

## Updating the data

If KNIME exports a new file, save it as `data/road_crash_hospitalisations.csv` with these column names:

`Calendar year, Month, ABS remoteness area, Cause of injury, Age group, Sex, Road user, Counterparty, Bed days, Hospitalisations`

The site removes rows with an unknown age or sex, fixes `16-Aug` back to `8-16`, and ignores the hidden byte-order mark KNIME sometimes adds to the first column name.

### State and First Nations files

Both are the five side-by-side tables from the BITRE `raw` tab stacked into one long table, with `Breakdown` (e.g. Age Group) and `Category` (e.g. 65-74) columns. Blank cells are **n.p.** (not published, small counts); the site keeps them as missing, never zero, and shows them striped or hollow. In the First Nations export the `Overall` rows duplicate the `Age` rows, so the site drops `Overall`.

## Accessibility and controls

- **Six themes** (Display menu in the header): System, Dark, Light, High contrast, Colour-blind safe, Soft reading. Every colour comes from CSS tokens in `css/style.css`, so text, panels, banners, charts and tooltips all change together.
- **View size** (Display menu): Auto picks 100% on phones and tablets, 90% on short laptop screens, 115% on large monitors and 130% on 4K screens. Manual 75% to 150%.
- **Keyboard:** Tab moves between controls and charts (each chart is one Tab stop). Inside a chart, the arrow keys or W A S D move point to point, Home and End jump to the ends, and Enter selects a year on the dashboard. P plays or pauses, Q and E change year, 1 to 6 switch dashboard tabs, T changes theme, ? opens the guide, Esc closes.
- **Autoplay:** the dashboard year player and story chapter 4 step through the years automatically.
- **How to use** guide in the header, plus a first-visit hint.
- Every chart has Expand, View data (table), CSV download and PNG image download.
- Charts animate between states, hovering a line or bar highlights it, line legends show or hide lines, and bar charts have a sort switch.
- Each story chapter has its own Admissions / Bed days switch and year player.
- Home page: the three questions open to show their answers with mini charts, and "Find people like you" gives a personal card.
- Dashboard: "Share view" copies a link that reopens the same year, filters, tab and state.
- Reality check: ABS population (June 2011 estimate, 2021 Census) shows the rate per older person stayed about 126 per 100,000.

## Credits

- Data: Bureau of Infrastructure and Transport Research Economics (BITRE) (2023), *Hospitalised injury*.
- Charts: D3.js version 7.
- Background banners: generated for this project (original artwork).
- Dashboard photos: Unsplash (Unsplash License), credited on the About page.
- Generative AI (Claude) helped draft and debug code; all numbers were checked against the source data.
