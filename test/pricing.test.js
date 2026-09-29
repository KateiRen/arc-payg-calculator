'use strict';

const test = require('node:test');
const assert = require('node:assert');
const P = require('../site/pricing.js');

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
    item({ serviceName: 'a', productName: 'x', skuName: 'Standard', reservationTerm: '1 Year' }),
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
