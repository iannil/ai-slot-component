import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarize, parsePilotCsv, CSV_HEADER } from './analyze-pilot.mjs';

// 以下记录均为 synthetic，绝不写入真实试点日志。
const row = (task_id, workflow, minutes, attempt = 1, overrides = {}) => ({
  pilot_id: 'synthetic-pilot', task_id, workflow, attempt,
  creation_min: minutes, review_min: 0, correction_min: 0, publish_min: 0,
  support_min: 0, wait_min: 0, quality_pass: true,
  unauthorized_publish: false, fact_error: false, severe_page_error: false,
  ...overrides,
});
const paired = (ids = ['a', 'b', 'c'], baseline = 20, slot = 10) => ids.flatMap(id => [
  row(id, 'baseline', baseline), row(id, 'slot', slot),
]);

function csv(rows) {
  return `${CSV_HEADER}\n${rows.map(r => CSV_HEADER.split(',').map(k => r[k]).join(',')).join('\n')}${rows.length ? '\n' : ''}`;
}

test('接入成本与失败返工全部计入，总等待另列', () => {
  const rows = [
    row('a', 'baseline', 20), row('a', 'slot', 8, 1, { quality_pass: false, wait_min: 30 }),
    row('a', 'slot', 2, 2, { wait_min: 5 }),
    row('b', 'baseline', 20), row('b', 'slot', 10),
    row('c', 'baseline', 20), row('c', 'slot', 10),
  ];
  const result = summarize(rows, 40, 0);
  assert.equal(result.netSavedMinutes, -10);
  assert.equal(result.totalWaitMinutes, 35);
  assert.equal(result.medianReduction, 0.5);
  assert.equal(result.decision, 'do_not_expand');
});

test('偶数配对任务取两项中位数平均，满足阈值才可进入下个试点', () => {
  const rows = [
    row('a', 'baseline', 10), row('a', 'slot', 9),
    row('b', 'baseline', 10), row('b', 'slot', 5),
    row('c', 'baseline', 10), row('c', 'slot', 5),
    row('d', 'baseline', 10), row('d', 'slot', 1),
  ];
  assert.equal(summarize(rows, 0, 0).medianReduction, 0.5);
  assert.equal(summarize(rows, 0, 0).decision, 'eligible_for_next_pilot');
  assert.equal(summarize(paired(['a', 'b']), 0, 0).decision, 'do_not_expand');
});

test('缺配对、质量未通过、安全事件阻止扩展', () => {
  assert.throws(() => summarize([row('a', 'slot', 10)], 0, 0), /unpaired/);
  assert.equal(summarize(paired().map(r => r.task_id === 'a' && r.workflow === 'slot'
    ? { ...r, quality_pass: false } : r), 0, 0).decision, 'do_not_expand');
  for (const flag of ['unauthorized_publish', 'fact_error', 'severe_page_error']) {
    const rows = paired();
    rows[1] = { ...rows[1], [flag]: true };
    assert.equal(summarize(rows, 0, 0).decision, 'do_not_expand', flag);
  }
});

test('空数据没有试点成果', () => {
  assert.deepEqual(summarize([], 0, 0), {
    pairedTasks: 0, medianReduction: 0, netSavedMinutes: 0,
    totalWaitMinutes: 0, decision: 'do_not_expand',
  });
  assert.deepEqual(parsePilotCsv(`${CSV_HEADER}\n`), []);
});

test('API拒绝缺值、非法值、混合试点与重复attempt', () => {
  const valid = paired();
  const invalid = [
    [{ ...valid[0], pilot_id: '' }, /invalid_id/],
    [{ ...valid[0], task_id: 'a,b' }, /invalid_id/],
    [{ ...valid[0], attempt: 0 }, /invalid_attempt/],
    [{ ...valid[0], wait_min: undefined }, /invalid_minutes/],
    [{ ...valid[0], creation_min: '' }, /invalid_minutes/],
    [{ ...valid[0], quality_pass: 'false' }, /invalid_boolean/],
    [{ ...valid[0], fact_error: undefined }, /invalid_boolean/],
  ];
  for (const [bad, error] of invalid) {
    assert.throws(() => summarize([bad, ...valid.slice(1)], 0, 0), error);
  }
  assert.throws(() => summarize([...valid, row('z', 'baseline', 1, 1, { pilot_id: 'other' })], 0, 0), /multiple_pilots/);
  assert.throws(() => summarize([...valid, row('a', 'slot', 1)], 0, 0), /duplicate_attempt/);
  assert.throws(() => summarize([...valid, row('a', 'slot', 1, 2, { quality_pass: false })], 0, 0), /invalid_quality_sequence/);
  assert.throws(() => summarize(valid, -1, 0), /invalid_cost/);
});

test('CSV固定表头与字段数，拒绝引号、缺值和非法布尔', () => {
  const content = csv(paired());
  assert.equal(summarize(parsePilotCsv(content), 0, 0).pairedTasks, 3);
  assert.throws(() => parsePilotCsv(content.replace('synthetic-pilot', '"synthetic-pilot"')), /invalid_csv/);
  assert.throws(() => parsePilotCsv(content.replace('synthetic-pilot', 'synthetic,pilot')), /invalid_csv/);
  assert.throws(() => parsePilotCsv(content.replace(',true,false,false,false', ',yes,false,false,false')), /invalid_boolean/);
  assert.throws(() => parsePilotCsv(content.replace(',10,0,0,0,0,0,', ',10,0,0,0,0,,') ), /invalid_minutes/);
  assert.throws(() => parsePilotCsv(`wrong\n${content}`), /invalid_csv_header/);
  assert.throws(() => parsePilotCsv(csv([...paired(), row('a', 'slot', 1)])), /duplicate_attempt/);
  assert.throws(() => parsePilotCsv(csv([...paired(), row('z', 'baseline', 1, 1, { pilot_id: 'other' })])), /multiple_pilots/);
});

test('CLI读取合成CSV并报告机器等待，空表不声称成功', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-slot-pilot-'));
  try {
    const path = join(dir, 'synthetic.csv');
    const rows = paired().map(r => r.task_id === 'a' ? { ...r, wait_min: 7 } : r);
    writeFileSync(path, csv(rows));
    const result = spawnSync(process.execPath, [new URL('./analyze-pilot.mjs', import.meta.url).pathname, path, '0', '0'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).totalWaitMinutes, 14);
    writeFileSync(path, `${CSV_HEADER}\n`);
    const empty = spawnSync(process.execPath, [new URL('./analyze-pilot.mjs', import.meta.url).pathname, path, '0', '0'], { encoding: 'utf8' });
    assert.equal(empty.status, 0, empty.stderr);
    assert.equal(JSON.parse(empty.stdout).decision, 'do_not_expand');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
