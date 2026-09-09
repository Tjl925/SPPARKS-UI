# SPPARKS UI · 材料仿真实验台

面向材料与物理领域专家的交互式仿真展示工具，以 **Potts 三维晶粒长大**为首个案例。

第一版已于 **2026-09-09 通过用户验收**。优先保证展示、交互和真实数据可追溯，后续接入学院新开发的材料模型。

## 已实现

- 三维格点组织：旋转、缩放、平移、复位和格点信息查询。
- X/Y/Z 剖切与保留层调节，观察内部组织。
- 真实历史结果回放：8,000 格点、11 帧，时间轴、逐帧和速度控制。
- 能量曲线联动，以及初始/当前组织的同步视角对比。
- 现场展示模式、带时间/来源标注的 PNG 导出。
- 参数化提交本地 SPPARKS 计算，完成后自动加载真实结果。
- 结果 JSON 导入导出及数据校验。
- 模型描述和计算适配接口，为后续模型扩展保留位置。

## 快速开始

需要 Python 3.10+、Node.js / pnpm 和支持 WebGL 的浏览器。历史结果回放不要求安装 WSL；真实计算需要可执行的 SPPARKS 程序。

```bash
git clone https://github.com/Tjl925/SPPARKS-UI.git
cd SPPARKS-UI/ui
pnpm install
python -B server.py --port 8765
```

打开 **http://127.0.0.1:8765**。安装依赖后，Windows 可双击 `ui/start.cmd` 启动。

Windows 默认通过 `Ubuntu-24.04` WSL 调用 `spparks-08Oct25/src/spk_serial`。Git 仓库不包含本机编译产物，因此首次克隆需要自行构建求解器；构建说明见上游 `spparks-08Oct25/doc/Section_start.html`。也可通过 `SPPARKS_BINARY` 指定已有程序路径，通过 `SPPARKS_WSL_DISTRO` 指定发行版。

未配置求解器时，页面仍可打开并交互回放随包历史数据。

## 项目结构

```text
ui/                      三维前端、本地服务、数据适配器和测试
docs/PROJECT_PLAN.md      完整路线图与今日完成勾选
docs/COMMIT_MESSAGE.txt   首版提交说明
docs/superpowers/specs/   已确认的设计记录
spparks-08Oct25/          现有 SPPARKS 源码、文档及案例资料
```

## 文档与验证

- [完整计划表与完成清单](docs/PROJECT_PLAN.md)
- [使用、运行与模型接入说明](ui/README.md)
- [验证记录](ui/VERIFICATION.md)
- [设计记录](docs/superpowers/specs/2026-09-09-potts-ui-design.md)

```bash
cd ui
python -B -m unittest discover -s tests -v
node --test tests/result-schema.test.mjs
```

首版已通过 4 项 Python 测试、2 项 Node 测试、4 项 HTTP 检查，并使用现有本地程序完成两次真实计算。浏览器交互、导入、截图和窄屏布局均已检查。干净环境下的重新编译与安装验证列入后续计划。

## 科学口径与当前边界

颜色表示 Potts 状态分类，不等同于独立晶粒编号或真实晶体取向；模型时间、温度和能量不直接标为秒、K、J。能量采用 SPPARKS `diag_style energy` 的格点总和口径。

当前提供计算完成后的真实帧回放。计算中逐帧推送、跨实验结果管理、铁电求解器与极化矢量显示属于后续工作。

## 上游来源

SPPARKS 由 Sandia National Laboratories 开发；随项目保留现有分发目录中的版权声明及 [上游许可证](spparks-08Oct25/LICENSE)。本项目不是 SPPARKS 官方 UI。
