#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CURRENCIES, fetchAll } = require('../site/pricing.js');

const SQL_PRODUCT = 'Azure Arc-enabled SQL Server - Arc-enabled servers';
const WINDOWS_PRODUCT = 'Az Arc Pay As You Go Windows Server';
const DEFAULT_OUTPUT = path.join(__dirname, '..', 'site', 'index.html');

function findPrice(rows, currency, productName, meterName) {
  const matches = rows.filter((row) =>
    row.currencyCode === currency &&
    row.productName === productName &&
    row.meterName === meterName);

  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${currency} ${productName} / ${meterName} meter, found ${matches.length}`);
  }

  const price = matches[0].unitPrice;
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Invalid unit price for ${currency} ${productName} / ${meterName}`);
  }
  return price;
}

function buildEmbeddedPrices(rows) {
  const prices = {};

  for (const currency of CURRENCIES) {
    const sqlStandard = findPrice(rows, currency, SQL_PRODUCT, 'Std edition - PAYG');
    const sqlEnterprise = findPrice(rows, currency, SQL_PRODUCT, 'Ent edition - PAYG');
    const windows = findPrice(rows, currency, WINDOWS_PRODUCT, '1 Core License');

    prices[`sql:${currency}`] = {
      payg1: sqlStandard,
      payg2: sqlEnterprise,
    };
    prices[`windows:${currency}`] = {
      payg1: windows,
      payg2: windows,
    };
  }

  return prices;
}

function updateHtml(html, rows, refreshTime) {
  if (!/const EMBEDDED_PRICES=.*?;/.test(html) ||
      !/const EMBEDDED_REFRESHED_AT=.*?;/.test(html)) {
    throw new Error('Embedded pricing markers not found in calculator HTML');
  }

  const prices = buildEmbeddedPrices(rows);
  const visibleRefreshTime = `Azure prices refreshed ${refreshTime} (UTC)`;

  return html
    .replace(
      /const EMBEDDED_PRICES=.*?;/,
      `const EMBEDDED_PRICES=${JSON.stringify(prices)};`)
    .replace(
      /const EMBEDDED_REFRESHED_AT=.*?;/,
      `const EMBEDDED_REFRESHED_AT=${JSON.stringify(refreshTime)};`)
    .replace(
      /(<span id="time">).*?(<\/span>)/,
      `$1${visibleRefreshTime}$2`);
}

async function main(output = process.argv[2] || DEFAULT_OUTPUT) {
  const result = await fetchAll({
    onProgress: ({ currency, done, total }) =>
      console.log(`Fetched ${currency} (${done}/${total})`),
  });
  const html = fs.readFileSync(output, 'utf8');
  fs.writeFileSync(output, updateHtml(html, result.rows, result.refreshTime));
  console.log(`Updated embedded Azure prices and refresh time in ${output}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  SQL_PRODUCT,
  WINDOWS_PRODUCT,
  buildEmbeddedPrices,
  updateHtml,
};
