# sql-payg-test

A static web page (hosted on GitHub Pages) that shows the pay-as-you-go prices for
**Azure Arc-enabled SQL Server** and **Microsoft Defender for SQL** from the
[Azure Retail Prices API](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices).
It replaces the previous Excel/PowerQuery solution and applies the same logic:

- queries the currencies USD, EUR, AUD, BRL, CAD, CHF, DKK, GBP, INR, JPY, KRW, NOK, NZD and SEK
- API filter: `productName eq 'Azure Arc-enabled SQL Server - Arc-enabled servers' or productName eq 'Microsoft Defender for SQL' or skuId eq 'DZH318Z0LNG7/0007'`
- follows `NextPageLink` to load all pages
- keeps only rows with `type = Consumption`, `unitOfMeasure = 1 Hour`, `location = Global` and
  `skuName` in `1 Core`, `Ent edition - PAYG`, `Standard`, `Std edition - PAYG`
- sorts by `serviceName`, `productName` and adds a `Last Refresh Time` column

## Using the page

- **Get live prices** – calls the API directly from your browser for the selected currencies.
- **Load published snapshot** – loads `data/prices.json`, which the GitHub Actions workflow fetches
  server-side daily (loaded automatically when the page opens).
- **Download CSV** – exports the currently shown rows (e.g. for Excel).

The Azure Retail Prices API does not always send CORS headers, so browsers may block the live request.
In that case either use the published snapshot or set a CORS proxy under *Advanced* (use `{url}` as a
placeholder for the encoded API URL, e.g. `https://corsproxy.io/?url={url}`). The proxy setting is
stored in your browser's local storage.

## Project layout

| Path | Purpose |
| --- | --- |
| `site/` | The static site that is published to GitHub Pages |
| `site/pricing.js` | Shared fetch/filter/sort logic (browser and Node.js) |
| `scripts/fetch-prices.js` | Creates the snapshot `site/data/prices.json` |
| `.github/workflows/pages.yml` | Tests, fetches the snapshot and deploys to Pages on push to `main`, daily, or manually |

## Setup

1. In the repository settings go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main` (or run the *Deploy pricing page to GitHub Pages* workflow manually).

## Development

Requires Node.js 18 or later (no dependencies).

```sh
npm test               # run the unit tests
npm run fetch-prices   # create site/data/prices.json
python3 -m http.server --directory site 8000   # preview at http://localhost:8000
```
