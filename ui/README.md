# SPPARKS Material Lab

本地三维 Potts 实验台。使用 Three.js 和 Python 标准库，不依赖云服务。

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

本地服务只监听 127.0.0.1。`POST /api/jobs` 接受经过范围验证的 Potts 参数，使用固定模板生成输入。
每次任务独立保存在 `runs/<job-id>/`，包括 `input.in`、`result.dump`、`log.spparks`、`console.log` 和 `result.json`。
每次最多一个任务，立方域边长 8–32，状态数 2–100，温度 0–2，终止时间 10–100。WSL 求解最长 180 秒。
任务完成后加载全部帧；当前版本不逐帧推送计算中的结果，不支持暂停求解或跨参数的多任务历史管理。

## 模型接入

`model.json` 是模型描述接口，参数表单由它生成。计算适配器在 `data_adapter.py`，三维视图在 `viewer.js`。

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
首版导入仅支持 Potts 固定晶格标量类别。新物理模型需增加独立后端适配器、模型描述和输出字段映射；极化矢量等显示另行实现。
新晶格可由 SPPARKS `read_sites` 接入，需提供位置、邻居关系和初始数值；上传晶格不等于实现新的物理规则。

## 验证

```powershell
python -B -m unittest discover -s tests -v
node --test tests/result-schema.test.mjs
```

原有 SPPARKS 源码、输入示例和结果文件保持原样。
