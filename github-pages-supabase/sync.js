/* GitHub Pages edition: progress is saved through the Supabase Edge Function. */
'use strict';
let syncing=false, syncTimer=null, conflict=false;

function cacheState(){try{localStorage.setItem(KEY,JSON.stringify(state));$('storage-warning').hidden=true;}catch{$('storage-warning').hidden=false;}}
function setSyncStatus(message){$('save-status').textContent=message;$('sync-status').textContent=message;}
function showPersistence(){
  $('persistence').hidden=!state;
  if(state&&state._dirty)setSyncStatus('有未同步进度，正在尝试保存');
}
function functionUrl(){
  const config=window.STUDY_SUPABASE;
  if(!config?.url||!config?.anonKey)throw new Error('Missing Supabase configuration');
  return `${config.url.replace(/\/$/,'')}/functions/v1/study-api`;
}
async function requestAPI(action,payload){
  const config=window.STUDY_SUPABASE;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(functionUrl(),{method:'POST',headers:{'Content-Type':'application/json','apikey':config.anonKey,'Authorization':`Bearer ${config.anonKey}`},body:JSON.stringify({action,...payload}),signal:controller.signal,cache:'no-store'});
    const result=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(result.error||`HTTP ${response.status}`);error.status=response.status;throw error;}
    return result;
  }finally{clearTimeout(timer);}
}
function queueSave(){showPersistence();clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,250);}
async function syncNow(){
  if(!state||!state._dirty||syncing||conflict)return;
  syncing=true;const current=state,snapshot=JSON.stringify(current);let succeeded=false;
  setSyncStatus('正在保存到研究数据库…');
  try{
    const result=await requestAPI('save',{state:JSON.parse(snapshot),revision:current._revision||0});
    if(state!==current)return;
    const unchanged=JSON.stringify(state)===snapshot;
    state._revision=result.revision;state._dirty=!unchanged;cacheState();succeeded=true;
    setSyncStatus(state._dirty?'正在同步最新修改…':(state.completed?'全部评价已提交并保存到研究数据库':'进度已保存到研究数据库'));
  }catch(error){
    if(state!==current)return;
    if(error.status===409){conflict=true;setSyncStatus('另一页面存在较新进度。请关闭其他评价页面，再点击“读取数据库进度”继续。');}
    else setSyncStatus('尚未保存到研究数据库；已尝试本地缓存，将自动重试。请勿清除浏览器数据。');
  }finally{
    syncing=false;
    if(state&&state._dirty&&!conflict){clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,succeeded?100:5000);}
  }
}
async function resumeCurrent(){
  if(!state)return;
  if(!state._dirty){
    try{const result=await requestAPI('resume',{id:state.id});if(!validState(result.state))throw Error('Invalid state');state={...result.state,_revision:result.revision,_dirty:false};conflict=false;cacheState();setSyncStatus('已恢复数据库保存的进度');}
    catch(error){if(error.status===404){state._revision=0;state._dirty=true;cacheState();}else setSyncStatus('暂时无法连接研究数据库，继续使用本地进度。');}
  }
  state.completed&&STUDY_CASES.every(completeCase)?finish():render();showPersistence();if(state._dirty)queueSave();
}
$('reload-progress').addEventListener('click',async()=>{
  if(!state||syncing)return;
  if(state._dirty&&!confirm('读取数据库进度会替换当前页面尚未同步的修改。是否继续？'))return;
  try{const result=await requestAPI('resume',{id:state.id});if(!validState(result.state))throw Error('Invalid state');state={...result.state,_revision:result.revision,_dirty:false};conflict=false;cacheState();setSyncStatus('已恢复数据库保存的进度');state.completed?finish():render();}
  catch{setSyncStatus('暂时无法读取数据库进度，当前答案已保留，请稍后重试。');}
});
$('retry-save').addEventListener('click',()=>{if(conflict){setSyncStatus('存在进度冲突，请使用“读取数据库进度”。');return;}syncNow();});
window.addEventListener('online',()=>syncNow());
window.addEventListener('beforeunload',event=>{if(state?._dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('storage',event=>{if(event.key===KEY&&state){conflict=true;setSyncStatus('检测到另一标签页修改了记录。请关闭多余标签页，再读取数据库进度。');}});
if(state){if(state._dirty===undefined){state._dirty=true;state._revision=0;cacheState();}showPersistence();if(state._dirty)queueSave();else setSyncStatus('本地进度已保留，点击继续时读取数据库最新进度。');}
