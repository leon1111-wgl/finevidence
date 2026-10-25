// Opt-in loopback observations. No credential persistence or financial admission.
const $ = id => document.getElementById(id);
const node = (tag, text, attrs = {}) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,v);
  return n;
};
let panel, runtime, credential = '', records = [], staged = null, pending = null,
    revokeId = null, busy = false, epoch = 0, active = null;
const allowed = () => runtime?.runtime === 'python_local' && runtime.review_enabled === true &&
  location.protocol === 'http:' && ['127.0.0.1','localhost'].includes(location.hostname);
function status(text, error = false) {
  $('ledger-status').textContent = text;
  $('ledger-status').setAttribute('role', error ? 'alert' : 'status');
  $('ledger-status').className = error ? 'error' : 'small';
}
function controls() {
  const enabled = allowed();
  $('ledger-auth').hidden = !enabled;
  $('ledger-actions').hidden = !enabled;
  $('ledger-connect').disabled = busy;
  $('ledger-refresh').disabled = busy || !credential;
  $('ledger-disconnect').disabled = !credential && !busy;
  $('ledger-submit').disabled = busy || !credential || !staged || !!pending;
  $('ledger-confirm-revoke').disabled = busy || !credential || !revokeId || !!pending;
  $('ledger-note').disabled = busy || !!pending;
  $('ledger-observation').disabled = busy || !!pending;
  $('ledger-reason').disabled = busy || !!pending;
  $('ledger-retry').hidden = !pending || busy;
  panel.setAttribute('aria-busy', String(busy));
  for (const button of $('ledger-records').querySelectorAll('button[data-revoke]')) button.disabled = busy || !!pending;
}
export function configureReviewLedger(value) {
  runtime = value;
  $('ledger-availability').textContent = allowed()
    ? '已启用本机记录。连接后，所选草稿、摘录和意见仅写入本机服务的私有目录；PDF 文件不传输。'
    : '审核记录需要显式启用 Python 本地服务。公开页和默认本地服务不接收审核意见；草稿仍可导出。';
  controls();
}
export function clearStagedReview() {
  staged = null;
  if (!panel) return;
  $('ledger-selection').textContent = '从已保存草稿选择“登记审核意见”，先核对原页再填写。';
  controls();
}
export function stageReview(draft, row) {
  if (!allowed() || busy || pending) {
    panel.open = true;
    status(pending ? '先重试待确认请求，或断开后重新查询记录。' : '请启用并连接本地审核服务后操作。', true);
    return;
  }
  staged = structuredClone(draft);
  $('ledger-selection').textContent = `选中草稿 ${row} 的快照：${draft.company} · ${draft.period} · ${draft.raw_value} ${draft.currency ?? '币种待核对'} × ${draft.unit_scale ?? '单位待核对'} · 物理页 ${draft.provenance.page} · 文件 ${draft.provenance.file_sha256}。修改列表后须重新选择。`;
  $('ledger-note').value = '';
  panel.open = true;
  controls();
  $('ledger-note').focus();
  $('ledger-note').scrollIntoView({block:'center'});
}
async function request(path, body) {
  if (!allowed() || !credential) throw Error('REVIEW_AUTH_REQUIRED');
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET', cache:'no-store',
    headers:{'Authorization':'Bearer '+credential,'X-FinEvidence-CSRF':runtime.csrf,'Content-Type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {}),
    signal: AbortSignal.any([active.signal, AbortSignal.timeout(8000)]),
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(Error(data?.status || 'REQUEST_FAILED'), {httpStatus:r.status});
  return data;
}
const dateLabel = value => value.slice(0, 19).replace('T', ' ') + ' UTC';
const labels = {needs_changes:'需修订',reviewed_with_limits:'已记录核对意见（有限范围）'};
function render() {
  $('ledger-records').replaceChildren();
  $('ledger-count').textContent = `${records.length} / 100 条本机记录（含撤回）。导出是当时快照；再次使用前应连接本机查询当前状态。`;
  for (const r of records) {
    const li=node('li');
    li.append(node('p',`${r.state === 'revoked' ? '已撤回' : labels[r.observation]} · ${r.draft.company} · ${r.draft.period} · ${r.reviewer} · ${dateLabel(r.recorded_at)}`));
    const detail=node('details');detail.append(node('summary','查看原意见与草稿快照'));
    detail.append(node('p',r.note),node('p',`记录 ${r.record_id} · 草稿 SHA-256 ${r.snapshot_sha256}`,{class:'digest'}));
    if (r.revocation) detail.append(node('p',`撤回：${r.revocation.reason} · ${r.revocation.reviewer} · ${dateLabel(r.revocation.at)}`));
    detail.append(node('pre',JSON.stringify(r.draft,null,2),{class:'ledger-snapshot'}));
    li.append(detail);
    const download=node('button','导出此记录',{type:'button',class:'secondary','data-export':r.record_id});
    download.onclick=()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));
      const a=node('a',undefined,{href:url,download:`finevidence-review-${r.record_id}.json`});
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    li.append(download);
    if (r.state !== 'revoked') {
      const revoke=node('button','撤回此意见',{type:'button',class:'secondary','data-revoke':r.record_id});
      revoke.onclick=()=>{
        revokeId=r.record_id;
        $('ledger-revoke-target').textContent=`撤回 ${r.draft.company} · ${r.draft.period} · ${r.record_id}。原意见和草稿将保留。`;
        $('ledger-revoke').hidden=false;
        $('ledger-reason').value='';controls();$('ledger-reason').focus();
      };
      li.append(revoke);
    }
    $('ledger-records').append(li);
  }
  controls();
}
const messages={REVIEW_AUTH_REQUIRED:'本机凭据不正确，请重新连接。',REVIEW_LIMIT:'本机记录已达 100 条上限。请保存现有记录，按说明建立另一私有目录。',REVIEW_ALREADY_REVOKED:'该意见已经撤回，请刷新记录。',REVIEW_REQUEST_CONFLICT:'请求编号对应不同内容，已拒绝写入。',REVIEW_STORE_UNAVAILABLE:'本机记录暂不可读写，请检查服务后重试。'};
async function perform(task) {
  if (busy) return;
  const mine=epoch;
  let correctionTarget;
  busy=true;active=new AbortController();controls();status('正在读取或写入本机记录…');
  try { await task(); }
  catch (error) {
    if (mine!==epoch) return;
    correctionTarget=error.correctionTarget;
    status((correctionTarget ? '内容校验未通过，未写入。输入已保留；请检查意见、撤回原因及草稿内容，修正后重新保存。（REVIEW_INVALID）' : messages[error.message] || '请求未完成。请检查本机服务。') + (pending ? ' 写入结果待确认；重试沿用同一编号，不会新增重复记录。' : ''),true);
  } finally { if (mine===epoch) {
    busy=false;active=null;controls();
    if (correctionTarget) {
      $(correctionTarget).focus();
      $(correctionTarget).scrollIntoView({block:'center'});
    }
  } }
}
async function refresh(mine) {
  const result=await request('./api/reviews');
  if (mine!==epoch) return;
  records=result.records;render();status(`已连接 ${result.reviewer}（本机配置身份），读取 ${records.length} 条记录。`);
}
function mutate() {
  const mine=epoch;
  return perform(async()=>{
    const operation=pending;
    try {
      await request(operation.path,operation.body);
    } catch (error) {
      if (mine!==epoch) return;
      // Only this known validation response proves a first attempt did not write.
      // A later refusal cannot resolve an earlier lost response or failed refresh.
      if (!operation.uncertain && error.httpStatus===422 && error.message==='REVIEW_INVALID') {
        pending=null;
        error.correctionTarget=operation.path.endsWith('/revoke') ? 'ledger-reason' : 'ledger-note';
      } else operation.uncertain=true;
      throw error;
    }
    if (mine!==epoch) return;
    operation.uncertain=true; // Keep the ID if the following read fails.
    // Read current state, including any intervening revocation; not a stale retry receipt.
    await refresh(mine);
    if (mine!==epoch) return;
    pending=null;revokeId=null;$('ledger-revoke').hidden=true;clearStagedReview();
    status('本机记录已更新；原始草稿仍待核验，不准入财务计算。');
  });
}
export function bindReviewLedger() {
  if (panel) return;
  panel=node('details',undefined,{id:'review-ledger',class:'review-ledger'});
  panel.append(node('summary','本机审核记录'));
  panel.append(node('p','保存核对意见或要求修订，可查询和撤回。身份是本机配置的操作人；这些意见不认证来源许可、财务事实或组织身份。',{class:'small'}));
  panel.append(node('p','正在识别运行方式…',{id:'ledger-availability',class:'small'}));
  panel.append(node('a','启用与数据保管说明',{href:'https://github.com/leon1111-wgl/finevidence/blob/main/docs/LOCAL_REVIEW_LEDGER.md',target:'_blank',rel:'noopener noreferrer'}));
  const auth=node('div',undefined,{id:'ledger-auth',hidden:''});
  auth.append(node('label','本机审核凭据（不是模型 API 密钥）',{for:'ledger-token'}));
  auth.append(node('input',undefined,{id:'ledger-token',type:'password',maxlength:'256',autocomplete:'off'}));
  for (const[id,label]of [['connect','连接记录'],['refresh','刷新记录'],['disconnect','断开并清空凭据']])
    auth.append(node('button',label,{id:'ledger-'+id,type:'button',class:'secondary'}));
  panel.append(auth,node('p','尚未连接；没有读取本机记录。',{id:'ledger-status',role:'status',class:'small'}));
  const actions=node('div',undefined,{id:'ledger-actions',hidden:''});
  actions.append(node('p','从已保存草稿选择“登记审核意见”，先核对原页再填写。',{id:'ledger-selection',class:'digest'}));
  actions.append(node('label','核对意见类别',{for:'ledger-observation'}));
  const select=node('select',undefined,{id:'ledger-observation'});
  for (const[k,v] of Object.entries(labels))select.append(node('option',v,{value:k}));
  actions.append(select,node('label','说明核对范围、发现的问题和未确认事项（必填）',{for:'ledger-note'}));
  actions.append(node('textarea',undefined,{id:'ledger-note',maxlength:'2000',rows:'3'}));
  actions.append(node('button','保存本机审核意见',{id:'ledger-submit',type:'button'}));
  const rev=node('div',undefined,{id:'ledger-revoke',hidden:''});
  rev.append(node('p','',{id:'ledger-revoke-target',class:'digest'}),node('label','撤回原因（必填）',{for:'ledger-reason'}),node('textarea',undefined,{id:'ledger-reason',maxlength:'2000',rows:'2'}));
  rev.append(node('button','确认撤回并保留历史',{id:'ledger-confirm-revoke',type:'button',class:'secondary'}),node('button','取消撤回',{id:'ledger-cancel-revoke',type:'button',class:'secondary'}));
  actions.append(rev,node('button','重试待确认请求',{id:'ledger-retry',type:'button',class:'secondary',hidden:''}));
  panel.append(actions,node('p','',{id:'ledger-count',class:'small'}),node('ol',undefined,{id:'ledger-records'}));
  const footer = $('workspace').querySelector('footer');
  if (footer) footer.before(panel); else $('workspace').append(panel);
  $('ledger-connect').onclick=()=>{
    credential=$('ledger-token').value;$('ledger-token').value='';records=[];render();
    const mine=epoch;perform(()=>refresh(mine));
  };
  $('ledger-refresh').onclick=()=>{const mine=epoch;perform(()=>refresh(mine));};
  $('ledger-disconnect').onclick=()=>{
    epoch++;active?.abort();active=null;busy=false;credential='';pending=null;records=[];revokeId=null;
    $('ledger-token').value='';$('ledger-note').value='';$('ledger-reason').value='';$('ledger-revoke').hidden=true;
    clearStagedReview();render();status('已断开。未确认的写入可能已完成；重新连接后先查询记录。');
  };
  $('ledger-submit').onclick=()=>{
    if (!staged || !credential || pending || busy) return;
    if (!$('ledger-note').value.trim()) {status('请说明核对范围与未确认事项。',true);return;}
    pending={path:'./api/reviews',body:{request_id:crypto.randomUUID(),draft:staged,observation:$('ledger-observation').value,note:$('ledger-note').value}};
    mutate();
  };
  $('ledger-confirm-revoke').onclick=()=>{
    if (!revokeId || pending || busy) return;
    if (!$('ledger-reason').value.trim()) {status('请填写撤回原因。',true);return;}
    pending={path:'./api/reviews/revoke',body:{request_id:crypto.randomUUID(),record_id:revokeId,reason:$('ledger-reason').value}};
    mutate();
  };
  $('ledger-cancel-revoke').onclick=()=>{if(busy||pending)return;revokeId=null;$('ledger-revoke').hidden=true;controls();};
  $('ledger-retry').onclick=()=>{if(pending)mutate();};
  window.addEventListener('pagehide', () => $('ledger-disconnect').onclick());
  render();controls();
}
