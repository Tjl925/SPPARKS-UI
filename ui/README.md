# SPPARKS Material Lab

本地多案例材料实验台，包含 Potts、Ising 与薄膜生长。使用 Three.js 和 Python 标准库，不依赖云服务。

## 启动

首次安装：在本目录执行 `pnpm install`（依赖锁定在 pnpm-lock.yaml）。

日常启动：双击 `start.cmd`，或在本目录执行：

```powershell
python -B server.py --port 8765
```

浏览器打开 http://127.0.0.1:8765 。启动服务的终端需保持运行；Ctrl+C 停止服务。

默认检测 Windows 的 Ubuntu-24.04 WSL 和相邻目录 `spparks-08Oct25/src/spk_serial`。
可用 `SPPARKS_WSL_DISTRO` 指定发行版，用 `SPPARKS_BINARY` 指定可执行文件的本机路径。
引擎不可用时仍可回放历史结果。端口可由 `--port` 更改。

## 展示路线

1. 默认显示原始历史示例末帧，8,000 个格点，11 帧结果。
2. 点击播放，从初始随机状态回放；拖动时间轴或点击能量曲线定位。
3. 拖拽旋转、滚轮缩放、右键平移；点击格点查看信息。
4. 开启剖切，选择 X/Y/Z 并移动保留层，观察内部结构。
5. 点击“初始 / 当前”比较；两侧视角同步，右侧跟随时间轴。
6. 展示模式收起侧栏，Esc 退出。工具栏支持导出带说明的 PNG。
7. 修改参数并运行真实计算；完成后自动载入结果。计算期间仍显示之前的结果。

## 科学口径

- 当前类别数不等同于晶粒数。状态颜色不等同于真实晶体取向，编号以点击信息为准。
- 时间、温度和能量均为模型量，未标定为秒、K、J。
- 能量读取 `diag_style energy` 的格点能量总和，保持引擎统计口径。
- 展示真实输出帧，不插值生成组织。回放暂停与后台求解相互独立。
- 初始随包数据来自 `examples/potts/dump.potts`，能量来自 `log.potts.11Nov09.linux.1`，是 2009 年历史示例，不冒充新版本计算。

## 真实运行

本地服务只监听 127.0.0.1。`POST /api/jobs` 接受 `{ "modelId": "potts|ising|thin_film", "parameters": {...} }`，按模型校验参数；旧 Potts 参数请求仍兼容。运行器，使用固定模板生成输入。
每次任务独立保存在 `runs/<job-id>/`，包括 `input.in`、`result.dump`、`log.spparks`、`console.log` 和 `result.json`。
每次最多一个任务，立方域边长 8–32，状态数 2–100，温度 0–2，终止时间 10–100。WSL 求解最长 180 秒。
任务完成后加载全部帧；当前版本不逐帧推送计算中的结果，不支持暂停求解或跨参数的多任务历史管理。

## 模型接入

`models.py` 注册三个模型，`GET /api/models` 返回案例目录，`GET /api/demo/<modelId>` 获取对应结果；参数表单由模型描述生成。`model.json` 保留 Potts 基础描述。计算适配器在 `data_adapter.py`，三维视图在 `viewer.js`。

前端结果契约（固定坐标，states 数组顺序对应 ids）：

```json
{
  "schemaVersion": 1,
  "modelId": "potts",
  "ids": [1, 2],
  "positions": [[0, 0, 0], [1, 0, 0]],
  "bounds": [[0, 2], [0, 2], [0, 2]],
  "spacing": 1,
  "frames": [
    { "time": 0, "states": [1, 2], "energy": 2 },
    { "time": 1, "states": [2, 2], "energy": 0 }
  ]
}
```

`energy` 可为 null；没有能量时不生成虚构曲线。当前结果可在“来源与模型说明”导出，再导入验证。
导入限制：50 MB、最多 40,000 格点、500 帧、总计 4,000,000 个状态值。
导入支持 `potts`、`ising`、`thin_film` 三种固定晶格标量类别。Ising 状态须为 1/2，薄膜须为 1/2/3 且坐标 z=0；能量可为任意有限数值或 null。新物理模型需增加独立后端适配器、模型描述和输出字段映射；极化矢量等显示另行实现。
新晶格可由 SPPARKS `read_sites` 接入，需提供位置、邻居关系和初始数值；上传晶格不等于实现新的物理规则。

## 验证

```powershell
python -B -m unittest discover -s tests -v
node --test tests/result-schema.test.mjs
```

原有 SPPARKS 源码、输入示例和结果文件保持原样。

## 2026-09-14 多案例使用补充

- 在案例库选择 Potts、Ising 或薄膜生长，表单、维度、图例与观察说明自动切换。
- Ising 为原二维 examples/ising 模型的三维 sc/6n 扩展。显示自旋 1→−1、2→+1，平均自旋 m=(N2−N1)/N。当前 SPPARKS 的能量定义为异向邻居计数总和，不冒充另一种 Hamiltonian 口径。
- 薄膜保持二维三角晶格，纵向 24 单元，横向 16–48 单元；默认32。顶部设禁止沉积状态，保留原无 Schwoebel 示例的非线性 hop 势垒。
- 薄膜能量表默认零，因此主曲线为每帧占据状态(2)数量。默认隐藏空位(1)与顶部禁沉积(3)，可在观察面板显示全部；Z 剖切不适用于该二维例。
- 薄膜温度0.015–0.04，沉积率5e−10–5e−9，时间1e10–3e11（均按模型输入量）；预计沉积量超过保守容量限制时拒绝运行，避免明显满域。
- 计算期间禁止更换案例/导入，防止后台结果覆盖另一个模型。回放和观察仍可使用。
- 新随包结果位于 `demo/ising`、`demo/thin_film`。使用 `python -B generate_demos.py` 可在已配置引擎的环境重新生成。
- `python -B tests/smoke_api.py` 对运行中的本地服务执行三个模型的真实任务检查；会创建三个小型任务。
- 烧结原始示例缺少外部初始结构文件，暂不加入可运行案例列表。
