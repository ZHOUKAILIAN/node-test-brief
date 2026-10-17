# node-test-brief

面向 AI Coding Agent 的 Node 原生测试执行与结果精简 SDK。测试完整执行、原始输出本地保存，只把有界摘要交给 Agent；不调用模型总结日志。

当前为 SDK 抽取设计，尚未完成实现或发布 npm。实现进度与验证边界由 [技术设计](docs/design.md) 维护。

## 使用契约

- 仅支持 Node 原生 `node:test`，不解析任意 `npm test` 命令，也不假定兼容 Jest/Vitest/Mocha。
- CLI 与 JavaScript SDK 共用一份执行、报告校验和日志实现；不依赖 Pi 或某个业务仓库。
- 调用方明确提供测试文件；CLI 支持文件路径/文件模式。SDK 不内置 `packages/*/test` 等项目目录规则，不读取或要求固定的 npm script。
- 子进程默认使用 `process.execPath`，即调用方当前使用的 Node。首版验证 Node 24.15.0，声明支持范围为 `>=24.15.0 <25`；POSIX 进程组清理为首版验证范围。
- 完整测试 stdout/stderr、runner stdout/stderr、结构化事件和精确命令写入独立本地日志目录；目录 `0700`，文件 `0600`。结构化错误值可以安全归一化并显式标注深度/集合截断，原始文本输出不裁剪。
- 真实非零退出、取消、超时、日志写故障、报告缺失/损坏、零实际测试均不能变成成功。报告同时校验测试终态、文件级 wrapper/汇总与全局汇总。
- 默认格式化摘要约束在 8,000 字符内，关键状态和日志路径优先；失败详情有界。此预算限制回传文本，不减少测试范围。

## JavaScript API

```js
import { runTests } from 'node-test-brief';

const controller = new AbortController();
const result = await runTests({
  cwd: process.cwd(),
  files: ['test/example.test.js'],
  timeoutMs: 600_000,
  signal: controller.signal,
});

console.log(result.summary);
process.exitCode = result.exitCode;
```

`runTests()` 不打印到终端、不安装进程级信号监听器，返回 Promise。调用者通过自己的 AbortSignal 取消，多个调用可以独立运行。参数错误在启动子进程之前抛出；已启动的运行以结果报告成功/失败，并完成必要清理。

主要选项：`cwd`、`files`、`nodeArgs`、`timeoutMs`、`signal`、`snapshot`。`files` 支持相对路径、绝对路径和文件模式；无匹配文件不是成功。`nodeArgs` 放在测试文件之前，不允许覆盖 SDK 管理的 reporter、destination、测试模式或启用 watch。需要 TypeScript 的项目自行传入 Node 参数，例如 `['--experimental-strip-types']`。

主要结果：`ok`、`exitCode`、`report`（适用时的测试/通过/失败/跳过/取消/TODO/suite 计数）、`summary`、`logsDir`、`command`、`before`、`ended`。结果摘要由程序生成，不由模型生成。

Git 不是普通消费者的前提。`snapshot` 默认关闭；指定 `snapshot: 'git'` 后，Git 快照必须可用且测试前后一致才能成功。`my-pi-extension` 消费适配层必须显式启用该严格策略，不能因抽包降低原保证。

## CLI

包内提供 `node-test-brief` 命令和 `node-test-brief/cli` 模块。CLI 负责帮助、参数解析、输出摘要和 SIGINT/SIGTERM 到 AbortSignal 的转接；这些进程级副作用不进入 SDK API。

```text
node-test-brief --timeout 10m test/*.test.js
node-test-brief --snapshot git --node-arg=--experimental-strip-types test/*.test.ts
```

项目适配可以调用 `runCli({ argv, cwd, files, nodeArgs, snapshot })`，让 CLI 将额外文件追加到项目已选择的完整范围；不能静默吞掉未知参数或 npm 生命周期 hook。

## 安装与源码使用

首版通过本仓库的固定 Git commit archive 或 `npm pack` 产物安装；尚未发布 npm，不使用未存在的 registry 安装命令。消费者锁定不可变 commit 与 lockfile，不用机器专属绝对路径作为最终依赖。

源码验证命令和打包验证见 [技术设计](docs/design.md)。包以原生 ESM、CLI 和类型声明分发，不依赖 prepare/postinstall 下载或构建。

## 许可

源码仓库公开；当前尚未选择开源许可证，包元数据使用 `UNLICENSED`。没有代替作者作出额外授权，也没有发布 npm。
