import { LatticeViewer, PALETTE } from './viewer.js';
import { validateResult } from './result-schema.js';
import { mountGuidance, validateDraft, explainError } from './guidance.js';

const $ = id => document.getElementById(id);
const icon = name => `<svg><use href="#i-${name}"/></svg>`;
const format = value => Math.abs(value)>=1e6||(value!==0&&Math.abs(value)<0.001)?Number(value).toExponential(2):Number(value).toLocaleString('en-US', { maximumFractionDigits: 4 });
const timeLabel = value => Math.abs(value)>=1e5?Number(value).toExponential(2):Number(value).toFixed(2);
const escape = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { data: null, frame: 0, playing: false, compare: false, clip: { enabled:false, axis:2, value:9 }, engine:false, running:false, model:null };
let viewer, compareViewer, playbackTimer, toastTimer;
let selected = null;
let caseRequest = 0;
const guidance=mountGuidance({getState:()=>state});
function reportError(error,context,actionLabel,action,scroll=true){guidance.show({...explainError(error,context),detail:error.message,actionLabel,action,scroll});}
function setStoredJob(id){try{if(id)sessionStorage.setItem('spparks-job',id);else sessionStorage.removeItem('spparks-job');}catch{}}
function getStoredJob(){try{return sessionStorage.getItem('spparks-job');}catch{return null;}}
const metric = frame => state.model.id==='thin_film'?frame.states.filter(s=>s===2).length:frame.energy;
function updateVisibleCount(){
  if(!state.data)return;
  $('visibleCount').textContent=state.compare&&compareViewer?`初始 ${format(viewer.visibleCount)} / 当前 ${format(compareViewer.visibleCount)} 格点可见`:`${format(viewer.visibleCount)} / ${format(state.data.ids.length)} 格点可见`;
}

