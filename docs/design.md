# 技术设计

## 当前状态与来源

实现来源为 `ZHOUKAILIAN/my-pi-extension` PR #26 的 Node 测试精简脚本。首版代码 `b37e566573743243458bba033fca2b127df1cee6` 已通过独立代码评审及 26 项核心/API/CLI 回归；[Linux/macOS CI](https://github.com/ZHOUKAILIAN/node-test-brief/actions/runs/39083976910) 在 Node 24.15.0 实际通过。仓库外 npm pack 与固定 GitHub archive 均已真实安装验证 ESM API、CLI、reporter 和类型声明；消费项目冷安装核对了 lockfile 来源、非 symlink 安装及源码哈希。

效果对照使用原项目固定基准 `76f9ce50f9e0b305ffd0f6946018edb1dcc29a19` 的同一工作区、Node、依赖及 60 文件清单：原脚本与已安装固定 archive 的 SDK 均为 866/866，通过/失败/跳过/取消/TODO/suite 计数及退出码一致。SDK 源码哈希与工作区快照前后一致。此结论是实际对照，不是仅凭抽取前绿灯继承；不表示执行耗时下降，也不替代消费适配层自身的集成验收。

产品与 API 契约的唯一入口为 [README](../README.md)。本文件拥有模块实现、验证策略和已知边界；不复制 API 参数定义。

## 执行链路

```text
CLI / 项目适配层                 JavaScript 调用方
  解析参数、接进程信号                 |
             └────── runTests(options) ─┘
                      |
            明确文件 / glob 展开、受控 Node 参数
                      |
            同一个 Node 子进程 + reporter
             ├─ JSONL 事件与原始输出落盘
             └─ 退出 / AbortSignal / timeout / I/O 错误
                      |
            校验终态、文件级与全局统计
                      |
              可选 Git 快照检查
                      |
            返回结构化结果和有界 summary
```

## 模块责任

| 模块 | 责任 |
| --- | --- |
| `src/runner.mjs` | 复用报告校验与日志/进程清理，补齐非 wrapper 测试的 start/completion/outcome 多重配对和意外文件检查；实现无终端/进程监听副作用的 `runTests`；Git 检查仅显式启用。 |
| `src/command.mjs` | 通用文件路径/glob 展开与 Node 命令组装；不识别任何项目固定脚本、目录或生命周期 hook。 |
| `src/reporter.mjs` | Node 自定义异步 reporter，原始测试 stdout/stderr 落盘与安全 JSONL 事件输出。 |
| `src/cli.mjs`、`bin/node-test-brief.mjs` | CLI 参数、摘要输出、退出码、信号控制；嵌入 CLI 的项目可传自己的完整文件范围。 |
| `index.d.ts` | 公开 SDK / CLI 的 TypeScript 接口。 |
| `test/` | 原核心回归迁移，以及 SDK、CLI、安装包和项目适配所需的新回归。 |

只使用 Node 标准库，包不依赖 Pi、测试框架插件或某个项目的工作区。reporter 作为实际包文件分发，以 import.meta URL 定位，不能依赖源码仓库相对位置或安装时构建。

## 取消、错误和日志

SDK 使用 AbortSignal，不安装 SIGINT/SIGTERM 监听器。CLI 自己注册并在结束时移除监听器，以 SIGINT/SIGTERM 作为取消原因。已取消的 signal 不启动测试；后续取消只清理该调用的子进程组，不误伤并发调用。

复用原有真实退出码、超时 124、SIGINT 130、SIGTERM 143、启动与日志错误处理。日志故障使结果失败并等待活跃进程组清理。SDK 返回的 summary 必须与 CLI 真正输出相同地有界，不能只裁剪 stdout 而向 API 返回无限全文。启动、流日志与最终元数据写故障置于优先区域，测试失败详情再按最终后缀的真实长度截断；次要元数据故障不能覆盖超时/取消的规定退出码。

输出日志目录为每次运行独立临时目录，目录 0700、文件 0600。原始文本不裁剪；非 JSON 值的归一化有显式标记。日志不会被自动上传或进入 Git。POSIX 验证进程组清理；Windows 仅直接子进程行为，不声称完整后代清理。

