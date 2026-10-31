import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './runtime.mjs';

const run = promisify(execFile), reports = [];
for (const [name, args, cwd] of [
  ['m6-model', ['--test', 'tests/*.test.mjs'], root],
  ['published-base', ['--test', 'tests/*.test.mjs', 'arena/tests/*.test.mjs'], path.dirname(root)],
  ['protected-files', ['scripts/check-integrity.mjs'], path.dirname(root)]
]) {
  let result, ok = true;
  try { result = await run(process.execPath, args, { cwd, maxBuffer: 10 * 1024 * 1024, windowsHide: true }); }
  catch (error) { result = error; ok = false; process.exitCode = 1; }
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  await mkdir(path.join(root, 'evidence'), { recursive: true }); await writeFile(path.join(root, 'evidence', `${name}.txt`), output);
  const tests = /(?:#|ℹ) tests (\d+)/.exec(output), passed = /(?:#|ℹ) pass (\d+)/.exec(output), failed = /(?:#|ℹ) fail (\d+)/.exec(output);
  reports.push({ name, ok, ...(tests ? { tests: +tests[1], passed: +passed[1], failed: +failed[1] } : {}) });
}
const report = { stage: 'M6.1', checkedAt: new Date().toISOString(), ok: reports.every(r => r.ok), reports };
await writeFile(path.join(root, 'evidence/regression.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
