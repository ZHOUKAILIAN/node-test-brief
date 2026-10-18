import { runTests } from './runner.mjs';

export function parseDuration(value) {
  const match = value?.match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) throw new TypeError(`Invalid timeout duration: ${value}`);
  const ms = Number(match[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[match[2] ?? 'ms'];
  if (!Number.isSafeInteger(ms) || ms < 1 || ms > 2147483647) throw new TypeError('Timeout must be between 1 and 2147483647ms');
  return ms;
}
const usage = 'Usage: node-test-brief [--timeout 10m] [--snapshot git|off] [--node-arg=<flag>] <test-file-or-pattern> ...\n';

export async function runCli({ argv = process.argv.slice(2), cwd = process.cwd(), files = [], nodeArgs = [], snapshot = false, output = process.stdout, errorOutput = process.stderr } = {}) {
  let onInterrupt;
  let onTerminate;
  try {
    let timeoutMs = 600000;
    const selected = [...files];
    const selectedArgs = [...nodeArgs];
    let pathsOnly = false;
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (pathsOnly) { selected.push(arg); continue; }
      if (arg === '--') { pathsOnly = true; continue; }
      if (arg === '--help' || arg === '-h') { output.write(usage); return 0; }
      if (arg === '--timeout') {
        if (!argv[i + 1]) throw new TypeError('Missing timeout value');
        timeoutMs = parseDuration(argv[++i]);
      } else if (arg === '--snapshot') {
        const mode = argv[++i];
        if (!['git', 'off'].includes(mode)) throw new TypeError('snapshot must be git or off');
        if (snapshot === 'git' && mode === 'off') throw new TypeError('Project requires Git snapshot validation');
        snapshot = mode === 'git' ? 'git' : false;
      } else if (arg.startsWith('--node-arg=')) {
        selectedArgs.push(arg.slice('--node-arg='.length));
      } else if (arg.startsWith('-')) throw new TypeError(`Unsupported option: ${arg}`);
      else selected.push(arg);
    }
    if (!selected.length) throw new TypeError('At least one test file or pattern is required');
    const controller = new AbortController();
    onInterrupt = () => controller.abort('SIGINT');
    onTerminate = () => controller.abort('SIGTERM');
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    const result = await runTests({ cwd, files: selected, nodeArgs: selectedArgs, snapshot, timeoutMs, signal: controller.signal });
    output.write(result.summary);
    return result.exitCode;
  } catch (error) {
    errorOutput.write(`${error.message}\n${usage}`);
    return 2;
  } finally {
    if (onInterrupt) process.removeListener('SIGINT', onInterrupt);
    if (onTerminate) process.removeListener('SIGTERM', onTerminate);
  }
}
