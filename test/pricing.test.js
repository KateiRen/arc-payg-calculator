'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../site/pricing.js');
const U = require('../scripts/fetch-prices.js');

const item = (over) => Object.assign({
  currencyCode: 'USD', unitPrice: 0.1, location: 'Global', meterName: 'm', productName: 'p',
  skuName: '1 Core', serviceName: 's', serviceFamily: 'f', unitOfMeasure: '1 Hour',
  type: 'Consumption', armRegionName: 'global', meterId: 'x',
}, over);

test('buildUrl contains currency and the OData filter', () => {
  const url = P.buildUrl('EUR');
  assert.ok(url.startsWith("https://prices.azure.com/api/retail/prices?currencyCode='EUR'&$filter="));
  assert.strictEqual(decodeURIComponent(url.split('$filter=')[1]), P.API_FILTER);
});

test('covers all currencies from the original query', () => {
  assert.deepStrictEqual(P.CURRENCIES,
    ['USD', 'EUR', 'AUD', 'BRL', 'CAD', 'CHF', 'DKK', 'GBP', 'INR', 'JPY', 'KRW', 'NOK', 'NZD', 'SEK']);
});

test('queries the SQL and Windows Server Arc PAYG products', () => {
  assert.match(P.API_FILTER, /Azure Arc-enabled SQL Server/);
  assert.match(P.API_FILTER, /Az Arc Pay As You Go Windows Server/);
  assert.deepStrictEqual(P.SKU_NAMES,
    ['1 Core', 'Ent edition - PAYG', 'Std edition - PAYG']);
});

test('applyProxy supports placeholder and prefix styles', () => {
  const url = 'https://prices.azure.com/api/retail/prices?a=1';
  assert.strictEqual(P.applyProxy(url, ''), url);
  assert.strictEqual(P.applyProxy(url, 'https://proxy/?'), 'https://proxy/?' + encodeURIComponent(url));
  assert.strictEqual(P.applyProxy(url, 'https://proxy/?url={url}&x=1'),
    'https://proxy/?url=' + encodeURIComponent(url) + '&x=1');
});

test('transform filters, selects columns, sorts and adds refresh time', () => {
  const rows = P.transform([
    item({ serviceName: 'b', productName: 'z' }),
    item({ serviceName: 'a', productName: 'y', skuName: 'Ent edition - PAYG' }),
    item({ type: 'Reservation' }),
    item({ unitOfMeasure: '1/Month' }),
    item({ location: 'EU West' }),
    item({ skuName: 'Other' }),
    item({ serviceName: 'a', productName: 'x', skuName: 'Std edition - PAYG', reservationTerm: '1 Year' }),
  ], 'T');
  assert.deepStrictEqual(rows.map((r) => r.productName), ['x', 'y', 'z']);
  assert.deepStrictEqual(Object.keys(rows[0]), P.COLUMNS.concat('Last Refresh Time'));
  assert.strictEqual(rows[0].reservationTerm, '1 Year');
  assert.strictEqual(rows[1].reservationTerm, null);
  assert.ok(rows.every((r) => r['Last Refresh Time'] === 'T'));
});

test('fetchAll follows NextPageLink for every currency', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    const currency = /currencyCode='(\w+)'/.exec(decodeURIComponent(url))[1];
    const page2 = url.includes('page=2');
    return {
      ok: true,
      json: async () => ({
        Items: [item({ currencyCode: currency, meterName: page2 ? 'p2' : 'p1' })],
        NextPageLink: page2 ? null : `https://prices.azure.com/api/retail/prices?currencyCode='${currency}'&page=2`,
      }),
    };
  };
  const progress = [];
  const result = await P.fetchAll({ currencies: ['USD', 'EUR'], fetch: fakeFetch, onProgress: (p) => progress.push(p.currency) });
  assert.strictEqual(calls.length, 4);
  assert.strictEqual(result.rows.length, 4);
  assert.deepStrictEqual(progress, ['USD', 'EUR']);
  assert.ok(result.refreshTime);
});

