import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTests } from '../src/runner.mjs';

async function fixture(source) {
  const cwd=await mkdtemp(join(tmpdir(),'brief-io-'));
  await writeFile(join(cwd,'package.json'),JSON.stringify({type:'module'}));
  await writeFile(join(cwd,'case.test.js'),source);
  return {cwd,cleanup:()=>rm(cwd,{recursive:true,force:true})};
}

test('force-exit and NODE_OPTIONS cannot bypass cleanup or completeness',async()=>{
  const f=await fixture("import{writeFileSync}from'node:fs';writeFileSync('STARTED','bad');import test from'node:test';test('pass',()=>{});");
  try{
    await assert.rejects(runTests({cwd:f.cwd,files:['case.test.js'],nodeArgs:['--test-force-exit']}),/managed or unsupported/);
    await assert.rejects(readFile(join(f.cwd,'STARTED')),{code:'ENOENT'});
    await assert.rejects(runTests({cwd:f.cwd,files:['case.test.js'],env:{NODE_OPTIONS:'--test-only'}}),/NODE_OPTIONS/);
    await assert.rejects(readFile(join(f.cwd,'STARTED')),{code:'ENOENT'});
  }finally{await f.cleanup();}
});

test('final metadata write failure resolves to a failed result with diagnostics and log location',async()=>{
  const logs=await mkdtemp(join(tmpdir(),'brief-meta-'));
  const f=await fixture(`import test from'node:test';import{rmSync,mkdirSync}from'node:fs';test('metadata fails after test start',()=>{rmSync(${JSON.stringify(join(logs,'command.json'))});mkdirSync(${JSON.stringify(join(logs,'command.json'))});});`);
  try{
    const result=await runTests({cwd:f.cwd,files:['case.test.js'],logDirectory:logs});
    assert.equal(result.ok,false);assert.notEqual(result.exitCode,0);assert.equal(result.report.passed,1);
    assert.equal(result.logsDir,logs);assert.match(result.summary,/Final metadata log write failure/);
    assert.match(await readFile(join(logs,'test-output.events.jsonl'),'utf8'),/test:summary/);
  }finally{await f.cleanup();await rm(logs,{recursive:true,force:true});}
});

test('normal successful completion also cleans up unref child processes in its own group',async()=>{
  const pidFile=join(tmpdir(),`brief-leftover-${process.pid}-${Date.now()}`);
  const f=await fixture(`import test from'node:test';import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';test('unref child',()=>{const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(c.pid));c.unref();});`);
  let pid;
  try{
    const result=await runTests({cwd:f.cwd,files:['case.test.js']});
    pid=Number(await readFile(pidFile,'utf8'));assert.equal(result.ok,true);
    assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
  }finally{if(pid){try{process.kill(pid,'SIGKILL');}catch{}}await rm(pidFile,{force:true});await f.cleanup();}
});
