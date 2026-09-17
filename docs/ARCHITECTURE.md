# 当前实际架构

Last Updated: 2026-09-17。描述本次交付的专业工作台与已验收新手引导实现；未来设想见 PLAN。

## 总体结构

```text
浏览器：index.html + styles.css + workbench.css
  app.js ── guidance.js（引导、输入检查、恢复提示）
    ├── result-schema.js（导入/载入校验）
    └── viewer.js ── Three.js / OrbitControls
            │ fetch JSON / 轮询（非 WebSocket）
Python server.py（ThreadingHTTPServer，127.0.0.1）
    ├── models.py ← model.json（Potts 基础元数据）
    ├── platform_info.py（宿主机探测、日志尾部）
    ├── data_adapter.py（参数验证、脚本、dump/日志解析）
    ├── JOBS 字典 + LOCK（内存任务状态）
    └── 后台线程 → WSL → spk_serial
          → ui/runs/<jobId>/{input.in,console.log,log.spparks,result.dump,result.json}
```

无数据库、任务队列服务、前端构建流程、云服务或原子级材料参数编辑器。

## 模块与目录职责

| 位置 | 实际职责 |
|---|---|
| `spparks-08Oct25/` | 上游计算源码、文档、examples；不是 UI 的日常修改区 |
| `ui/index.html` | 静态页面、物理/平台/控制台/结果分区、表单与 Three.js import map |
| `ui/styles.css` / `ui/workbench.css` | 原有通用样式；后加载的工作台覆盖与新手引导样式 |
| `ui/app.js` | 页面状态、模型切换、表单、任务提交/轮询、回放、对比、导入导出 |
| `ui/guidance.js` | mountGuidance、validateDraft、explainError；DOM 引导/恢复提示与可单测规则 |
| `ui/viewer.js` | LatticeViewer；实例几何、状态配色、裁切/拾取、相机控制与 PNG 数据 |
| `ui/result-schema.js` | schemaVersion 1 固定格点数据验证 |
| `ui/models.py` / `ui/model.json` | 三模型 allowlist；参数范围、默认值、分组、帮助、物理解释/显示元数据 |
| `ui/data_adapter.py` | 按模型验证参数和生成固定模板；读取 dump、对齐 ID 和能量时间 |
| `ui/server.py` | 本地 HTTP、静态 allowlist、引擎启动探测、任务生命周期与 API |
| `ui/platform_info.py` | CPU/内存启动快照、失败保留 null；日志读取最多 12,000 bytes |
| `ui/demo/` / `ui/generate_demos.py` | 随包 Ising/薄膜真实产物与重生成脚本；非前端合成帧 |
| `ui/tests/` | Python unittest、Node test、需运行引擎的 smoke_api.py |
| `ui/start.cmd` | 切换到 ui 目录，以 Python 启动服务；窗口需保持打开 |

## 数据流与关键入口

### 打开/切换案例

`app.js:init` 并行读取 `/api/models` 和旧 Potts `/api/demo` → 创建 viewer → `applyData` 校验并切换模型元数据/参数/显示 → `setFrame`；之后读取引擎和平台状态。`loadCase` 通过请求序号抑制过期载入，保留旧结果供失败恢复。

Potts 从上游历史 dump/log 现场适配；Ising/薄膜读 `ui/demo/<id>/result.json`。Ising 是三维 sc/6n 扩展，薄膜是 tri 二维截面；默认终帧展示，非实时计算。

### 运行

跨区域输入通过 HTML `form="parameterForm"` 归属同一表单。JS validateDraft → POST → Python validate_parameters → 引擎可用/单任务检查 → 生成 jobId、后台线程运行。

Windows 命令链使用 WSL 的 `timeout 180`、`env OMP_NUM_THREADS=1` 和串行程序；外层等待 195 秒。原生分支直接运行二进制并使用外层等待，尚无同等级跨平台验证。

浏览器约每 1.2 秒轮询 job，读取最新已记录模型时间和日志尾部。成功后另取 result → applyData；失败保留旧画面。HTTP 请求 20 秒等待上限；连续三次查询失败提供手动重查。回放定时器与求解任务独立。

### 导入/导出与渲染

浏览器读取 JSON（50 MiB 上限）→ result-schema → 标记 imported → applyData。结构固定，每帧只有状态与能量等标量信息；当前只允许三模型。PNG 来自真实画布，JSON 保留结构、参数与 provenance。

两个 viewer 用于同实验初始/当前对比，相机同步；不支持任意两实验比较。薄膜默认只显示占据状态，可显示空位/顶部层；当前主曲线统计占据数量。

## API（当前兼容性边界）

| 接口 | 行为 |
|---|---|
| GET `/api/models` | 三模型元数据列表 |
| GET `/api/engine` | 启动时探测的引擎 available/message；不是每次重新探测 |
| GET `/api/platform` | 宿主机 CPU/内存启动快照、采样时间、执行环境；未知字段为 null |
| GET `/api/demo` | 旧 Potts 历史结果，保持兼容 |
| GET `/api/demo/{modelId}` | 对应随包案例，未知模型 404、缺案例文件 503 |
| POST `/api/jobs` | `{modelId, parameters}`；同时接受旧裸 Potts 参数对象；成功 202 |
| GET `/api/jobs/{id}` | 状态 running/complete/failed、参数、用时、已记录模型时间、console 尾部 |
| GET `/api/jobs/{id}/result` | 完成才返回 JSON，未完成 409、任务不存在 404 |

POST 请求最多 4,096 bytes；Origin 存在时必须等于当前 Host 的 HTTP origin。只允许一个运行任务；引擎不可用 503、参数非法 400、已有任务 409。没有取消、持久任务列表、远程集群或认证接口。

## 结果契约

- `schemaVersion: 1`；`modelId: potts | ising | thin_film`。
- `ids` 为唯一正整数；`positions` 对应 ID 的 `[x,y,z]`；`bounds` 三方向上下界；`spacing` 正数。
- `frames: [{time, states, energy}]`；时间非负严格递增，states 与 ID 一一对应，energy 有限或 null。
- Ising 状态限 1/2；薄膜限 1/2/3 且 z=0。导入上限：40,000 格点、500 帧、4,000,000 个格点×帧。
- 可附 `parameters`、`source`、`title`、`provenance`。source 区分 historical/bundled/computed/imported，不能因为可渲染就把用户导入说成已科学验证。
- dump 解析按 ID 排序并检查位置/边界不变；能量从日志按最近时间匹配并带容差，不伪造缺失指标。

## 配置、依赖和状态范围

- Three.js 版本由 package.json/pnpm-lock.yaml 固定；通过本地 node_modules import map 提供。需要 WebGL，Python 服务用标准库。
- `--port` 默认 8765；`SPPARKS_WSL_DISTRO` 默认 Ubuntu-24.04；`SPPARKS_BINARY` 默认仓库上游 src/spk_serial。Windows 配置路径由 linux_path 转成 `/mnt/<drive>/...`。
- `JOBS` 在内存；run 文件持久在磁盘但未被重启扫描恢复。sessionStorage 的 `spparks-job` 仅记当前页会话 ID；localStorage 的 `spparks-guide-v1` 仅记引导收起偏好。
- 平台内存是宿主机启动时可用量，既非 WSL 配额也非任务 RSS。前端固定串行标注依赖当前串行执行路线；替换引擎时必须核查兼容性。
- 静态资源只允许固定 UI 文件和解析后仍位于 Three.js 目录内的 JS；新前端模块需要同步 server allowlist。

验证命令见 AGENTS；历史运行/浏览器证据见 `ui/VERIFICATION.md`。不以此文档替代实际运行检查。