test('fetchAll applies proxy to every page and reports HTTP errors', async () => {
  const calls = [];
  await P.fetchAll({
    currencies: ['USD'],
    proxy: 'https://proxy/?',
    fetch: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => ({ Items: [], NextPageLink: calls.length < 2 ? 'https://prices.azure.com/next' : null }) };
    },
  });
  assert.ok(calls.every((u) => u.startsWith('https://proxy/?')));
  await assert.rejects(
    P.fetchAll({ currencies: ['USD'], fetch: async () => ({ ok: false, status: 429 }) }),
    /HTTP 429/);
});

test('toCsv escapes values', () => {
  const csv = P.toCsv([Object.assign(item({ meterName: 'a,"b"' }), { 'Last Refresh Time': 'T' })]);
  const [header, line] = csv.split('\r\n');
  assert.strictEqual(header, P.COLUMNS.concat('Last Refresh Time').join(','));
  assert.ok(line.includes('"a,""b"""'));
});

test('toCsv quotes separators/newlines, renders null as empty and neutralizes formulas', () => {
  const csv = P.toCsv([Object.assign(item({ meterName: 'a;b', productName: 'x\ny', skuName: '=1+1', unitPrice: -1 }),
    { 'Last Refresh Time': 'T' })]);
  const line = csv.slice(csv.indexOf('\r\n') + 2);
  assert.ok(line.includes('"a;b"'));
  assert.ok(line.includes('"x\ny"'));
  assert.ok(line.includes(",'=1+1,"));
  assert.ok(line.startsWith('USD,-1,'));
  assert.ok(line.includes(',,T'));
});

test('buildEmbeddedPrices maps only SQL and Windows Azure prices', () => {
  const rows = P.CURRENCIES.flatMap((currency, index) => [
    item({
      currencyCode: currency,
      productName: U.SQL_PRODUCT,
      meterName: 'Std edition - PAYG',
      unitPrice: index + 0.1,
    }),
    item({
      currencyCode: currency,
      productName: U.SQL_PRODUCT,
      meterName: 'Ent edition - PAYG',
      unitPrice: index + 0.2,
    }),
    item({
      currencyCode: currency,
      productName: U.WINDOWS_PRODUCT,
      meterName: '1 Core License',
      unitPrice: index + 0.3,
    }),
  ]);

  const prices = U.buildEmbeddedPrices(rows, {
    'sql:USD': { spla1: 12, spla2: 34, splaEntered: true },
  });

  assert.deepStrictEqual(prices['sql:USD'], {
    payg1: 0.1,
    payg2: 0.2,
  });
  assert.deepStrictEqual(prices['windows:SEK'], {
    payg1: 13.3,
    payg2: 13.3,
  });
});

test('updateHtml rewrites embedded prices and refresh timestamps', () => {
  const rows = P.CURRENCIES.flatMap((currency) => [
    item({
      currencyCode: currency,
      productName: U.SQL_PRODUCT,
      meterName: 'Std edition - PAYG',
      unitPrice: 1,
    }),
    item({
      currencyCode: currency,
      productName: U.SQL_PRODUCT,
      meterName: 'Ent edition - PAYG',
      unitPrice: 2,
    }),
    item({
      currencyCode: currency,
      productName: U.WINDOWS_PRODUCT,
      meterName: '1 Core License',
      unitPrice: 3,
    }),
  ]);
  const html = [
    '<span id="time">old</span>',
    'const EMBEDDED_PRICES={"sql:USD":{"spla1":4}};',
    "const EMBEDDED_REFRESHED_AT='old';",
  ].join('\n');
  const timestamp = '2026-09-29T22:00:00.000Z';
  const updated = U.updateHtml(html, rows, timestamp);

  assert.match(updated, /"sql:USD":\{"payg1":1,"payg2":2\}/);
  assert.doesNotMatch(updated, /"spla1"|"spla2"|"splaEntered"/);
  assert.match(updated, /"windows:USD":\{"payg1":3,"payg2":3\}/);
  assert.match(updated, /const EMBEDDED_REFRESHED_AT="2026-09-29T22:00:00.000Z";/);
  assert.match(updated, /<span id="time">Azure prices refreshed 2026-09-29T22:00:00.000Z \(UTC\)<\/span>/);
});

