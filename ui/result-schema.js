export function validateResult(data) {
  const fail = message => { throw new Error('结果文件无效：'+message); };
  if (!data || data.schemaVersion !== 1 || !['potts','ising','thin_film'].includes(data.modelId)) fail('支持 schemaVersion=1 及 Potts、Ising、薄膜生长模型。');
  const n = data.ids?.length;
  if (!Number.isInteger(n) || n<1 || n>40000) fail('格点数须为 1–40,000。');
  if (!Array.isArray(data.ids) || data.ids.some(x=>!Number.isSafeInteger(x)||x<1) || new Set(data.ids).size!==n) fail('格点 ID 必须唯一且为正整数。');
  if (!Array.isArray(data.positions) || data.positions.length!==n || data.positions.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>!Number.isFinite(x)||Math.abs(x)>1e6))) fail('每个格点必须有三个有限坐标。');
  if (!Array.isArray(data.bounds) || data.bounds.length!==3 || data.bounds.some(b=>!Array.isArray(b)||b.length!==2||b.some(x=>!Number.isFinite(x))||b[1]<=b[0]||b[1]-b[0]>1e6)) fail('三维边界无效。');
  if (data.positions.some(p=>p.some((v,a)=>v<data.bounds[a][0] || v>data.bounds[a][1]))) fail('格点坐标超出边界。');
  if (new Set(data.positions.map(p=>p.join(','))).size!==n) fail('存在重复格点坐标。');
  if (!Number.isFinite(data.spacing) || data.spacing<=0 || data.spacing>1e4) fail('spacing 必须为有效的正数。');
  if (!Array.isArray(data.frames)||!data.frames.length||data.frames.length>500||n*data.frames.length>4000000) fail('帧数或总数据量超出限制。');
  let previous=-Infinity;
  for (const f of data.frames) {
    if (!f || !Number.isFinite(f.time) || f.time<0 || f.time<=previous) fail('模型时间必须有限且严格递增。');
    previous=f.time;
    if (!Array.isArray(f.states)||f.states.length!==n||f.states.some(v=>!Number.isSafeInteger(v)||v<1||v>1000000)) fail('每帧必须为每个格点提供一个正整数状态。');
    if (data.modelId==='ising' && f.states.some(v=>v!==1&&v!==2)) fail('Ising 状态只能为 1 或 2。');
    if (data.modelId==='thin_film' && f.states.some(v=>v<1||v>3)) fail('薄膜状态只能为 1、2、3。');
    if (f.energy!==null && !Number.isFinite(f.energy)) fail('能量必须为有限数值或 null。');
  }
  if(data.modelId==='thin_film' && data.positions.some(p=>p[2]!==0)) fail('薄膜示例必须为 z=0 的二维截面。');
  if (data.parameters!=null && (typeof data.parameters!=='object'||Array.isArray(data.parameters)||Object.values(data.parameters).some(v=>!Number.isFinite(v)))) fail('参数必须为数值对象。');
  return data;
}
