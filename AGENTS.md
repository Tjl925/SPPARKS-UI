# SPPARKS UI — 项目 Agent 工作规则

本文件是仓库内最高层级的长期 Agent 工作规则；适用于整个仓库。用户明确指令以及系统/开发者规则优先。本文件不授予额外外部操作权限。

## 目标与不可改变的原则

在保持专业性的前提下，降低使用门槛，让非 SPPARKS 专家也能快速理解输入项并启动仿真。面向材料/物理专家展示，由讲解者操作；工作流为 **物理定义 → 确认平台 → 运行 → 分析**。

- 真实结果与科学语义优先：不伪造演化帧、进度、硬件能力、单位或模型参数。
- 优先前端易用性、可解释性与展示完整性；并行效率、集群和大规模优化后置。
- 三案例已实现不代表多案例已验收；自动测试通过不等于用户验收。只有用户明确确认才能勾选用户验收。
- Potts 状态不等于独立晶粒；Ising 是原示例的三维扩展；薄膜是真二维截面。模型时间、温度和能量不能直接标成秒、K、J。
- 老师的铁电模型尚未提供；不虚构接口实现、极化数据或原子势。新增模型需真实输入与可验证输出。

## 技术栈与环境

- `ui/`：原生 HTML/CSS/JavaScript ES modules，Three.js **0.180.0**，无前端构建器或 React。
- Python **3.10+** 标准库 HTTP 服务；Node.js 用于依赖和 JS 测试，pnpm 锁定依赖。
- 已验证开发环境：Windows PowerShell，WSL `Ubuntu-24.04`，上游 `spparks-08Oct25`，串行 `src/spk_serial`。
- 本机曾验证的 Python 为 `D:\Miniforge3\python.exe`；这是本机路径，不能假设新机器也存在。启动与命令见 `ui/README.md`。
- 服务只监听 `127.0.0.1:8765`；引擎通过 `SPPARKS_WSL_DISTRO`、`SPPARKS_BINARY` 配置。运行前检查端口/进程，不盲目重复启动或杀进程。

## 开发、兼容性与验证

- 最小必要修改；先看实际入口和调用链，禁止为局部功能顺手重写框架或修改无关上游求解器。未知行为先查源码/测试，不凭名称猜物理含义。
- JS 保持 ES module；Python 保持可独立测试的函数和明确异常处理。中文界面文案、UTF-8 文件；说明“为什么”而非重复代码。新模块职责明确，不持续扩大 `app.js` 的职责。
- 模型描述以 `models.py`（Potts 基础为 `model.json`）驱动；前端校验便于理解，后端 allowlist/范围校验必须保留。
- 保持 `schemaVersion=1`、固定格点 ID/坐标/时间序列契约；保持旧 Potts `/api/demo` 与裸参数 POST 兼容。变更契约需先记录迁移策略。
- 保持三案例切换、导入导出、回放、剖切、拾取、同步视角对比和展示模式。回放暂停不暂停求解；计算期间旧结果必须明确标注。
- 不削弱本机监听、Origin 检查、静态文件 allowlist、输入和导入大小限制。不执行导入 JSON 中的代码；不把外来文本直接作为可信 HTML。
- 根据改动选验证：数据/运行改动测 Python；结果/引导逻辑测 Node；UI 改动实际浏览器检查桌面与窄屏、关键操作和错误恢复。计算接入改动用真实小算例验证，不能只用模拟数据。
- 从 `ui/` 执行：`python -B -m unittest discover -s tests -v`、`node --test tests/*.test.mjs`；语法检查 `node --check app.js` 等。`pnpm test` 当前只覆盖 Python，不是完整测试。
- `python -B tests/smoke_api.py` 依赖已启动的服务及可用引擎，会实际运行三个案例。不要干扰用户正在运行的任务。只改文档通常无需跑仿真。
- 记录验证范围和限制；旧验证不冒充本轮执行。测试通过后，不无理由重复扩大测试范围。

## Git 与文件原则

