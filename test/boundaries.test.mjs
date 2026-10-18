import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTests } from '../src/index.mjs';

async function fixture(source) {
  const cwd = await mkdtemp(join(tmpdir(), 'brief-boundary-'));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(join(cwd, 'example.test.js'), source);
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}

test('filter/only/shard arguments cannot turn a partial suite into a successful full result', async () => {
  const f = await fixture("import test from 'node:test';test('chosen',()=>{});test('must also execute',()=>{});");
  try {
    const complete = await runTests({ cwd: f.cwd, files: ['example.test.js'] });
    assert.equal(complete.ok, true);assert.equal(complete.report.tests, 2);
    for (const [flag, value] of [['--test-name-pattern','chosen'],['--test-skip-pattern','must'],['--test-shard','1/2'],['--test-rerun-failures','state.json'],['--test-only',undefined],['--test-force-exit',undefined]]) {
      const forms = value === undefined ? [[flag],[flag+'=true']] : [[flag,value],[flag+'='+value]];
      for (const nodeArgs of forms) await assert.rejects(runTests({ cwd: f.cwd, files:['example.test.js'], nodeArgs }), /managed or unsupported/);
    }
  } finally { await f.cleanup(); }
});

test('many long failures and long log paths remain within the final 8000-character budget', async () => {
  const f = await fixture(`import test from 'node:test';for(let i=0;i<12;i++)test('failure '+i,()=>{throw new Error('BOUNDARY_FULL_MARKER '+i+'x'.repeat(12000));});`);
  const parent = await mkdtemp(join(tmpdir(),'brief-long-'));
  const logs = join(parent,'a'.repeat(100),'b'.repeat(100),'c'.repeat(100));
  try {
    await mkdir(logs,{recursive:true});
    const result = await runTests({ cwd:f.cwd, files:['example.test.js'], logDirectory:logs });
    assert.equal(result.ok,false);assert.equal(result.report.failed,12);
    assert.ok(result.summary.length<=8000,`actual=${result.summary.length}`);
    assert.match(result.summary,/summary budget reached/);
    assert.match(result.summary,/tests=12/);assert.ok(result.summary.includes(logs));
    assert.match(await readFile(join(logs,'test-output.events.jsonl'),'utf8'),/BOUNDARY_FULL_MARKER 11/);
  } finally { await f.cleanup();await rm(parent,{recursive:true,force:true}); }
});