function updateModelUI(model){
  state.model=model;
  buildParameters();
  document.querySelector('h1').textContent=model.title+'实验';
  document.querySelector('.page-heading p').textContent=model.question+' 从物理定义到可追溯的计算结果。';
  document.querySelector('.breadcrumb').textContent='案例库 / '+model.title+' / 实验台';
  document.querySelector('.eyebrow').textContent=`SIMULATION WORKBENCH / CASE ${model.number}`;
  $('modelSelect').value=model.id;
  $('modelDimension').textContent=model.dimension+'D';
  $('modelDescription').textContent=model.description;
  $('excitationDescription').textContent=model.physics.excitation;
  $('entityDescription').textContent=model.physics.entities;
  $('fixedDescription').textContent=model.physics.fixed;
  $('initialDescription').textContent='初态：'+model.physics.initial+'；演化方法：'+model.physics.dynamics+'。';
  $('currentCase').innerHTML=`<span class="case-icon">${icon('cube')}</span><span>${escape(model.title)}<small>${escape(model.subtitle)}</small></span>`;
  document.querySelector('.case-tree').innerHTML=`<span class="tree-node">${escape(model.latticeLabel)}</span><span class="tree-node">${escape(model.boundaryLabel)}</span><span class="tree-node" id="sidebarSource"></span>`;
  document.querySelector('.fixed-params').innerHTML=`<span>晶格 <b>${escape(model.latticeLabel)}</b></span><span>边界 <b>${escape(model.boundaryLabel)}</b></span>`;
  $('singleTab').innerHTML=icon('cube')+(model.dimension===2?'二维截面':'三维组织');
  $('viewport').setAttribute('aria-label',`${model.dimension===2?'二维截面':'三维格点'}视图，可拖拽旋转、滚轮缩放、右键平移`);
  $('vacancyRow').hidden=model.id!=='thin_film';
  $('showVacancies').checked=false;
  if(viewer)viewer.showVacancies=false;
  if(compareViewer)compareViewer.showVacancies=false;
  $('clipEnabled').checked=false;
  state.clip.enabled=false;
  state.clip.axis=model.dimension===2?1:2;
  document.querySelectorAll('[data-axis]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.axis)===state.clip.axis));
  $('palette').innerHTML=model.legend?Object.entries(model.legend).map(([id,label])=>`<span style="background:${model.colors[id]}" title="${escape(label)}"></span>`).join(''):PALETTE.slice(0,12).map(c=>`<span style="background:${c}"></span>`).join('');
  document.querySelector('.color-legend p').textContent=model.legend?Object.values(model.legend).join(' / '):'点击格点查看精确状态编号';
  const film=model.id==='thin_film';
  document.querySelector('.analysis-heading h2').textContent=film?'占据格点演化':'能量演化';
  document.querySelector('.chart-key').textContent=film?'占据格点数':'格点总能量';
  document.querySelector('.energy-summary>span:first-child').innerHTML=film?'占据格点数 <small>格点</small>':'当前总能量 <small>模型单位</small>';
}

async function loadCase(id){
  const request=++caseRequest;
  pause();
  if(state.running){toast('请等待当前计算完成后再切换案例');return;}
  state.loadingCase=true;$('runButton').disabled=true;guidance.clear();
  $('loading').hidden=false;$('loading').textContent='正在载入案例真实数据…';
  try{const data=await api(`/api/demo/${id}`);if(request!==caseRequest)return;applyData(data);setCompare(false);$('infoDialog').close();toast('已载入 '+state.model.title);}
  catch(e){if(request===caseRequest){$('loading').hidden=true;$('modelSelect').value=state.model.id;$('infoDialog').close();reportError(e,'load','重新载入案例',()=>loadCase(id));}}
  finally{if(request===caseRequest){state.loadingCase=false;$('runButton').disabled=!state.engine||state.running;}}
}

function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,4500); }
async function api(url,options) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{const response=await fetch(url,{...options,signal:controller.signal});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'请求失败'),{status:response.status});return data;}
  catch(error){if(error.name==='AbortError')error.message='连接等待超过 20 秒，请检查本地服务。';throw error;}
  finally{clearTimeout(timer);}
}
function download(content,name,type='application/json') { const url=URL.createObjectURL(new Blob([content],{type})); const a=document.createElement('a'); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000); }
function modal(title,body,eyebrow='MATERIAL LAB') { $('dialogTitle').textContent=title; $('dialogEyebrow').textContent=eyebrow; $('dialogBody').innerHTML=body; if(!$('infoDialog').open) $('infoDialog').showModal(); }
$('closeDialog').onclick=()=>$('infoDialog').close();
$('infoDialog').addEventListener('click',e=>{if(e.target===$('infoDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});

function buildParameters() {
  const field=p=>`<div class="field"><div class="field-top"><label for="param-${p.id}">${escape(p.label)}</label><span class="field-unit">${escape(p.unit)}</span></div><input form="parameterForm" aria-describedby="help-${p.id}" id="param-${p.id}" name="${p.id}" type="number" min="${p.min}" max="${p.max}" step="${p.step||1}" value="${p.default}" required /><small class="field-help" id="help-${p.id}">${escape(p.help)}<br><span class="field-range">范围 ${format(p.min)}–${p.id==='seed'?p.max.toLocaleString('en-US'):format(p.max)}</span></small></div>`;
  for(const [group,target] of [['structure','parameterFields'],['excitation','excitationFields'],['run','runFields']]){
    $(target).innerHTML=state.model.parameters.filter(p=>p.group===group).map(field).join('');
  }
  document.querySelectorAll('input[form="parameterForm"]').forEach(input=>input.addEventListener('input',updateInputSummary));
}
function updateInputSummary(){
  if(!state.model)return;
  const p=Object.fromEntries(state.model.parameters.map(p=>[p.id,Number($('param-'+p.id).value)]));
  const valid=state.model.parameters.every(rule=>{const input=$('param-'+rule.id);return input.validity.valid;});
  const known=state.model.parameters.every(rule=>Number.isFinite(state.data?.parameters?.[rule.id]));
  const dirty=known&&state.model.parameters.some(rule=>p[rule.id]!==state.data.parameters[rule.id]);
  $('inputNotice').classList.toggle('dirty',dirty||!valid||!known);
  $('inputNotice').textContent=!valid?'请检查参数范围和步长，再启动仿真。':!known?'当前结果未提供完整参数，缺失项使用默认值；运行前请确认。':dirty?'待运行参数已修改。右侧仍显示原结果，启动并完成计算后才会更新。':'参数与当前结果一致。可直接启动，或修改参数创建新结果。';
  const sites=state.model.dimension===3?p.size**3:p.size*24*2;
  $('runSummary').textContent=valid?`${state.model.dimension}D · ${format(sites)} 格点 · 目标 t = ${format(p.duration)}`:'参数尚未有效 · 请检查上方输入';
  document.querySelectorAll('input[form="parameterForm"]').forEach(input=>{input.removeAttribute('aria-invalid');input.removeAttribute('aria-errormessage');});
}
function resetParameters() {
  for(const p of state.model.parameters) {
    const value=state.data?.parameters?.[p.id];
    $(`param-${p.id}`).value=Number.isFinite(value)&&value>=p.min&&value<=p.max ? value : p.default;
  }
  updateInputSummary();
}

function applyData(data) {
  validateResult(data);
  const model=state.models.find(m=>m.id===data.modelId);
  if(!model)throw new Error('此模型尚未注册');
  pause();
  updateModelUI(model);
  state.data=data;
  selected=null;
  $('selection').hidden=true;
  const axes=[0,1,2].map(a=>[...new Set(data.positions.map(p=>p[a]))].sort((a,b)=>a-b));
  state.layers=axes;
  state.clip.value=axes[state.clip.axis][Math.floor((axes[state.clip.axis].length-1)/2)];
  viewer.load(data,model);
  if(compareViewer) compareViewer.load(data,model);
  $('timeline').max=data.frames.length-1;
  const end=data.frames.at(-1).time;
  $('endTime').textContent=timeLabel(end);
  $('endLabel').textContent=format(end);
  $('middleTime').textContent=format((data.frames[0].time+end)/2);
  document.querySelector('.timeline-labels span:first-child b').textContent=format(data.frames[0].time);
  $('stageSize').textContent=model.dimension===2?'二维截面 · z = 0':axes.map(a=>a.length).join(' × ');
  const names={historical:'历史结果 · 真实数据',bundled:'随包案例 · 真实计算',computed:'本次计算 · 真实数据',imported:'导入结果 · 用户提供'};
  $('stageSource').textContent=names[data.source]||'导入结果 · 用户提供';
  $('sidebarSource').textContent=names[data.source]||'导入结果';
  $('dataFootnote').textContent=(names[data.source]||'导入结果')+'。'+model.interpretation;
  resetParameters();
  updateClipRange();
  updateClip();
  setFrame(data.frames.length-1);
  $('loading').hidden=true;
  $('resultStatus').textContent='已载入结果 / 回放';
  guidance.refresh();
  if(!state.running){$('jobPhase').textContent=state.engine?'待运行':'就绪检查';$('consoleOutput').textContent='尚未提交任务。\n选择模型 → 确认参数 → 启动仿真。\n此处显示 SPPARKS 实际运行日志。';$('jobElapsed').textContent='—';$('jobIdentity').textContent='NO ACTIVE JOB';$('solverTime').textContent='—';$('solverProgress').value=0;$('jobIndicator').className='';}
  if(!state.running){$('jobStatus').classList.remove('error');$('jobStatus').textContent=state.engine?'本地计算 · 完成后自动载入结果':'正在检测本地引擎…';}
}

function updateSelection(index=selected) {
  selected=index;
  if(index==null || !state.data || !viewer.visibleSites[index]) { $('selection').hidden=true; return; }
  const frame=state.data.frames[state.compare?0:state.frame];
  $('selection').innerHTML=`<b>格点 #${state.data.ids[index]} · 状态 ${frame.states[index]}</b>(${state.data.positions[index].map(format).join(', ')}) &nbsp; t = ${frame.time.toFixed(2)}`;
  $('selection').hidden=false;
}

function setFrame(index) {
  if(!state.data)return;
  state.frame=Math.max(0,Math.min(state.data.frames.length-1,Number(index)));
  const frame=state.data.frames[state.frame],last=state.data.frames.at(-1);
  viewer.setFrame(state.compare?0:state.frame);
  if(state.compare&&compareViewer) compareViewer.setFrame(state.frame);
  $('timeline').value=state.frame;
  $('timeline').style.background=`linear-gradient(to right,#568b72 ${state.frame/Math.max(1,state.data.frames.length-1)*100}%,#dce6db 0)`;
  $('currentTime').textContent=timeLabel(frame.time);
  $('stageTime').textContent=timeLabel(frame.time);
  $('frameCounter').textContent=`${state.frame+1} / ${state.data.frames.length} 帧`;
  $('prevFrame').disabled=state.frame===0;
  $('nextFrame').disabled=state.frame===state.data.frames.length-1;
  $('playButton').disabled=state.data.frames.length<2;
  const value=metric(frame),initial=metric(state.data.frames[0]);
  $('energyValue').textContent=value==null?'未提供':format(value);
  $('energyChange').textContent=initial!=null&&value!=null?`Δ${state.model.id==='thin_film'?'N':'E'} = ${format(value-initial)} · 相比初始态`:'无可比较的初始值';
  $('stateCount').textContent=`当前 ${new Set(frame.states).size} 种状态`;
  if(state.model.id==='ising')$('stateCount').textContent=`平均自旋 m = ${(frame.states.reduce((a,b)=>a+2*b-3,0)/frame.states.length).toFixed(3)}`;
  if(state.model.id==='thin_film')$('stateCount').textContent=`占据格点 ${format(frame.states.filter(s=>s===2).length)}`;
  $('observationTitle').textContent=state.frame===0?'初始组织':frame.time===last.time?'演化末态':'演化进行中';
  $('observationText').textContent=state.model.observation;
  updateVisibleCount();
  drawChart();
  updateSelection();
}

function drawChart() {
  const frames=state.data.frames.map(f=>({...f,energy:metric(f)}));
  const valid=frames.filter(f=>f.energy!=null);
  const svg=$('energyChart');
  svg.setAttribute('preserveAspectRatio','none');
  if(!valid.length) { svg.innerHTML='<text x="300" y="65" text-anchor="middle" fill="#8a9b7e" stroke="none" font-size="12">此结果未提供能量数据</text>'; return; }
  const low=Math.min(0,...valid.map(f=>f.energy)), high=Math.max(0,...valid.map(f=>f.energy));
  const padding=Math.max(high-low,1)*.08, min=low-padding,max=high+padding;
  const start=frames[0].time,end=frames.at(-1).time;
  const x=t=>44+(t-start)/Math.max(end-start,1)*535, y=e=>112-(e-min)/(max-min)*96;
  let html='<defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6f9c79" stop-opacity=".18"/><stop offset="1" stop-color="#6f9c79" stop-opacity=".01"/></linearGradient></defs>';
  for(let i=0;i<=2;i++) {const value=min+(max-min)*i/2; html+=`<path d="M44 ${y(value)}H579" stroke="#e4ebdf" stroke-width=".7" stroke-dasharray="3 4"/><text x="33" y="${y(value)+3}" text-anchor="end" fill="#9baa91" stroke="none" font-family="Consolas,monospace" font-size="9">${Math.abs(value)>=1000?(value/1000).toFixed(0)+'k':value.toFixed(0)}</text>`;}
  // Separate segments at missing metrics instead of inventing interpolated values.
  const segments=[]; let segment=[];
  frames.forEach(f=>{if(f.energy==null){if(segment.length)segments.push(segment);segment=[];}else segment.push(f);});
  if(segment.length)segments.push(segment);
  for(const seg of segments){const line=seg.map((f,i)=>`${i?'L':'M'}${x(f.time)},${y(f.energy)}`).join(' ');html+=`<path d="${line} L${x(seg.at(-1).time)},112 L${x(seg[0].time)},112Z" fill="url(#chartFill)" stroke="none"/><path d="${line}" fill="none" stroke="#6f987b" stroke-width="1.9"/>`;}
  for(const f of valid)html+=`<circle cx="${x(f.time)}" cy="${y(f.energy)}" r="2.2" fill="#fcfdfa" stroke="#6f987b" stroke-width="1.2"/>`;
  for(let i=0;i<=4;i++){const t=start+(end-start)*i/4;html+=`<text x="${x(t)}" y="132" text-anchor="middle" fill="#9baa91" stroke="none" font-family="Consolas,monospace" font-size="9">${format(t)}</text>`;}
  const f=frames[state.frame];
  html+=`<path d="M${x(f.time)} 8V112" stroke="#719879" stroke-dasharray="3 4" stroke-width=".8"/>`;
  if(f.energy!=null) html+=`<circle cx="${x(f.time)}" cy="${y(f.energy)}" r="4" fill="#377b5b" stroke="#ffffff" stroke-width="2"/>`;
  svg.innerHTML=html;
  svg.setAttribute('aria-label',`${state.model.id==='thin_film'?'占据格点数':'总能量'}曲线。当前模型时间 ${f.time}，数值 ${f.energy??'未提供'}。`);
}

function pause(){state.playing=false;clearTimeout(playbackTimer);$('playButton').innerHTML=icon('play');$('playButton').setAttribute('aria-label','播放演化');}
function scheduleFrame(){clearTimeout(playbackTimer);if(!state.playing)return;playbackTimer=setTimeout(()=>{if(state.frame>=state.data.frames.length-1){pause();return;}setFrame(state.frame+1);if(state.frame===state.data.frames.length-1)pause();else scheduleFrame();},Number($('playSpeed').value));}
$('playButton').onclick=()=>{if(!state.data)return;if(state.playing){pause();return;}if(state.frame===state.data.frames.length-1)setFrame(0);state.playing=true;$('playButton').innerHTML=icon('pause');$('playButton').setAttribute('aria-label','暂停回放');scheduleFrame();};
$('playSpeed').onchange=scheduleFrame;
$('prevFrame').onclick=()=>{pause();setFrame(state.frame-1);};
$('nextFrame').onclick=()=>{pause();setFrame(state.frame+1);};
$('timeline').oninput=e=>{pause();setFrame(e.target.value);};
$('energyChart').onclick=e=>{if(!state.data)return;const rect=e.currentTarget.getBoundingClientRect();const fraction=Math.max(0,Math.min(1,((e.clientX-rect.left)/rect.width*600-44)/535));const frames=state.data.frames;const time=frames[0].time+fraction*(frames.at(-1).time-frames[0].time);let nearest=0;frames.forEach((f,i)=>{if(Math.abs(f.time-time)<Math.abs(frames[nearest].time-time))nearest=i;});pause();setFrame(nearest);};

function updateClipRange(){if(!state.layers)return;const layers=state.layers[state.clip.axis];$('clipPosition').max=layers.length-1;let index=layers.indexOf(state.clip.value);if(index<0)index=Math.floor((layers.length-1)/2);$('clipPosition').value=index;state.clip.value=layers[index];$('clipMin').textContent=format(layers[0]);$('clipMax').textContent=format(layers.at(-1));}
function updateClip(){if(!viewer||!state.data)return;state.clip.enabled=$('clipEnabled').checked;state.clip.value=state.layers[state.clip.axis][Number($('clipPosition').value)];viewer.setClip(state.clip);compareViewer?.setClip(state.clip);$('clipControls').classList.toggle('disabled',!state.clip.enabled);$('clipPosition').disabled=!state.clip.enabled;document.querySelectorAll('[data-axis]').forEach(b=>b.disabled=!state.clip.enabled||(state.model.dimension===2&&Number(b.dataset.axis)===2));$('clipLayerLabel').textContent=`${'XYZ'[state.clip.axis]} = ${format(state.clip.value)}`;updateVisibleCount();$('selection').hidden=true;selected=null;}
$('clipEnabled').onchange=updateClip;
$('clipPosition').oninput=updateClip;
document.querySelectorAll('[data-axis]').forEach(button=>button.onclick=()=>{state.clip.axis=Number(button.dataset.axis);document.querySelectorAll('[data-axis]').forEach(b=>b.classList.toggle('selected',b===button));updateClipRange();updateClip();});
$('autoRotate').onchange=()=>{if(viewer)viewer.controls.autoRotate=$('autoRotate').checked;};
$('resetView').onclick=()=>{viewer?.reset();compareViewer?.reset();toast('已恢复默认视角');};

function setCompare(enabled){
  if(!state.data)return;
  state.compare=enabled;
  $('stage').classList.toggle('comparing',enabled);
  $('singleTab').classList.toggle('selected',!enabled);
  $('compareTab').classList.toggle('selected',enabled);
  $('labNav').classList.toggle('active',!enabled);
  $('compareNav').classList.toggle('active',enabled);
  if(enabled&&!compareViewer){
    compareViewer=new LatticeViewer($('compareViewport'),i=>{
      if(i==null){$('selection').hidden=true;return;}
      const f=state.data.frames[state.frame];
      $('selection').innerHTML=`<b>当前态 · 格点 #${state.data.ids[i]} · 状态 ${f.states[i]}</b>(${state.data.positions[i].map(format).join(', ')}) &nbsp; t = ${f.time.toFixed(2)}`;
      $('selection').hidden=false;
      selected=null;
    });
    compareViewer.showVacancies=$('showVacancies').checked;
    compareViewer.load(state.data,state.model);
    compareViewer.setClip(state.clip);
    // Share camera pose, including zoom and pan, for meaningful visual comparison.
    let syncing=false;
    const sync=(from,to)=>{if(syncing||!state.compare)return;syncing=true;to.camera.up.copy(from.camera.up);to.camera.position.copy(from.camera.position);to.camera.quaternion.copy(from.camera.quaternion);to.camera.zoom=from.camera.zoom;to.camera.updateProjectionMatrix();to.controls.target.copy(from.controls.target);to.controls.update();syncing=false;};
    viewer.controls.addEventListener('change',()=>sync(viewer,compareViewer));
    compareViewer.controls.addEventListener('change',()=>sync(compareViewer,viewer));
  }
  viewer.controls.enableDamping=!enabled;
  if(compareViewer)compareViewer.controls.enableDamping=!enabled;
  viewer.resize();compareViewer?.resize();viewer.reset();compareViewer?.reset();
  selected=null;$('selection').hidden=true;
  setFrame(state.frame);
}
$('singleTab').onclick=()=>setCompare(false);
$('compareTab').onclick=()=>setCompare(true);
$('compareNav').onclick=()=>setCompare(true);
$('labNav').onclick=()=>setCompare(false);
$('presentButton').onclick=()=>{const enabled=document.body.classList.toggle('presenting');$('presentButton').innerHTML=icon('expand')+(enabled?'退出展示':'展示模式');setTimeout(()=>{viewer?.resize();viewer?.reset();compareViewer?.resize();compareViewer?.reset();},0);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('presenting')&&!$('infoDialog').open)$('presentButton').click();if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName)||$('infoDialog').open)return;if(e.code==='Space'){e.preventDefault();$('playButton').click();}if(e.code==='ArrowRight'){e.preventDefault();pause();setFrame(state.frame+1);}if(e.code==='ArrowLeft'){e.preventDefault();pause();setFrame(state.frame-1);}});

