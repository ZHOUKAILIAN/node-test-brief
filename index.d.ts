export interface CancellationSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}
export interface RunOptions {
  cwd?: string;
  files: string[];
  nodeArgs?: string[];
  timeoutMs?: number;
  signal?: CancellationSignal;
  snapshot?: false | 'git';
}
export interface Snapshot { available: boolean; value: string }
export interface TestReport {
  tests: number;
  passed: number;
  failed: number;
  cancelled: number;
  skipped: number;
  todo: number;
  suites: number;
  success: boolean;
  durationMs: number;
  failures: Array<Record<string, unknown>>;
  diagnostics: Array<Record<string, unknown>>;
}
export interface RunResult {
  ok: boolean;
  exitCode: number;
  report?: TestReport;
  summary: string;
  logsDir: string;
  command: { executable: string; args: string[]; files: string[] };
  before: Snapshot;
  ended: Snapshot;
}
export function runTests(options: RunOptions): Promise<RunResult>;
