import type { RunOptions } from './index.js';
export interface CliOptions {
  argv?: string[];
  cwd?: string;
  files?: string[];
  nodeArgs?: string[];
  snapshot?: RunOptions['snapshot'];
  output?: { write(text: string): unknown };
  errorOutput?: { write(text: string): unknown };
}
export function parseDuration(value: string): number;
export function runCli(options?: CliOptions): Promise<number>;
