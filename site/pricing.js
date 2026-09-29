/*
 * Azure Retail Prices helper shared by the web page (browser) and the
 * snapshot script (Node.js). It mirrors the original Excel/PowerQuery logic:
 *   - query every currency in CURRENCIES
 *   - follow NextPageLink until all pages are loaded
 *   - keep only hourly, global, consumption meters for the relevant SKUs
 *   - sort by serviceName, productName and add a "Last Refresh Time"
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.AzurePricing = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const API_BASE = 'https://prices.azure.com/api/retail/prices';

  const CURRENCIES = ['USD', 'EUR', 'AUD', 'BRL', 'CAD', 'CHF', 'DKK', 'GBP', 'INR', 'JPY', 'KRW', 'NOK', 'NZD', 'SEK'];

  const API_FILTER =
    "productName eq 'Azure Arc-enabled SQL Server - Arc-enabled servers'" +
    " or productName eq 'Microsoft Defender for SQL'" +
    " or skuId eq 'DZH318Z0LNG7/0007'";

  const SKU_NAMES = ['1 Core', 'Ent edition - PAYG', 'Standard', 'Std edition - PAYG'];

  const COLUMNS = [
    'currencyCode', 'unitPrice', 'location', 'meterName', 'productName', 'skuName',
    'serviceName', 'serviceFamily', 'unitOfMeasure', 'type', 'reservationTerm',
  ];

  function buildUrl(currency) {
    return API_BASE + "?currencyCode='" + encodeURIComponent(currency) + "'&$filter=" + encodeURIComponent(API_FILTER);
  }

  // Wraps a URL with an optional CORS proxy. The proxy may contain a "{url}"
  // placeholder; otherwise the encoded URL is appended to the proxy prefix.
  function applyProxy(url, proxy) {
    if (!proxy) return url;
    const encoded = encodeURIComponent(url);
    return proxy.includes('{url}') ? proxy.split('{url}').join(encoded) : proxy + encoded;
  }

  async function fetchCurrency(currency, options) {
    const opts = options || {};
    const fetchFn = opts.fetch || fetch;
    const items = [];
    let url = buildUrl(currency);
    while (url) {
      const response = await fetchFn(applyProxy(url, opts.proxy));
      if (!response.ok) {
        throw new Error('Request for ' + currency + ' failed with HTTP ' + response.status);
      }
      const json = await response.json();
      if (Array.isArray(json.Items)) items.push(...json.Items);
      url = json.NextPageLink || null;
    }
    return items;
  }

  function selectColumns(item) {
    const row = {};
    for (const col of COLUMNS) row[col] = item[col] === undefined ? null : item[col];
    return row;
  }

  function filterItems(items) {
    return items.filter((i) =>
      i.type === 'Consumption' &&
      i.unitOfMeasure === '1 Hour' &&
      i.location === 'Global' &&
      SKU_NAMES.includes(i.skuName));
  }

  function compareText(a, b) {
    const x = a == null ? '' : String(a);
    const y = b == null ? '' : String(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function sortRows(rows) {
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) =>
        compareText(a.row.serviceName, b.row.serviceName) ||
        compareText(a.row.productName, b.row.productName) ||
        a.index - b.index)
      .map((x) => x.row);
  }

  function transform(items, refreshTime) {
    const time = refreshTime || new Date().toISOString();
    return sortRows(filterItems(items).map(selectColumns))
      .map((row) => Object.assign(row, { 'Last Refresh Time': time }));
  }

  async function fetchAll(options) {
    const opts = options || {};
    const currencies = opts.currencies || CURRENCIES;
    const all = [];
    let done = 0;
    for (const currency of currencies) {
      const items = await fetchCurrency(currency, opts);
      all.push(...items);
      done += 1;
      if (opts.onProgress) opts.onProgress({ currency, done, total: currencies.length });
    }
    const refreshTime = new Date().toISOString();
    return { refreshTime, rows: transform(all, refreshTime) };
  }

  function csvEscape(value) {
    let s = value == null ? '' : String(value);
    // Neutralize text that spreadsheet apps would interpret as a formula.
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rows) {
    const header = COLUMNS.concat('Last Refresh Time');
    const lines = [header.map(csvEscape).join(',')];
    for (const row of rows) lines.push(header.map((c) => csvEscape(row[c])).join(','));
    return lines.join('\r\n');
  }

  return {
    API_BASE, CURRENCIES, API_FILTER, SKU_NAMES, COLUMNS,
    buildUrl, applyProxy, fetchCurrency, fetchAll, filterItems, sortRows, transform, toCsv,
  };
});
