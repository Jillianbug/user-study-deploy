'use strict';
let syncing=false, syncTimer=null, conflict=false;
function cacheState(){try{localStorage.setItem(KEY,JSON.stringify(state));$('storage-warning').hidden=true;}catch{$('storage-warning').hidden=false;}}
function setSyncStatus(message){$('save-status').textContent=message;$('sync-status').textContent=message;}
function showPersistence(){
  $('persistence').hidden=!state;
  if(state){if(state._dirty)setSyncStatus('有未同步进度，正在尝试保存');}
}
async function requestAPI(path,payload){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
  try{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'});if(!response.ok){const error=new Error('HTTP '+response.status);error.status=response.status;throw error;}return await response.json();}finally{clearTimeout(timer);}
}
function queueSave(){
  showPersistence();clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,250);
}
async function syncNow(){
  if(!state||!state._dirty||syncing||conflict)return;
  syncing=true;const current=state;const snapshot=JSON.stringify(current);let succeeded=false;
  setSyncStatus('正在保存到研究者电脑…');
  try{
    const result=await requestAPI('/api/save',{state:JSON.parse(snapshot),revision:current._revision||0});
    if(state!==current)return;
    const unchanged=JSON.stringify(state)===snapshot;
    state._revision=result.revision;state._dirty=!unchanged;cacheState();succeeded=true;
    setSyncStatus(state._dirty?'正在同步最新修改…':(state.completed?'全部评价已提交并保存到研究者电脑':'进度已保存到研究者电脑'));
    if(!result.csv_ready)$('sync-status').textContent+='（进度文件已保存，汇总 CSV 等待研究者关闭 Excel 后刷新）';
  }catch(error){
    if(state!==current)return;
    if(error.status===409){conflict=true;setSyncStatus('另一页面存在较新进度。请关闭其他评价页面，再点击“读取服务器进度”继续。');}
    else setSyncStatus('尚未保存到服务器；已尝试本地缓存，将自动重试。请勿清除浏览器数据。');
  }finally{
    syncing=false;
    if(state&&state._dirty&&!conflict){clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,succeeded?100:5000);}
  }
}
async function resumeCurrent(){
  if(!state)return;
  if(!state._dirty){
    try{const result=await requestAPI('/api/resume',{id:state.id});if(!validState(result.state))throw Error('Invalid state');state={...result.state,_revision:result.revision,_dirty:false};conflict=false;cacheState();setSyncStatus('已恢复服务器保存的进度');}
    catch(error){if(error.status===404){state._revision=0;state._dirty=true;cacheState();}else setSyncStatus('暂时无法连接服务器，继续使用本地进度。');}
  }
  state.completed&&STUDY_CASES.every(completeCase)?finish():render();showPersistence();if(state._dirty)queueSave();
}
$('reload-progress').addEventListener('click',async()=>{
  if(!state||syncing)return;
  if(state._dirty&&!confirm('读取服务器进度会替换当前页面尚未同步的修改。是否继续？'))return;
  try{const result=await requestAPI('/api/resume',{id:state.id});if(!validState(result.state))throw Error('Invalid state');state={...result.state,_revision:result.revision,_dirty:false};conflict=false;cacheState();setSyncStatus('已恢复服务器保存的进度');state.completed?finish():render();}
  catch{setSyncStatus('暂时无法读取服务器进度，当前答案已保留，请稍后重试。');}
});
$('retry-save').addEventListener('click',()=>{if(conflict){setSyncStatus('存在进度冲突，请使用“读取服务器进度”。');return;}syncNow();});
window.addEventListener('online',()=>syncNow());
window.addEventListener('beforeunload',event=>{if(state?._dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('storage',event=>{if(event.key===KEY&&state){conflict=true;setSyncStatus('检测到另一标签页修改了记录。请关闭多余标签页，再读取服务器进度。');}});
if(state){if(state._dirty===undefined){state._dirty=true;state._revision=0;cacheState();}showPersistence();if(state._dirty)queueSave();else setSyncStatus('本地进度已保留，点击继续时读取服务器最新进度。');}
