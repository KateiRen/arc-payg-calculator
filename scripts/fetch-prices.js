#!/usr/bin/env node
// Fetches the current prices server-side and writes a snapshot that the
// GitHub Pages site can load when the browser cannot call the API directly.
'use strict';

const fs = require('fs');
const path = require('path');
const { fetchAll } = require('../site/pricing.js');

const output = process.argv[2] || path.join(__dirname, '..', 'site', 'data', 'prices.json');

fetchAll({
  onProgress: ({ currency, done, total }) => console.log(`Fetched ${currency} (${done}/${total})`),
})
  .then((result) => {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(`Wrote ${result.rows.length} rows to ${output}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
