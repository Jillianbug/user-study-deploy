/* Browser cache plus optional same-origin persistent study server. */
'use strict';
const METHODS = ['ours','editsplat','gaussctrl','imix2mix','rl3d'];
const DIMENSIONS = [['instruction_following','指令遵循'],['multi_view_consistency','跨视角一致性'],['visual_quality','视觉质量']];
const KEY = 'multiview-user-study-v2';
const LETTERS = ['A','B','C','D','E'];
const $ = id => document.getElementById(id);
let state = null, viewerIndex = 0, returnFocus = null;
function shuffled(items) {
  const result = [...items];
  for (let i=result.length-1;i>0;i--) {
    const n = new Uint32Array(1); const limit = Math.floor(4294967296/(i+1))*(i+1);
    do { crypto.getRandomValues(n); } while (n[0]>=limit);
    const j=n[0]%(i+1); [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
function validState(s) {
  return s && s.version===2 && typeof s.id==='string' && typeof s.username==='string' && s.username.trim() && Number.isInteger(s.index) && s.index>=0 && s.index<STUDY_CASES.length && s.orders && s.answers && STUDY_CASES.every(c=>Array.isArray(s.orders[c.id]) && s.orders[c.id].length===5 && new Set(s.orders[c.id]).size===5 && s.orders[c.id].every(m=>METHODS.includes(m)) && s.answers[c.id] && DIMENSIONS.every(([d])=>s.answers[c.id][d]===undefined || METHODS.includes(s.answers[c.id][d])));
}
function save() {
  state._dirty = true;
  try { localStorage.setItem(KEY,JSON.stringify(state)); $('save-status').textContent='已保存到本地'; $('storage-warning').hidden=true; }
  catch { $('save-status').textContent='本地保存失败'; $('storage-warning').hidden=false; }
  if (typeof queueSave === 'function') queueSave();
}
function completeCase(c) { return DIMENSIONS.every(([d])=>METHODS.includes(state.answers[c.id][d])); }
function show(section) { ['welcome','study','complete'].forEach(id=>$(id).hidden=id!==section); }
function imagePath(c,method) { return `assets/${c.id}/${method}.webp`; }
function start(username) {
  if (typeof conflict !== 'undefined') conflict=false;
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  state={version:2,id:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),username,index:0,orders:{},answers:{},completed:false};
  for(const c of STUDY_CASES){state.orders[c.id]=shuffled(METHODS);state.answers[c.id]={};}
  save();render();
}
function render() {
  show('study');const c=STUDY_CASES[state.index];
  if (typeof showPersistence === 'function') showPersistence();
  $('participant').textContent=`参与者：${state.username}`;
  $('progress-text').textContent=`第 ${state.index+1} / ${STUDY_CASES.length} 题`;
  $('progress').value=STUDY_CASES.filter(completeCase).length;
  $('prompt').textContent=c.prompt;$('question-error').textContent='';
  const gallery=$('gallery');gallery.replaceChildren();
  ['original',...state.orders[c.id]].forEach((method,i)=>{
    const label=i===0?'Original':LETTERS[i-1];
    const button=document.createElement('button');button.type='button';button.className=`image-card${i===0?' original':''}`;button.setAttribute('aria-label',`放大 ${label}`);
    const header=document.createElement('header');const title=document.createElement('strong');title.textContent=label;const hint=document.createElement('span');hint.textContent=i===0?'原始参考 · 点击放大':'编辑结果 · 点击放大';header.append(title,hint);
    const img=document.createElement('img');img.src=imagePath(c,method);img.alt=`${label} 四视角图像`;img.decoding='async';img.addEventListener('error',()=>{hint.textContent='图片加载失败，请刷新重试';$('question-error').textContent='有图片加载失败，请确认六组图片完整显示后再评价。';});
    button.append(header,img);button.addEventListener('click',()=>openViewer(i,button));gallery.append(button);
  });
  const ratings=$('ratings');ratings.replaceChildren();
  for(const [dimension,title] of DIMENSIONS){
    const field=document.createElement('fieldset');field.className='dimension';const legend=document.createElement('legend');legend.textContent=title;field.append(legend);
    const choices=document.createElement('div');choices.className='choices';
    state.orders[c.id].forEach((method,i)=>{
      const label=document.createElement('label');label.className='choice';const input=document.createElement('input');input.type='radio';input.name=dimension;input.value=LETTERS[i];input.checked=state.answers[c.id][dimension]===method;input.setAttribute('aria-label',`${title}：${LETTERS[i]}`);
      input.addEventListener('change',()=>{state.answers[c.id][dimension]=method;state.completed=false;save();updateAnswered();$('progress').value=STUDY_CASES.filter(completeCase).length;$('question-error').textContent='';});
      const text=document.createElement('span');text.textContent=LETTERS[i];label.append(input,text);choices.append(label);
    });field.append(choices);ratings.append(field);
  }
  $('previous').disabled=state.index===0;$('next').textContent=state.index===STUDY_CASES.length-1?'完成评价 →':'下一题 →';updateAnswered();
}
function updateAnswered(){const a=state.answers[STUDY_CASES[state.index].id];$('answered').textContent=`本题已选择 ${DIMENSIONS.filter(([d])=>a[d]).length} / 3 个维度`;}
function finish(){show('complete');$('completion-name').textContent=`${state.username} · 已完成 ${STUDY_CASES.length} 题`;if(typeof showPersistence==='function')showPersistence();window.scrollTo(0,0);}
function openViewer(i,button){viewerIndex=i;returnFocus=button;updateViewer();$('viewer').showModal();document.body.style.overflow='hidden';}
function updateViewer(){const c=STUDY_CASES[state.index];const label=viewerIndex===0?'Original':LETTERS[viewerIndex-1];$('viewer-label').textContent=label;$('viewer-prompt').textContent=c.prompt;$('viewer-image').src=imagePath(c,viewerIndex===0?'original':state.orders[c.id][viewerIndex-1]);$('viewer-image').alt=`${label} 四视角大图`;$('viewer-stage').classList.remove('zoomed');$('viewer-stage').scrollTo(0,0);$('zoom').textContent='放大 2×';}
function moveImage(delta){viewerIndex=(viewerIndex+delta+6)%6;updateViewer();}
$('login-form').addEventListener('submit',e=>{e.preventDefault();const name=$('username').value.trim();if(!name){$('username').setCustomValidity('请输入非空用户名');$('username').reportValidity();return;}if(state && state.username===name){resumeCurrent();return;}if(state&&!confirm('开始新的评价会切换当前浏览器的参与记录。并确认旧记录已保存到服务器。是否继续？'))return;start(name);});
$('username').addEventListener('input',()=>$('username').setCustomValidity(''));
$('resume').addEventListener('click',()=>resumeCurrent());
$('previous').addEventListener('click',()=>{if(state.index>0){state.index--;save();render();window.scrollTo(0,0);}});
$('next').addEventListener('click',()=>{if(!completeCase(STUDY_CASES[state.index])){$('question-error').textContent='请为三个评价维度各选择一组最佳结果。';return;}if(state.index<STUDY_CASES.length-1){state.index++;save();render();window.scrollTo(0,0);}else{const missing=STUDY_CASES.findIndex(c=>!completeCase(c));if(missing>=0){state.index=missing;save();render();$('question-error').textContent='请完成这道题的全部评价。';return;}state.completed=true;save();finish();}});
$('review').addEventListener('click',()=>{render();window.scrollTo(0,0);});
$('close-viewer').addEventListener('click',()=>$('viewer').close());$('viewer').addEventListener('close',()=>{document.body.style.overflow='';returnFocus?.focus();});
$('image-prev').addEventListener('click',()=>moveImage(-1));$('image-next').addEventListener('click',()=>moveImage(1));
$('viewer').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();moveImage(e.key==='ArrowLeft'?-1:1);}});
$('zoom').addEventListener('click',()=>{const zoomed=$('viewer-stage').classList.toggle('zoomed');$('zoom').textContent=zoomed?'适应窗口':'放大 2×';});
let drag=null;const stage=$('viewer-stage');stage.addEventListener('pointerdown',e=>{if(stage.classList.contains('zoomed')&&e.pointerType==='mouse'){drag={x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop};stage.setPointerCapture(e.pointerId);e.preventDefault();}});stage.addEventListener('pointermove',e=>{if(drag){stage.scrollLeft=drag.left-e.clientX+drag.x;stage.scrollTop=drag.top-e.clientY+drag.y;}});stage.addEventListener('pointerup',()=>drag=null);stage.addEventListener('pointercancel',()=>drag=null);
try{const stored=localStorage.getItem(KEY);if(stored){const candidate=JSON.parse(stored);if(validState(candidate)){state=candidate;$('resume-box').hidden=false;$('resume-text').textContent=`${state.username}：已完成 ${STUDY_CASES.filter(completeCase).length} / ${STUDY_CASES.length} 题`;$('resume').textContent=state.completed?'查看上次完成记录 →':'继续上次评价 →';}}}catch{$('storage-warning').hidden=false;}
