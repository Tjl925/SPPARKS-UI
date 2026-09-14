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


def get_model(model_id):
    if not isinstance(model_id, str) or model_id not in MODELS:
        raise ValueError('不支持的模型')
    return MODELS[model_id]
