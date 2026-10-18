import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runTests } from '../src/index.mjs';
import { runCli } from '../src/cli.mjs';
import { buildNodeTestCommand } from '../src/command.mjs';

const bin = fileURLToPath(new URL('../bin/node-test-brief.mjs', import.meta.url));
const api = new URL('../src/index.mjs', import.meta.url).href;
async function fixture(source, file = 'tests with space/测试.test.js') {
  const cwd = await mkdtemp(join(tmpdir(), 'brief sdk '));
  await mkdir(join(cwd, 'tests with space'));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(join(cwd, file), source);
  return { cwd, file, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}
function exec(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('SDK works without Git or project scripts and has no stdout or global signal side effects', async () => {
  const f = await fixture("import test from 'node:test';test('generic pass',()=>{console.log('FULL_OUTPUT_STAYS_ON_DISK')});");
  try {
    const code = `import{runTests}from${JSON.stringify(api)};const before=[process.listenerCount('SIGINT'),process.listenerCount('SIGTERM')];let printed='';const write=process.stdout.write;process.stdout.write=(s)=>{printed+=s;return true};const r=await runTests({cwd:process.cwd(),files:['tests with space/*.test.js']});process.stdout.write=write;console.log(JSON.stringify({ok:r.ok,exit:r.exitCode,printed,before,after:[process.listenerCount('SIGINT'),process.listenerCount('SIGTERM')],summary:r.summary,bound:r.before}));`;
    const x = await exec(['--input-type=module', '-e', code], f.cwd);
    assert.equal(x.code, 0, x.stderr);
    const data = JSON.parse(x.stdout);assert.equal(data.ok, true);assert.equal(data.exit, 0);
    assert.equal(data.printed, '');assert.deepEqual(data.before, data.after);
    assert.equal(data.bound.value, 'disabled');assert.doesNotMatch(data.summary, /FULL_OUTPUT_STAYS_ON_DISK/);
    const strict = await runTests({ cwd: f.cwd, files: [f.file], snapshot: 'git' });
    assert.equal(strict.ok, false);assert.notEqual(strict.exitCode, 0);assert.match(strict.summary, /UNAVAILABLE/);
  } finally { await f.cleanup(); }
});

test('pre-aborted SDK call never starts test code', async () => {
  const f = await fixture("import{writeFileSync}from'node:fs';writeFileSync('STARTED','bad');import test from 'node:test';test('pass',()=>{});");
  try {
    const c = new AbortController();c.abort();
    const r = await runTests({ cwd: f.cwd, files: [f.file], signal: c.signal });
    assert.equal(r.ok, false);assert.equal(r.exitCode, 130);
    await assert.rejects(readFile(join(f.cwd, 'STARTED')), { code: 'ENOENT' });
  } finally { await f.cleanup(); }
});

test('cancelling one concurrent SDK call does not affect another', async () => {
  const f = await fixture("import test from 'node:test';import{writeFileSync}from'node:fs';test('long',async()=>{writeFileSync('ready','1');await new Promise(r=>setTimeout(r,30000));});");
  const g = await fixture("import test from 'node:test';test('independent',()=>{});");
  try {
    const c = new AbortController();const before = process.listenerCount('SIGTERM');
    const one = runTests({ cwd: f.cwd, files: [f.file], signal: c.signal });
    const two = runTests({ cwd: g.cwd, files: [g.file] });
    const deadline = Date.now() + 10000;let ready = false;
    while (Date.now() < deadline) { try { await readFile(join(f.cwd,'ready'));ready=true;break; } catch { await new Promise(r=>setTimeout(r,25)); } }
    assert.equal(ready, true);c.abort('SIGTERM');
    const [a,b] = await Promise.all([one,two]);assert.equal(a.exitCode,143);assert.equal(a.ok,false);assert.equal(b.ok,true);
    assert.equal(process.listenerCount('SIGTERM'), before);
  } finally { await f.cleanup();await g.cleanup(); }
});

test('CLI invokes packaged-style reporter, preserves failure codes, and restores listeners', async () => {
  const f = await fixture("import test from 'node:test';test('CLI pass',()=>{});");
  try {
    const x = await exec([bin, 'tests with space/*.test.js'], f.cwd);
    assert.equal(x.code,0,x.stderr);assert.match(x.stdout,/PASS/);assert.match(x.stdout,/tests=1 pass=1/);
    await writeFile(join(f.cwd,f.file),"import test from 'node:test';test('CLI failure',()=>{throw new Error('CLI_EXPECTED_FAILURE')});");
    const bad = await exec([bin, f.file], f.cwd);assert.equal(bad.code,1);assert.match(bad.stdout,/CLI_EXPECTED_FAILURE/);
    let text='';const before=process.listenerCount('SIGTERM');
    const code = await runCli({argv:['--snapshot','off',f.file],cwd:f.cwd,snapshot:'git',errorOutput:{write(s){text+=s}},output:{write(){}}});
    assert.equal(code,2);assert.match(text,/requires Git/);assert.equal(process.listenerCount('SIGTERM'),before);
  } finally { await f.cleanup(); }
});

test('SDK rejects unmatched files, managed Node flags, and overflowing timeouts before spawn', async () => {
  const f = await fixture("import test from 'node:test';test('pass',()=>{});");
  try {
    assert.throws(()=>buildNodeTestCommand({cwd:f.cwd,files:['missing/*.js']}),/No test files/);
    assert.throws(()=>buildNodeTestCommand({cwd:f.cwd,files:[f.file],nodeArgs:['--test-reporter=tap']}),/managed/);
    await assert.rejects(runTests({cwd:f.cwd,files:[f.file],timeoutMs:2147483648}),/timeoutMs/);
    const command=buildNodeTestCommand({cwd:f.cwd,files:[f.file,join(f.cwd,f.file)]});assert.equal(command.files.length,1);
  } finally { await f.cleanup(); }
});
