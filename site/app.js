(function () {
  'use strict';

  const P = window.AzurePricing;
  const SNAPSHOT_URL = 'data/prices.json';
  const HEADERS = P.COLUMNS.concat('Last Refresh Time');

  const $ = (id) => document.getElementById(id);
  const lastRefresh = $('last-refresh');
  const statusEl = $('status');
  const viewCurrency = $('view-currency');
  const search = $('search');
  const rowCount = $('row-count');
  const table = $('results');
  const loadButton = $('load-snapshot');

  let rows = [];
  let sort = { column: null, dir: 1 };

  // Table header
  const headRow = table.tHead.rows[0];
  for (const col of HEADERS) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = col;
    th.dataset.column = col;
    th.tabIndex = 0;
    th.addEventListener('click', () => sortBy(col));
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(col); } });
    headRow.append(th);
  }

  function sortBy(col) {
    sort = { column: col, dir: sort.column === col ? -sort.dir : 1 };
    render();
  }

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', !!isError);
  }

  function setBusy(busy) {
    loadButton.disabled = busy;
  }

  function formatValue(col, value) {
    if (value == null) return '';
    if (col === 'Last Refresh Time') {
      const d = new Date(value);
      return isNaN(d) ? String(value) : d.toLocaleString();
    }
    if (col === 'unitPrice' && typeof value === 'number') {
      return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
    }
    return String(value);
  }

  function visibleRows() {
    const cur = viewCurrency.value;
    const q = search.value.trim().toLowerCase();
    let out = rows.filter((r) => (!cur || r.currencyCode === cur) &&
      (!q || HEADERS.some((c) => r[c] != null && String(r[c]).toLowerCase().includes(q))));
    if (sort.column) {
      const c = sort.column;
      out = out.slice().sort((a, b) => {
        const x = a[c], y = b[c];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
        return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y)) * sort.dir;
      });
    }
    return out;
  }

  function render() {
    const data = visibleRows();
    const body = document.createElement('tbody');
    for (const r of data) {
      const tr = document.createElement('tr');
      for (const c of HEADERS) {
        const td = document.createElement('td');
        td.textContent = formatValue(c, r[c]);
        if (c === 'unitPrice') td.className = 'num';
        tr.append(td);
      }
      body.append(tr);
    }
    table.replaceChild(body, table.tBodies[0]);
    for (const th of headRow.cells) {
      th.setAttribute('aria-sort', th.dataset.column === sort.column ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none');
    }
    rowCount.textContent = data.length + ' of ' + rows.length + ' rows';
    $('download-csv').disabled = data.length === 0;
  }

  function setRows(newRows) {
    rows = newRows;
    const current = viewCurrency.value;
    const codes = Array.from(new Set(rows.map((r) => r.currencyCode))).sort();
    viewCurrency.length = 1;
    for (const code of codes) viewCurrency.add(new Option(code, code));
    viewCurrency.value = codes.includes(current) ? current : '';
    render();
  }

  async function loadSnapshot() {
    setBusy(true);
    setStatus('Loading published prices…');
    try {
      const response = await fetch(SNAPSHOT_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const snapshot = await response.json();
      setRows(Array.isArray(snapshot.rows) ? snapshot.rows : []);
      const refreshTime = snapshot.refreshTime;
      lastRefresh.textContent = formatValue('Last Refresh Time', refreshTime) || 'Unknown';
      if (refreshTime) lastRefresh.dateTime = refreshTime;
      else lastRefresh.removeAttribute('datetime');
      setStatus('Stored prices loaded: ' + rows.length + ' rows.');
    } catch (err) {
      lastRefresh.textContent = 'Unavailable';
      lastRefresh.removeAttribute('datetime');
      setStatus('Published prices could not be loaded (' + err.message + ').', true);
    } finally {
      setBusy(false);
    }
  }

  loadButton.addEventListener('click', loadSnapshot);
  viewCurrency.addEventListener('change', render);
  search.addEventListener('input', render);

  $('download-csv').addEventListener('click', () => {
    const blob = new Blob(['\ufeff' + P.toCsv(visibleRows())], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'azure-sql-payg-prices.csv';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  render();
  loadSnapshot();
})();
