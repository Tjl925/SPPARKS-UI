/** Beginner-facing guidance and recovery, independent of the renderer. */
export function validateDraft(model, values) {
  for (const rule of model.parameters) {
    const raw = values[rule.id], value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) return {field:rule.id, message:`请填写“${rule.label}”，需要一个有效数值。`};
    if (value < rule.min || value > rule.max || (rule.type==='integer' && !Number.isInteger(value)))
      return {field:rule.id, message:`“${rule.label}”须在 ${rule.min}–${rule.max} 之间${rule.type==='integer'?'，且为整数':''}。`};
    const step=rule.step||1, ticks=(value-rule.min)/step;
    if(Math.abs(ticks-Math.round(ticks))>1e-6*Math.max(1,Math.abs(ticks)))
      return {field:rule.id,message:`“${rule.label}”请按 ${step} 的步长调整（起点 ${rule.min}）。`};
  }
  if(model.id==='thin_film' && Number(values.flux)*Number(values.duration)>Number(values.size)*24)
    return {field:'flux',message:'预计沉积量过大。请降低沉积率或终止时间，或增加横向尺寸后再运行。'};
  return null;
}

export function explainError(error, context='load') {
  const text=String(error.message||error);
  if(context==='submit' && (!error.status || error.name==='AbortError')) return {
    title:'暂时无法确认任务是否已启动',
    message:'提交时连接中断，任务可能已被服务接收。请先恢复本地服务连接；不要连续点击启动。当前结果仍可回放。'};
  if(error.status===409) return {title:'已有任务正在计算',message:'请等待当前任务完成后再提交。可以继续观察已载入的结果。'};
  if(error.status===503) return {title:'计算引擎尚不可用',message:'请确认本机 WSL 和 SPPARKS 已安装并可运行。修复后重启本地服务，再重新检测。已有结果仍可回放。'};
  if(context==='import') return {title:'这份结果暂时无法导入',message:'请选择实验台导出的结果 JSON，检查模型类型和数据格式。当前结果没有被替换，可重新选择文件。'};
  if(error.status===400) return {title:'请检查运行参数',message:'参数未通过求解器校验。查看下方详细信息，修改后重新启动；当前结果保持不变。'};
  if(context==='job') return {title:/180|超时|timeout/i.test(text)?'计算超过时限':'本次计算未完成',message:'请查看控制台日志。可减小晶格尺寸或缩短仿真终止时间，再启动新任务。原结果仍然保留。'};
  return {title:'暂时无法载入数据',message:'请确认本地服务仍在运行，然后重试。若刚关闭了启动窗口，请重新运行 ui/start.cmd。已显示的结果会保留。'};
}

export function mountGuidance({getState}) {
  const $=id=>document.getElementById(id);
  const steps=[
    ['选模型，理解输入','physicsPanel','从一个已验证案例开始。默认参数可以直接运行；先阅读输入项旁的含义、范围和单位，再尝试只改一个参数。格点状态不等于原子种类。'],
    ['确认本机可以计算','platformPanel','上方数字是宿主机资源，本次运行仍为 1 进程 / 1 线程。等待顶部显示本地引擎可用；引擎不可用时仍能观察随包结果。'],
    ['启动一次真实仿真','runPanel','终止时间是模型时间，不是等待秒数；随机种子用于复现。点击“启动仿真”后查看状态和日志。计算期间仍显示旧结果，完成后会自动更新。'],
    ['回放并解释结果','resultsPanel','拖动时间轴或点击播放观察演化，拖拽视图旋转。“初始 / 当前”用于对照同一次实验；“观察工具”内可剖切。回放暂停不会暂停计算。']
  ];
  let step=0;
  const card=document.createElement('section');card.id='firstRunGuide';card.className='first-run-guide';card.setAttribute('aria-label','首次使用引导');
  card.innerHTML='<div class="guide-heading"><span>首次使用 · 完成你的第一轮仿真</span><button id="dismissGuide" type="button" class="tiny-button">收起引导</button></div><div class="guide-content"><span id="guideIndex"></span><div><h2 id="guideTitle"></h2><p id="guideText"></p><p id="guideContext"></p></div></div><div class="guide-actions"><span>引导不会修改参数或自动运行</span><button id="guidePrevious" class="button" type="button">上一步</button><button id="guideLocate" class="button" type="button">定位此区域</button><button id="guideNext" class="button" type="button">下一步</button></div>';
  document.querySelector('.workflow').after(card);
  const open=document.createElement('button');open.id='guideButton';open.className='button';open.type='button';open.textContent='使用引导';document.querySelector('.heading-actions').prepend(open);
  const notice=document.createElement('section');notice.id='recoveryNotice';notice.className='recovery-notice';notice.hidden=true;notice.setAttribute('role','alert');
  notice.innerHTML='<div><strong id="recoveryTitle"></strong><p id="recoveryText"></p><details id="recoveryDetails"><summary>查看详细信息</summary><pre id="recoveryRaw"></pre></details></div><div class="recovery-actions"><button id="recoveryAction" class="button" type="button"></button><button id="dismissRecovery" class="tiny-button" type="button">关闭提示</button></div>';
  card.after(notice);
  function render(){const s=steps[step];$('guideIndex').textContent=`0${step+1} / 04`;$('guideTitle').textContent=s[0];$('guideText').textContent=s[2];$('guidePrevious').disabled=step===0;$('guideNext').textContent=step===3?'收起，开始探索':'下一步';const state=getState();$('guideContext').textContent=step===0&&state.model?'当前案例：'+state.model.title:step===2&&state.running?'当前已有任务运行中，请等待结果。':'';}
  function dismiss(){card.hidden=true;try{localStorage.setItem('spparks-guide-v1','dismissed');}catch{}}
  open.onclick=()=>{card.hidden=false;step=0;render();card.scrollIntoView({block:'center'});};
  $('dismissGuide').onclick=dismiss;$('guidePrevious').onclick=()=>{step=Math.max(0,step-1);render();};$('guideNext').onclick=()=>{if(step===3)dismiss();else{step++;render();}};
  $('guideLocate').onclick=()=>{const target=$(steps[step][1]);target.scrollIntoView({block:'start'});target.classList.add('guide-highlight');setTimeout(()=>target.classList.remove('guide-highlight'),2200);};
  $('dismissRecovery').onclick=()=>notice.hidden=true;
  try{card.hidden=localStorage.getItem('spparks-guide-v1')==='dismissed';}catch{}
  render();
  return {
    refresh:render,
    clear(){notice.hidden=true;},
    show({title,message,detail='',actionLabel='重试',action,scroll=true,tone='error'}){
      notice.dataset.tone=tone;notice.setAttribute('role',tone==='success'?'status':'alert');
      $('recoveryTitle').textContent=title;$('recoveryText').textContent=message;$('recoveryRaw').textContent=detail;
      $('recoveryDetails').hidden=!detail;$('recoveryDetails').open=false;
      $('recoveryAction').hidden=!action;$('recoveryAction').textContent=actionLabel;$('recoveryAction').onclick=action||null;
      notice.hidden=false;if(scroll)notice.scrollIntoView({block:'center'});
    }
  };
}