- 开始前检查 `git status`、必要 diff、近期 log；未提交修改必须保留并分辨来源。禁止盲目 reset/clean、覆盖用户修改、force push 或改写历史。
- 发布和外部操作按用户实际授权执行；上下文维护本身不意味着获得发布授权。新建分支默认 `codex/` 前缀。
- 不提交密码、Token、`.env`、依赖、编译产物、`ui/runs/`、临时日志及本机助手配置。历史随包案例和 `ui/demo/` 是必要可追溯资料，不作为垃圾清理。
- 用户要求删除的 `docs/COMMIT_MESSAGE.txt` 已删除；不要重新创建。提交说明放 Git commit 信息。
- Windows 文件操作使用明确路径；后台服务隐藏启动；停止服务先核对进程身份。不得照抄状态文件中的过时 PID。

## Persistent Project Memory

以下四个文件属于本项目的 **Persistent Project Memory**：

| 文件 | 职责 |
|---|---|
| `docs/PLAN.md` | 未来路线：Phase → Task，范围、优先级和 Exit Criteria；滚动规划 |
| `docs/PROJECT_STATE.md` | 当前状态与恢复入口：现实能力、验证、阻塞、当前任务、下一步 |
| `docs/DECISIONS.md` | 重要选择与原因、已否决/失败路线、重新考虑条件 |
| `docs/ARCHITECTURE.md` | 当前代码实际结构、接口、数据流和配置 |

补充资料：`ui/VERIFICATION.md` 保存验证与验收证据；`docs/superpowers/specs/` 保存历史设计背景，不自动代表实际实现；README 是使用入口。旧版 `docs/PROJECT_PLAN.md` 已按用户要求删除，历史可从 Git 查阅，不要重建或维护第二套路线图。

### 信息可信度

1. 实际运行/测试结果（检查版本、时间和覆盖范围）
2. 当前实际代码
3. Git status / diff / log
4. PROJECT_STATE
5. ARCHITECTURE
6. DECISIONS
7. PLAN
8. 旧聊天描述

冲突时先验证代码和 Git，以实际实现和可验证结果为准，再修正文档；不为迁就旧文档而假定代码错误。

### 自动维护规则

1. 不因普通对话、小修改或未验证调试中间态更新状态文档。**对话轮次不是持久化单位**；默认单位是完成并验证的 **meaningful Task / checkpoint**。
2. Task 完成后，仅更新受影响文件：现实状态改变→STATE；计划/优先级/范围改变→PLAN；重要技术决策→DECISIONS；实际架构改变→ARCHITECTURE。
3. 每个 Phase / Milestone 完成时，必须执行完整 **Context Reconciliation**：核对实际代码与验证、Git 状态、PLAN、STATE、DECISIONS、ARCHITECTURE，修正文档间和文档与代码间的漂移。明确实现、验证、验收、提交/推送各自状态。
4. Task 未完成但出现 handoff boundary（结束较长开发、切换会话、稳定中间成果、重大路线变化、重要新问题），允许提前更新 STATE，明确未完成项和已验证范围；不得把它写为完成。
5. STATE 不是聊天日志或全量历史：只留恢复工作必需信息，及时替换过时状态。DECISIONS 只记未来易重犯的问题，区分“考虑后否决”和“实际试验失败”。
6. 不复制凭据、冗长日志或不稳定 PID；测试证据用路径和摘要链接。
7. 自动修改任一上下文文件后，**最终回复必须说明更新了哪些文件、为什么更新**。Phase 收尾另说明 Phase 是否完成及下一阶段。

## 新会话恢复流程

1. 阅读 `AGENTS.md`。
2. 阅读 `docs/PROJECT_STATE.md`。
3. 阅读 `docs/PLAN.md`。
4. 按当前任务阅读 `docs/DECISIONS.md`。
5. 按当前任务阅读 `docs/ARCHITECTURE.md`。
6. 检查 `git status`。
7. 检查必要的 `git diff`（含相关未跟踪文件；diff 不会自动展示它们）。
8. 查看近期 `git log`。
9. 检查当前任务涉及的实际代码。
10. 必要时运行针对性验证命令。
11. 若文档和代码不一致，先验证现实，再修正文档。
12. 再继续用户授权的开发；“下一步计划”本身不等于已经授权实现所有远期任务。