## 项目接入

`my-pi-extension` 的测试文件发现与 npm hook 策略仍由项目的 `scripts/test-suite.mjs` 拥有。其 `scripts/test-agent.mjs` 成为薄适配：取得完整文件范围，调用 SDK CLI 并显式设置 `snapshot: 'git'`。不再保留本地 reporter、解析器、日志和取消实现。

SDK 核心测试迁移到 SDK 仓库；消费项目保留必要的安装/调用、文件范围、附加文件、hook 拒绝及严格快照集成验证。原 `npm test` 保留完整输出。

消费依赖为本仓库不可变 commit 的 GitHub archive URL，并保留 lockfile；不使用相对/绝对本机路径，不发布 npm。新 SDK 仓库实现与消费项目接入各自保持独立分支/PR，不合并或回退原来的异步压缩工作区。

## 验证与效果对照

1. 从原仓库同一基准保留未修改的对照工作区。比较时测试文件、Node、依赖及工作区一致，唯一变量是外层使用原脚本还是 SDK。
2. 原逻辑与 SDK 对该同一份完整测试清单各运行一次，比较通过/失败/跳过/取消/TODO/suite 计数及实际退出状态；工作区/日志路径/时间允许自然不同。核对原始输出完整性及摘要预算。
3. 小型真实 Node fixture 对照通过、断言失败、skip/TODO、取消/hook、timeout、I/O 故障、未知/损坏报告和前后快照变化，不用只看全量绿灯代替边界覆盖。
4. SDK 不依赖 Git 的默认成功、Git 严格模式失败、SDK 不打印/不改全局监听器、并发调用独立取消都要验证。
5. `npm pack` 到私有临时目录，在仓库外安装后测试 ESM API、CLI/bin、reporter 资产和类型声明；检查包内容无凭据、机器路径、运行日志或 session。
6. 在消费项目以固定 SHA 的 GitHub archive URL 和 lockfile 实际安装；核对 package.json / lockfile 的 resolved 来源、安装目录非本地源码 symlink、安装内容与该 commit 一致，从该安装物验证 API、CLI、reporter 与类型声明。接入后的完整测试与 typecheck 单独运行；测试总数变动必须说明是核心测试移至 SDK、集成测试新增，不能把减少数当成收益。
7. 原解析器已发现的漂移：多余 start 而无完成仍可能被接受。SDK 必须新增缺完成、缺开始及意外文件事件的真实报告损坏回归；先确认原报告可解析，再构造反例，不能把继承旧代码等同完整性已验证。
8. 实现后进行独立代码评审。真实比较完成前，不声称 SDK 与原逻辑效果相同或已跨平台验证。

### 输出量测量口径

[README 实测案例](../README.md#实测收益我们自己的项目)使用上述原项目基准与 SDK `b37e566573743243458bba033fca2b127df1cee6` 在 Node 24.15.0 下保存的同一次 866 项全通过记录，不混用较早的 831 项案例，也不把接入后测试迁移导致的计数变化当收益。

- 详细展示：把保存的归一化 JSONL 事件流送入 `node:test/reporters` 的 `spec()`，使用原工作目录、关闭颜色，保存完整渲染结果；这是展示回放，不是再次执行测试或另一次 `npm test` 的终端抓取。
- 摘要：使用该次 SDK 实际返回的 `result.summary`，不再次改写或模型总结。两边均排除 npm 启动行。
- UTF-8 字节数按实际内容计量；行数按换行分隔，末尾换行不额外算空行。缩减比例为 `1 - 摘要值 / 详细展示值`，以百分数保留两位小数。
- 证据身份：事件报告 SHA-256 为 `b431b0c12d79ddad4a752cadaac3998fd6dfa3602752296762c06231cedb1e9a`；实际摘要 SHA-256 为 `c87c07576888d42fbdd8939c194a52fecf98cf0eeeb5d8a4a4f1e2244dadd7b4`。原始报告、回放文本与运行日志留在本地，不把机器路径或日志全文提交到仓库。
- 该测量只证明这轮全通过案例的回传文本量降低；不据此推算 tokenizer 无关的 token 节省、费用、运行时间或返工率。失败、取消等场景的输出量需要单独测量。
