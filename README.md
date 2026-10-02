# Arc PAYG vs. SPLA Estimator for CSP Direct Bill Partners

A static GitHub Pages estimator for comparing the economics of Azure Arc
pay-as-you-go licensing and SPLA for SQL Server and Windows Server workloads.

The estimator is self-contained in `site/index.html`. Azure PAYG prices for all
supported currencies are embedded in that file so the published site loads
without making a pricing API request. SPLA prices are not published publicly,
remain user-provided, and are never embedded in hosted or offline HTML.
Project names and configured workloads are likewise retained only in project
JSON files and are never embedded in an offline HTML copy.

## Price refresh and deployment

The **Refresh estimator prices** GitHub Actions workflow:

- can be started manually from the repository's **Actions** tab;
- runs on the first day of every month at 12:00 AM Pacific time, accounting for
  both PST and PDT;
- fetches current SQL Server and Windows Server Arc PAYG prices from the
  [Azure Retail Prices API](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices);
- updates the embedded price map and ISO refresh timestamp in `site/index.html`;
- commits the refreshed estimator to `main`.

The successful refresh workflow triggers **Deploy estimator to GitHub
Pages**. Pushes to `main` and manual workflow dispatches also deploy the current
contents of `site/`.

## Project layout

| Path | Purpose |
| --- | --- |
| `site/index.html` | Self-contained estimator published to GitHub Pages |
| `site/pricing.js` | Azure Retail Prices API fetch and filtering helper |
| `scripts/fetch-prices.js` | Updates prices and refresh time embedded in the estimator |
| `.github/workflows/refresh-prices.yml` | Refreshes pricing monthly or manually |
| `.github/workflows/pages.yml` | Tests and deploys `site/` to GitHub Pages |

## Setup

1. In **Settings > Pages**, set **Source** to **GitHub Actions**.
2. In **Settings > Actions > General**, allow workflows read and write
   permissions so the refresh workflow can commit updated prices.
3. Run **Refresh estimator prices** from the **Actions** tab once, or refresh
   locally with `npm run fetch-prices`.
4. Push to `main`, or manually run **Deploy estimator to GitHub Pages**.

## Development

Node.js 20 or later is recommended. There are no package dependencies.

```sh
npm test
npm run fetch-prices
python -m http.server --directory site 8000
```
