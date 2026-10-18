import { globSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

export function buildNodeTestCommand({ cwd, files, nodeArgs = [], reporter, reporterDestination }) {
  if (!Array.isArray(files) || files.length === 0 || files.some((file) => typeof file !== 'string' || !file)) {
    throw new TypeError('files must be a nonempty array of test file paths or patterns');
  }
  if (!Array.isArray(nodeArgs) || nodeArgs.some((arg) => typeof arg !== 'string' || !arg)) {
    throw new TypeError('nodeArgs must be an array of Node argument strings');
  }
  for (const arg of nodeArgs) {
    const safeSwitch = ['--experimental-strip-types', '--enable-source-maps'].includes(arg);
    const concurrency = arg.match(/^--test-concurrency=([1-9]\d*)$/);
    const heap = arg.match(/^--max-old-space-size=([1-9]\d*)$/);
    if (!safeSwitch && !concurrency && !heap) throw new TypeError(`Node argument is managed or unsupported: ${arg}`);
    const numeric = concurrency?.[1] ?? heap?.[1];
    if (numeric && (!Number.isSafeInteger(Number(numeric)) || Number(numeric) > 2147483647)) throw new TypeError(`Node argument is out of range: ${arg}`);
  }
  const selected = new Set();
  for (const input of files) {
    const literal = resolve(cwd, input);
    let matches;
    try { matches = statSync(literal).isFile() ? [literal] : []; }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
    matches ??= globSync(input, { cwd }).sort().map((file) => resolve(cwd, file)).filter((file) => statSync(file).isFile());
    if (!matches.length) throw new TypeError(`No test files matched: ${input}`);
    for (const file of matches) selected.add(file);
  }
  const expandedFiles = [...selected];
  const args = [...nodeArgs];
  if (reporter) args.push(`--test-reporter=${reporter}`);
  if (reporterDestination) args.push(`--test-reporter-destination=${reporterDestination}`);
  args.push('--test', ...expandedFiles.map((file) => {
    const rel = relative(cwd, file);
    return rel.startsWith('-') ? file : rel;
  }));
  return { executable: process.execPath, args, files: expandedFiles };
}