$('snapshotButton').onclick=()=>{
  if(!state.data)return;
  const v=viewer.renderer.domElement;
  const canvas=document.createElement('canvas');
  canvas.width=v.width*(state.compare?2:1);canvas.height=v.height+100;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#142b33';ctx.fillRect(0,0,canvas.width,canvas.height);
  viewer.snapshot();ctx.drawImage(v,0,0);
  if(state.compare){compareViewer.snapshot();ctx.drawImage(compareViewer.renderer.domElement,v.width,0,v.width,v.height);}
  ctx.fillStyle='#d3e0cf';ctx.font='18px Consolas, Microsoft YaHei';
  const clip=state.clip.enabled?`${'XYZ'[state.clip.axis]} <= ${state.clip.value}`:'完整组织';
  ctx.fillText(`SPPARKS / ${state.model.title} | t = ${state.data.frames[state.frame].time} | ${clip}`,24,v.height+31);
  ctx.font='13px Microsoft YaHei';ctx.fillStyle='#94ada0';ctx.fillText(`${$('stageSource').textContent} · ${state.model.dimension}D · ${state.model.id==='ising'?'自旋状态':state.model.id==='thin_film'?'占据格点':'状态配色（非独立晶粒编号）'}${state.compare?' · 左：初始态 / 右：当前态':''}`,24,v.height+62);
  canvas.toBlob(blob=>{if(!blob){toast('截图生成失败，请重试');return;}download(blob,`${state.data.modelId}-t${state.data.frames[state.frame].time}.png`,'image/png');toast('已生成 PNG，已请求浏览器下载');},'image/png');
};

