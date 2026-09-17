"""Allowlisted case metadata: one source for the form, runner and scientific labels."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def parameter(id, label, low, high, default, step=1):
    return dict(id=id, label=label, min=low, max=high, default=default,
                step=step, type='integer' if step == 1 else 'number')


POTTS = json.loads((ROOT / 'model.json').read_text(encoding='utf-8'))
POTTS.update(number='001', dimension=3, latticeLabel='SC / 26 邻居', boundaryLabel='三向周期性',
             subtitle='三维 · 蒙特卡洛', heading='看见微观组织的演化',
             question='同状态区域如何随蒙特卡洛更新而变化？',
             interpretation='状态颜色不等同于独立晶粒或真实晶体取向。',
             observation='对照初始组织，开启剖切观察内部同状态区域的演化。',
             origin='examples/potts/in.potts', colors=None)
SEED = parameter('seed', '随机种子', 1, 2147483646, 56789)
ISING = dict(id='ising', schemaVersion=1, title='Ising · 自旋演化', number='002', dimension=3,
             subtitle='三维 · 自旋翻转', heading='观察自旋如何协同演化',
             description='基于经典 Ising 示例扩展到简单立方三维晶格，观察两种自旋状态的演化。',
             question='温度如何影响自旋翻转与畴结构？',
             interpretation='状态 1 映射为自旋 −1，状态 2 为 +1；平均自旋 m 为两类自旋的归一化差。此 SPPARKS 实现的能量累计异向邻居数。',
             observation='调整温度并运行，结合两色自旋畴、平均自旋与能量观察变化。',
             geometry={'type':'fixed-lattice', 'lattice':'sc/6n', 'boundary':'periodic'},
             latticeLabel='SC / 6 邻居', boundaryLabel='三向周期性',
             origin='examples/ising/in.ising（原二维算例扩展至三维）',
             colors={'1':'#7faebf', '2':'#dcaa79'},
             legend={'1':'自旋 −1', '2':'自旋 +1'},
             parameters=[parameter('size','立方域边长',8,32,20), parameter('temperature','模型温度 T',0,8,2,0.1),
                         parameter('duration','仿真终止时间',10,100,100), SEED])
FILM = dict(id='thin_film', schemaVersion=1, title='薄膜生长 · 沉积与扩散', number='003', dimension=2,
            subtitle='二维截面 · 动力学蒙特卡洛', heading='看见薄膜从表面生长',
            description='缩小原有无 Schwoebel 跃迁的三角晶格算例，观察粒子沉积与表面扩散。保留原始跃迁势垒。',
            question='沉积与扩散如何共同改变表面形貌？',
            interpretation='二维截面：1 为空位，2 为占据，3 为顶部禁沉积格点。默认只显示占据格点，主曲线统计其数量；原示例能量表默认为零。不是三维薄膜体。',
            observation='回放沉积过程，观察占据格点数量与表面起伏；可切换显示空位以检查完整晶格。',
            geometry={'type':'fixed-lattice','lattice':'tri','boundary':'periodic'},
            latticeLabel='TRI / 三角晶格', boundaryLabel='周期边界 + 顶部禁沉积层',
            origin='examples/thin_film_growth/in.thin_film.no.schwoebel',
            colors={'1':'#46616a','2':'#d8b27f','3':'#7ca798'},
            legend={'1':'空位（默认隐藏）','2':'占据格点','3':'顶部禁沉积'},
            parameters=[parameter('size','横向晶格单元数',16,48,32),
                        parameter('temperature','模型温度 T',0.015,0.04,0.0216,0.0001),
                        parameter('flux','沉积率（模型量）',5e-10,5e-9,2e-9,1e-10),
                        parameter('duration','仿真终止时间',1e10,3e11,2e11,1e10), SEED])
for model in (ISING, FILM):
    model['fields'] = [{'id':'state','label':'状态编号','kind':'categorical','source':'states'}]
    model['capabilities'] = ['orbit','clip','pick','timeline','compare']
    model['runner'] = model['id']+'-local'
    model['metrics'] = [{'id':'energy','label':'总能量','unit':'模型单位','source':'SPPARKS diag_style energy'}]
ISING['metrics'].append({'id':'magnetization','label':'平均自旋','unit':'无量纲','source':'(N2-N1)/N'})
FILM['metrics'].append({'id':'occupied','label':'占据格点数','unit':'格点','source':'count(state=2)'})
MODELS = {m['id']: m for m in (POTTS, ISING, FILM)}

# Help describes the actual allowlisted templates, not an atomistic material model.
POTTS['physics'] = dict(material='多状态晶粒组织 / Potts', excitation='热涨落与界面能驱动',
    entities='粗粒化格点；状态编号用于组织分类，不代表元素或独立晶粒。',
    initial='随机分配 1–Q 状态', dynamics='随机扫描 · 蒙特卡洛',
    fixed='晶格间距 1.0（模型长度）；26 邻居；三向周期边界。')
ISING['physics'] = dict(material='双状态自旋体系 / Ising', excitation='热涨落；无外加磁场',
    entities='每个格点代表一个自旋自由度，取 −1 或 +1；不指定原子种类。',
    initial='随机分配两种自旋状态', dynamics='随机扫描 · 自旋翻转',
    fixed='晶格间距 1.0（模型长度）；6 邻居；三向周期边界。')
FILM['physics'] = dict(material='粒子沉积体系 / Diffusion', excitation='沿 −Y 沉积与热激活扩散',
    entities='格点表示空位、占据或顶部禁沉积状态；当前未指定化学元素。',
    initial='底部占据层，其余为空位/顶部禁沉积层', dynamics='树求解器 · 动力学蒙特卡洛',
    fixed='三角晶格间距 2.42（模型长度）；纵向 24 单元；沿用示例跃迁势垒。')
for model in MODELS.values():
    for p in model['parameters']:
        details = {
            'size': ('structure', '格点单元', '每个方向的晶格单元数；增大尺寸会增加格点和计算量。' if model['dimension']==3 else '横向晶格单元数；纵向固定为 24 单元。'),
            'states': ('structure', '类', '初始状态编号的上限 Q，不是独立晶粒个数。'),
            'temperature': ('excitation', '模型量', '控制热激活变化的强度；未标定为开尔文，不能直接当作实验温度。'),
            'flux': ('excitation', '模型量', '控制沉积事件频率；与终止时间共同影响沉积量，不是实验通量。'),
            'duration': ('run', '模型时间', '求解器运行的目标模型时间；不等于等待的秒数。默认输出约 11 帧。'),
            'seed': ('run', '整数', '确定随机初态与随机事件序列；同模型同参数同引擎可复现实验。'),
        }
        p['group'], p['unit'], p['help'] = details[p['id']]


def get_model(model_id):
    if not isinstance(model_id, str) or model_id not in MODELS:
        raise ValueError('不支持的模型')
    return MODELS[model_id]