test('published calculator uses workflow pricing and offers an offline copy', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');

  assert.doesNotMatch(html, /id="refresh"|fetchAzurePrices|refreshPrices|\/api\/prices/);
  assert.doesNotMatch(html, /id="saveUpdated"|saveUpdatedFile/);
  assert.match(html, /<header[\s\S]*id="saveOffline" hidden[\s\S]*<\/header>/);
  assert.match(html, /function saveOfflineFile\(/);
  assert.match(html, /location\.hostname==='kateiren\.github\.io'/);
  assert.match(html, /location\.pathname\.startsWith\('\/arc-payg-calculator\/'\)/);
  assert.match(html, /id="saveOfflineInstruction" hidden/);
  assert.match(html, /\$\('saveOffline'\)\.hidden=\$\('saveOfflineInstruction'\)\.hidden=!onGitHubPages/);
  assert.match(html, /if\(onGitHubPages\)\$\('saveOffline'\)\.onclick=saveOfflineFile/);
  assert.match(html, /id="offlineNotice"[\s\S]*hidden/);
  assert.match(html, /const OFFLINE_EXPORTED_AT=null;/);
  assert.match(html, /const OFFLINE_EXPORTED_AT=\$\{JSON\.stringify\(new Date\(\)\.toISOString\(\)\)\};/);
  assert.match(html, /offline=location\.protocol==='file:'/);
  assert.match(html, /\$\('offlineNotice'\)\.hidden=!offline/);
  assert.match(html, /https:\/\/kateiren\.github\.io\/arc-payg-calculator\//);
  assert.doesNotMatch(html, /dco-tooltip|dcoTooltip|class="tooltip"|role="tooltip"/);
  assert.match(html, /\.tabs\{display:flex;gap:0;overflow:hidden;border:1px solid var\(--line\);border-radius:11px/);
  assert.match(html, /\.tabs \.tab\{flex:1;border:0;border-radius:0\}/);
  assert.match(html, /\.tabs \.tab\+\.tab\{border-left:1px solid var\(--line\)\}/);
  assert.match(html, /function compact\(v\)\{return new Intl\.NumberFormat\(undefined,\{style:'currency',currency:state\[pane\]\.currency,notation:'compact'/);
  assert.match(html, /labels=\['SPLA Incentive loss','Purchase price','PEC','MCI Core','Growth Accelerator','DCO'\]/);
  assert.doesNotMatch(html, /labels=\['SPLA loss','Purchase price','PEC','MCI','Accelerator','DCO'\]/);
  assert.doesNotMatch(html, /const WINSPLA=|const SQL=\{/);
  assert.match(html, /const SQLPAYG=\{/);
  assert.match(html, /function azurePricingSnapshot\(\).*?snapshot\[key\]=\{payg1:p\.payg1,payg2:p\.payg2\}/);
  assert.match(html, /const EMBEDDED_PRICES=\$\{JSON\.stringify\(azurePricingSnapshot\(\)\)\};/);
  assert.match(html, /function ensureOfflinePrivacy\(content\)/);
  assert.match(html, /Offline HTML must not contain a project name or configured workloads/);
  assert.match(html, /return ensureOfflinePrivacy\(content\)/);
  assert.doesNotMatch(html, /localStorage\.setItem\(['"](?:projectName|calculations|rows)/);
  assert.match(html, /function defaultState\(\)\{return\{sql:\{currency:'EUR',rows:\[\{edition:'Standard',qty:1,cores:32,uptime:'7x24'\},\{edition:'Standard',qty:1,cores:16,uptime:'5x10'\}\]/);
  assert.match(html, /windows:\{currency:'EUR',rows:\[\{edition:'Datacenter',qty:2,cores:8,uptime:'7x24'\},\{edition:'Datacenter',qty:1,cores:4,uptime:'5x10'\}\]/);
  assert.match(html, /function resetAll\(\).*?let defaults=defaultState\(\);state\.sql=defaults\.sql;state\.windows=defaults\.windows/);
  assert.doesNotMatch(html, /cores:220|qty:20|qty:40/);

  const embedded = JSON.parse(/const EMBEDDED_PRICES=(.*?);/.exec(html)[1]);
  for (const price of Object.values(embedded)) {
    assert.deepStrictEqual(Object.keys(price).sort(), ['payg1', 'payg2']);
  }
});
