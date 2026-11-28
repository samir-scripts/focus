'use strict';

// Review-only simulation of Focus consuming synthetic Grace history pages.
const { readFileSync } = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const { join } = require('node:path');
const { cases } = JSON.parse(readFileSync(join(__dirname, 'grace-history.json'), 'utf8'));

function observe(events) {
  let state = 'unavailable';
  let records = [];
  let revision = -1;
  let cursor = null;
  for (const event of events) {
    if (event.type === 'ack') continue;
    if (event.type === 'failure') {
      state = 'unavailable'; records = []; cursor = null;
      continue;
    }
    const page = event.page;
    if (event.type === 'page' && (!cursor || event.cursor !== cursor || page.revision !== revision)) continue;
    if (event.type === 'root' && Number.isSafeInteger(page.revision) && page.revision < revision) continue;
    if (page.version !== 1) {
      state = Number.isSafeInteger(page.version) ? 'incompatible' : 'unavailable';
      records = []; cursor = null;
      continue;
    }
    if (!Number.isSafeInteger(page.revision) || page.revision < 0 || typeof page.cleared !== 'boolean' ||
        !Array.isArray(page.records) || !(page.nextCursor === null || (typeof page.nextCursor === 'string' && page.nextCursor.length)) ||
        (page.cleared && (page.records.length || page.nextCursor !== null))) {
      state = 'unavailable'; records = []; cursor = null;
      continue;
    }
    if (event.type === 'root') records = [];
    revision = page.revision;
    cursor = page.nextCursor;
    const ids = new Set(records.map(record => record.id));
    for (const record of page.records) {
      if (!record || typeof record.id !== 'string' || !record.id.length ||
          !Number.isSafeInteger(record.startMs) || !Number.isSafeInteger(record.endMs) ||
          record.endMs <= record.startMs || ids.has(record.id)) continue;
      ids.add(record.id);
      records.push({ id: record.id, startMs: record.startMs, endMs: record.endMs });
    }
    state = page.cleared ? 'cleared' : records.length ? 'populated' : cursor ? 'loading' : 'empty';
  }
  return { state, records };
}

let failed = false;
for (const item of cases) {
  const actual = observe(item.events);
  const pass = isDeepStrictEqual(actual, item.expected);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${item.name}\n  expected: ${JSON.stringify(item.expected)}\n  observed: ${JSON.stringify(actual)}`);
  if (!pass) failed = true;
}
if (cases.length !== 8 || failed) process.exitCode = 1;
