import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CSV_HEADER = 'pilot_id,task_id,workflow,attempt,creation_min,review_min,correction_min,publish_min,support_min,wait_min,quality_pass,unauthorized_publish,fact_error,severe_page_error';
const columns = CSV_HEADER.split(',');
const humanFields = ['creation_min', 'review_min', 'correction_min', 'publish_min', 'support_min'];
const minuteFields = [...humanFields, 'wait_min'];
const booleanFields = ['quality_pass', 'unauthorized_publish', 'fact_error', 'severe_page_error'];

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value && !/[,"\r\n]/.test(value);
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('invalid_row');
  if (!validId(row.pilot_id) || !validId(row.task_id)) throw Error('invalid_id');
  if (!['baseline', 'slot'].includes(row.workflow)) throw Error('invalid_workflow');
  if (!Number.isSafeInteger(row.attempt) || row.attempt < 1) throw Error('invalid_attempt');
  for (const key of minuteFields) {
    if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0) throw Error('invalid_minutes');
  }
  for (const key of booleanFields) {
    if (typeof row[key] !== 'boolean') throw Error('invalid_boolean');
  }
  return row;
}

function validateRows(rows) {
  if (!Array.isArray(rows)) throw Error('invalid_rows');
  const pilots = new Set();
  const attempts = new Set();
  for (const row of rows) {
    normalizeRow(row);
    pilots.add(row.pilot_id);
    const key = JSON.stringify([row.pilot_id, row.task_id, row.workflow, row.attempt]);
    if (attempts.has(key)) throw Error('duplicate_attempt');
    attempts.add(key);
  }
  if (pilots.size > 1) throw Error('multiple_pilots');
  return rows;
}

export function parsePilotCsv(text) {
  if (typeof text !== 'string') throw Error('invalid_csv');
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.shift() !== CSV_HEADER) throw Error('invalid_csv_header');
  const rows = lines.map(line => {
    if (line.includes('"') || line.includes('\r')) throw Error('invalid_csv');
    const values = line.split(',');
    if (values.length !== columns.length) throw Error('invalid_csv');
    const row = Object.fromEntries(columns.map((key, i) => [key, values[i]]));
    if (!/^[1-9]\d*$/.test(row.attempt)) throw Error('invalid_attempt');
    row.attempt = Number(row.attempt);
    for (const key of minuteFields) {
      if (!/^(?:\d+)(?:\.\d+)?$/.test(row[key])) throw Error('invalid_minutes');
      row[key] = Number(row[key]);
    }
    for (const key of booleanFields) {
      if (row[key] !== 'true' && row[key] !== 'false') throw Error('invalid_boolean');
      row[key] = row[key] === 'true';
    }
    return row;
  });
  return validateRows(rows);
}

export function summarize(rows, setupMinutes, maintenanceMinutes) {
  validateRows(rows);
  for (const cost of [setupMinutes, maintenanceMinutes]) {
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) throw Error('invalid_cost');
  }
  const groups = new Map();
  let safetyFailure = false;
  let totalWaitMinutes = 0;
  for (const row of rows) {
    const minutes = humanFields.reduce((sum, key) => sum + row[key], 0);
    totalWaitMinutes += row.wait_min;
    if (row.unauthorized_publish || row.fact_error || row.severe_page_error) safetyFailure = true;
    const group = groups.get(row.task_id) ?? {
      baseline: 0, slot: 0, seen: new Set(),
      attempts: { baseline: [], slot: [] },
    };
    group[row.workflow] += minutes;
    group.seen.add(row.workflow);
    group.attempts[row.workflow].push(row);
    groups.set(row.task_id, group);
  }
  const pairs = [...groups.values()];
  if (pairs.some(group => group.seen.size !== 2)) throw Error('unpaired');
  for (const group of pairs) {
    for (const workflow of ['baseline', 'slot']) {
      const attempts = group.attempts[workflow];
      const maxAttempt = Math.max(...attempts.map(row => row.attempt));
      if (attempts.some(row => row.quality_pass && row.attempt !== maxAttempt)) throw Error('invalid_quality_sequence');
    }
  }
  const ratios = pairs.map(group => group.baseline > 0 ? 1 - group.slot / group.baseline : 0).sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const medianReduction = ratios.length === 0 ? 0 : ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  const netSavedMinutes = pairs.reduce((sum, group) => sum + group.baseline - group.slot, 0) - setupMinutes - maintenanceMinutes;
  const qualityPassed = pairs.every(group => ['baseline', 'slot'].every(workflow =>
    group.attempts[workflow].some(row => row.quality_pass)));
  const eligible = pairs.length >= 3 && qualityPassed && medianReduction >= 0.3 && netSavedMinutes > 0 && !safetyFailure;
  return {
    pairedTasks: pairs.length, medianReduction, netSavedMinutes, totalWaitMinutes,
    decision: eligible ? 'eligible_for_next_pilot' : 'do_not_expand',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 5) throw Error('usage: node analyze-pilot.mjs <csv> <setup_minutes> <maintenance_minutes>');
    const [path, setupText, maintenanceText] = process.argv.slice(2);
    const parseCost = value => {
      if (!/^(?:\d+)(?:\.\d+)?$/.test(value)) throw Error('invalid_cost');
      return Number(value);
    };
    const rows = parsePilotCsv(readFileSync(path, 'utf8'));
    const result = summarize(rows, parseCost(setupText), parseCost(maintenanceText));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