function showSource(){if(!state.data)return;const data=state.data;const p=data.parameters||{};modal('模型与数据来源',`<p>${escape(state.model.description)}</p><h3>当前结果</h3><p>${escape(data.provenance?.description||'用户导入结果；物理来源未经验证')}<br>${format(data.ids.length)} 个格点 · ${data.frames.length} 帧 · 模型时间 ${data.frames[0].time}–${data.frames.at(-1).time}</p><p>参数：${Object.entries(p).map(([k,v])=>`${escape(k)} = ${escape(v)}`).join(' · ')||'未提供'}</p><h3>如何解读</h3><ul><li>${escape(state.model.interpretation)}</li><li>总能量采用 SPPARKS 的 <code>diag_style energy</code>，累加格点能量；不是以焦耳计的实验能量。</li><li>时间与温度为模型量，未经标定不标注秒或开尔文。</li><li>逐帧展示真实输出；帧间不生成虚构的组织状态。暂停回放不暂停后台计算。</li></ul>${data.provenance?.dump?`<p>结构：<code>${escape(data.provenance.dump)}</code><br>能量：<code>${escape(data.provenance.log)}</code></p>`:''}<div class="dialog-actions"><button class="button primary-button" id="exportJson">导出当前完整结果 JSON</button></div>`,'MODEL & PROVENANCE');$('exportJson').onclick=()=>{download(JSON.stringify(data),`${data.modelId}-${data.source}-result.json`);toast('已导出结构、时间序列与来源信息');};}
$('sourceButton').onclick=showSource;
$('helpButton').onclick=()=>modal('一个可交互的材料实验台',`<p>选择案例，观察结构，追踪演化，比较结果。第一版面向现场讲解与探索。</p><h3>操作指南</h3><ul><li>左键拖拽旋转，滚轮缩放，右键拖拽平移。</li><li>点击格点查看坐标与状态编号。</li><li>开启剖切，选择方向并调整保留层。</li><li>空格播放 / 暂停，方向键逐帧；Esc 退出展示模式。</li><li>“初始 / 当前”共享视角，时间轴控制右侧当前态。</li></ul><p>浏览器端需要支持 WebGL。计算通过本机 WSL 中的 SPPARKS 执行，生成结果后自动载入回放。</p>`);
function showCases(){
  if(!state.data)return;
  modal('选择一个物理问题',`<p>三个真实案例，共用运行与回放流程。模型维度、状态含义与观察指标各有不同。</p><div class="case-library">${state.models.map(m=>`<button class="case-option ${m.id===state.model.id?'current':''}" data-case="${m.id}" ${state.running?'disabled':''}><span class="case-art ${m.id}" aria-hidden="true"></span><span class="case-tag">CASE ${m.number} / ${m.dimension}D</span><h3>${escape(m.title)}</h3><p>${escape(m.question)}</p><small>${escape(m.subtitle)}</small><span class="case-open">打开案例 →</span></button>`).join('')}</div><p>${state.running?'当前任务计算中，完成后可切换案例。':'Potts 为历史随包结果；Ising 和薄膜生长为由本地引擎生成的随包结果，均可修改参数重新计算。'}</p>`,'CASE LIBRARY');
  document.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>loadCase(b.dataset.case));
}
$('caseNav').onclick=showCases;$('currentCase').onclick=showCases;document.querySelector('.brand').onclick=e=>{e.preventDefault();showCases();};
$('integrationButton').onclick=()=>{modal('为新模型留好接口',`<p>把计算逻辑、模型描述和可视化结果分开。后续的铁电材料模型可以沿用实验台的交互框架。</p><h3>01 / 模型描述</h3><p><code>models.py</code> 注册案例，描述文件声明参数、范围、输出量和显示能力。当前界面的参数表单已由该描述生成。</p><h3>02 / 结构与结果</h3><p>固定格点坐标与 ID 加上每帧的状态、时间和能量。当前可导入 Potts、Ising、薄膜生长的固定晶格结果 JSON；文件不执行代码。</p><h3>03 / 计算适配器</h3><p>新物理模型需要在 SPPARKS 中实现并编译，或接入独立求解器。自定义晶格还需提供位置、邻居关系和初始数值。导入结构并不自动实现新的能量函数。</p><h3>后续扩展</h3><p>可为极化矢量增加箭头与分量着色。首版渲染器仅支持固定晶格上的标量分类状态。</p><div class="dialog-actions"><button class="button" id="downloadModel">下载模型描述</button><button class="button" id="exportExample">导出当前结果作格式示例</button></div>`,'MODEL INTEGRATION');$('downloadModel').onclick=()=>download(JSON.stringify(state.model,null,2),`${state.model.id}-model.json`);$('exportExample').onclick=()=>{if(state.data)download(JSON.stringify(state.data),`${state.model.id}-result-example.json`);};};
$('importButton').onclick=()=>$('fileInput').click();
$('fileInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(state.running){toast('请等待当前计算完成后再导入');e.target.value='';return;}caseRequest++;state.loadingCase=false;guidance.clear();try{if(file.size>50*1024*1024)throw new Error('结果文件不得超过 50 MB');const data=validateResult(JSON.parse(await file.text()));data.source='imported';applyData(data);toast(`已导入 ${data.frames.length} 帧结果`);}catch(error){reportError(error,'import','重新选择文件',()=>$('fileInput').click());}finally{e.target.value='';$('runButton').disabled=!state.engine||state.running;}};
$('resetParams').onclick=()=>{resetParameters();toast('已恢复当前结果的参数；缺失参数使用默认值');};

$('modelSelect').onchange=()=>loadCase($('modelSelect').value);
function lockInputs(locked){
  document.querySelectorAll('input[form="parameterForm"]').forEach(input=>input.disabled=locked);
  $('modelSelect').disabled=locked;$('resetParams').disabled=locked;$('importButton').disabled=locked;
}
async function loadPlatform(){
  try{
    const p=await api('/api/platform');
    if(p.status==='detecting'){setTimeout(loadPlatform,2000);return;}
    const memory=n=>n==null?'未获取':(n/1024**3).toFixed(1)+' GiB';
    $('hostSystem').textContent=(p.system||'本地')+' / 宿主机';
    $('cpuName').textContent=p.cpuName||'CPU 型号未获取';
    $('physicalCores').textContent=p.physicalCores??'未获取';
    $('logicalProcessors').textContent=p.logicalProcessors??'未获取';
    $('memoryTotal').textContent=memory(p.memoryTotal);
    $('memoryAvailable').textContent='采样可用 '+memory(p.memoryAvailable);
    $('runtimeName').textContent=p.runtime||'未获取';
    $('platformState').textContent=p.status==='partial'?'部分信息未获取':'已检测';
    $('platformSampled').textContent='采样于 '+new Date(p.sampledAt*1000).toLocaleString('zh-CN')+' · 服务启动时检测';
  }catch{$('platformState').textContent='检测失败';$('cpuName').textContent='未能读取硬件信息';$('runtimeName').textContent='未获取';$('platformSampled').textContent='硬件信息不可用；不影响已有结果回放。';}
}

async function engineStatus(){
  try{
    const data=await api('/api/engine');state.engine=data.available;
    $('engineStatus').innerHTML='<i></i>'+escape(data.message);$('engineStatus').classList.toggle('offline',!data.available);
    $('runButton').disabled=!data.available||state.running||state.loadingCase;
    if(!state.running){$('jobStatus').textContent=data.available?'就绪 · 启动后生成新的真实结果':data.message;$('jobPhase').textContent=data.available?'待运行':'引擎不可用';}
    if(data.message.includes('正在检测'))setTimeout(engineStatus,2000);
    else if(!data.available)reportError(Object.assign(new Error(data.message),{status:503}),'submit','重新检测',()=>{guidance.clear();engineStatus();},false);
  }catch(error){
    state.engine=false;$('runButton').disabled=true;$('engineStatus').innerHTML='<i></i>本地服务连接中断';$('engineStatus').classList.add('offline');
    if(!state.running)$('jobStatus').textContent='请重新启动本地服务，然后点击“重新连接”。';
    reportError(error,'load','重新连接',()=>{guidance.clear();engineStatus();},false);
  }
}
async function monitorJob(id){
  state.running=true;$('runButton').disabled=true;$('runButton').querySelector('span').textContent='正在计算…';
  lockInputs(true);
  $('jobPhase').textContent='计算中';$('jobIndicator').className='running';$('jobIdentity').textContent='JOB / '+id;
  $('resultStatus').textContent='新任务计算中 · 仍为上次结果';
  setStoredJob(id);
  let connectionFailures=0;
  while(state.running){
    try{
      const job=await api(`/api/jobs/${id}`);connectionFailures=0;
      $('jobElapsed').textContent=job.elapsed+' s';
      $('solverTime').textContent=format(job.simulationTime)+' / '+format(job.parameters.duration);
      $('solverProgress').value=Math.min(100,100*job.simulationTime/job.parameters.duration);
      const consoleEl=$('consoleOutput'),atBottom=consoleEl.scrollHeight-consoleEl.scrollTop-consoleEl.clientHeight<35;
      consoleEl.textContent=job.console||'引擎已启动，等待首批日志输出…（求解器可能缓冲输出）';
      if(atBottom)consoleEl.scrollTop=consoleEl.scrollHeight;
      $('jobStatus').textContent=`已用时 ${job.elapsed}s · 已记录模型时间 ${format(job.simulationTime)} / ${job.parameters.duration}。当前画面仍是已载入结果。`;
      if(job.status==='complete'){applyData(await api(`/api/jobs/${id}/result`));$('jobStatus').textContent=`计算完成 · ${job.elapsed}s · 已载入 ${state.data.frames.length} 帧真实结果`;$('jobPhase').textContent='已完成';$('jobIndicator').className='complete';$('solverProgress').value=100;guidance.show({tone:'success',title:'计算完成，可以观察本次结果了',message:'点击播放回看演化，或切换“初始 / 当前”对比组织变化。时间轴对应真实输出帧。',actionLabel:'查看本次结果',action:()=>{$('resultsPanel').scrollIntoView({block:'start'});guidance.clear();},scroll:false});toast('计算完成，已载入本次结果');break;}
      if(job.status==='failed')throw Object.assign(new Error(job.error),{terminal:true});
    }catch(error){
      if(error.terminal||error.message==='任务不存在'){$('jobStatus').textContent='本次计算未完成，请查看日志和处理提示。';$('jobStatus').classList.add('error');$('jobPhase').textContent='未完成';$('jobIndicator').className='failed';$('resultStatus').textContent='任务未完成 · 保留原结果';if(error.status===404)guidance.show({title:'未找到这次任务',message:'服务重启后，尚未持久化的任务状态无法恢复。请确认旧计算已经结束，再启动新任务。当前显示的结果仍可回放。',detail:error.message});else reportError(error,'job','调整运行参数',()=>{$('runPanel').scrollIntoView({block:'start'});$('param-duration').focus();});break;}
      connectionFailures++;
      $('jobStatus').textContent='任务连接中断，正在重试；回放仍可使用。';
      if(connectionFailures>=3){$('jobStatus').textContent='连接中断，任务可能仍在计算。请恢复服务后重新查询。';$('jobPhase').textContent='连接中断';$('jobIndicator').className='failed';$('resultStatus').textContent='任务状态未知 · 保留原结果';guidance.show({title:'暂时无法读取计算进度',message:'任务可能仍在后台运行，为避免重复提交，输入保持锁定。恢复本地服务后，点击重新查询继续跟踪同一任务。',detail:error.message,actionLabel:'重新查询任务',action:()=>{guidance.clear();monitorJob(id);}});return;}
    }
    await new Promise(resolve=>setTimeout(resolve,1200));
  }
  state.running=false;lockInputs(false);setStoredJob(null);$('runButton').querySelector('span').textContent='启动仿真';$('runButton').disabled=!state.engine;
}
$('parameterForm').noValidate=true;
$('parameterForm').onsubmit=async e=>{
  e.preventDefault();if(state.running||state.loadingCase||!state.model)return;
  const parameters=Object.fromEntries(new FormData(e.target).entries()),problem=validateDraft(state.model,parameters);
  guidance.clear();
  if(problem){const input=$('param-'+problem.field);input.setAttribute('aria-invalid','true');input.setAttribute('aria-errormessage','recoveryText');guidance.show({title:'还有一个输入需要调整',message:problem.message,actionLabel:'定位此参数',action:()=>{input.scrollIntoView({block:'center'});input.focus();}});return;}
  Object.keys(parameters).forEach(k=>parameters[k]=Number(parameters[k]));$('jobStatus').classList.remove('error');$('runButton').disabled=true;state.running=true;lockInputs(true);$('jobPhase').textContent='提交中';$('consoleOutput').textContent='正在提交参数并启动求解器…';
  try{const job=await api('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId:state.model.id,parameters})});monitorJob(job.id);}
  catch(error){state.running=false;lockInputs(false);$('jobStatus').textContent=error.status?'任务未启动，请按提示处理。':'尚不能确认提交结果，请勿连续启动。';$('jobStatus').classList.add('error');$('runButton').disabled=!state.engine;$('jobPhase').textContent=error.status?'提交失败':'提交状态未知';$('jobIndicator').className='failed';$('consoleOutput').textContent=error.message;reportError(error,'submit','重新检测连接',()=>{guidance.clear();engineStatus();});}
};

async function init(){
  document.querySelector('.color-legend').insertAdjacentHTML('beforebegin','<label id="vacancyRow" class="toggle-row compact" hidden><span>显示空位与顶部层</span><input id="showVacancies" type="checkbox" role="switch"/><span class="switch-track"></span></label>');
  $('showVacancies').onchange=()=>{viewer.showVacancies=$('showVacancies').checked;if(compareViewer)compareViewer.showVacancies=viewer.showVacancies;updateClip();};
  $('palette').innerHTML=PALETTE.slice(0,12).map(c=>`<span style="background:${c}"></span>`).join('');
  document.querySelector('.color-legend p').textContent='点击格点查看精确状态编号';
  document.addEventListener('viewer-error',e=>toast(e.detail));
  try{
    const [models,data]=await Promise.all([api('/api/models'),api('/api/demo')]);
    state.models=models;
    $('modelSelect').innerHTML=models.map(m=>`<option value="${escape(m.id)}">${escape(m.title)}</option>`).join('');
    document.querySelector('.nav-count').textContent=models.length;
    viewer=new LatticeViewer($('viewport'),updateSelection);
    applyData(data);
    engineStatus();
    loadPlatform();
    const activeJob=getStoredJob();if(activeJob)monitorJob(activeJob);
  }catch(error){$('loading').classList.add('error');$('loading').textContent='实验台未能完成加载，请查看上方处理提示。';$('jobStatus').textContent='初始化失败，请按提示重试。';guidance.show({title:'实验台尚未准备好',message:'请确认本地服务已启动、依赖已安装，浏览器支持 WebGL。修复后重新加载；刷新不会提交计算。',detail:error.message,actionLabel:'重新加载实验台',action:()=>location.reload()});}
}
init();
