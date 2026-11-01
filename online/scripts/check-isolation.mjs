import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { BASE_SHA } from '../src/protocol.mjs';
const repo = new URL('../../', import.meta.url);
const git = args => execFileSync('git', ['--no-optional-locks', ...args], { cwd: repo, windowsHide: true }).toString().trim();
assert.equal(git(['merge-base', 'HEAD', BASE_SHA]), BASE_SHA);
assert.equal(git(['branch', '--show-current']), 'm6-beta-integracion');
// Every existing canonical game module, including M5-D CPU and animations,
// must remain byte-for-byte identical. Only the HTML selectors are integrated.
const modules = git(['ls-tree', '-r', '--name-only', BASE_SHA, '--', 'src', 'arena/src']).split(/\r?\n/).filter(Boolean);
for (const file of modules) assert.deepEqual(await readFile(new URL(file, repo)), execFileSync('git', ['show', `${BASE_SHA}:${file}`], { cwd: repo, windowsHide: true }), file);
assert.equal(git(['rev-parse', 'main']), '2ece078f5b2563c35016ade18327e75daa4b2f55');
assert.equal(git(['rev-parse', 'desarrollo']), '96c8a470c1c31f3ad552e0998bcdd02e72484954');
assert.equal(git(['rev-parse', 'm6-salas-conexiones']), 'b1e39dcca2c0d1208d1fd05ac0eb46900cf119b1');
const staging = JSON.parse(await readFile(new URL('../wrangler.beta.jsonc', import.meta.url), 'utf8'));
assert.equal(staging.workers_dev, false); assert.equal(staging.preview_urls, false);
assert.equal(staging.vars.PUBLIC_CREATION, 'false'); assert.equal(staging.assets, undefined); assert.equal(staging.routes, undefined);
const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
assert.ok(files.every(file => !/online\/(?:node_modules|\.state|\.wrangler|\.experimental|evidence|\.env|\.dev\.vars)(?:\/|$)/.test(file)));
const result = { ok: true, baseSha: BASE_SHA, branch: 'm6-beta-integracion', canonicalModulesIdentical: modules.length,
  mainDesarrolloAndPilotBranchUnchanged: true, publicCreation: false };
await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
await writeFile(new URL('../evidence/beta-isolation.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
