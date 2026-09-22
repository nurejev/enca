// Policy workspace, evidence desk and guided rollout. State stays in this session;
// all tenant operations are handed to the existing tool and confirmation flow.
const Workspace = (() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let api, current, inspected = null, inspectorTab = "Settings", reviewIndex = 0, step = 0, checks = new Set();
  let sourceBusy = false, sourceMessage = '', tenantRevision = 0;
  const state = s => ({on:"On",report:"Report-only",off:"Off"}[s] || s);
  function init(callbacks) {
    api = callbacks;
    $('workspaceMenu').addEventListener('click', () => {
      const open = document.body.classList.toggle('workspace-nav-open');
      $('workspaceMenu').setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !document.body.classList.contains('workspace-nav-open')) return;
      event.preventDefault();
      document.body.classList.remove('workspace-nav-open');
      $('workspaceMenu').setAttribute('aria-expanded', 'false');
      $('workspaceMenu').focus();
    });
    $('sideNav').addEventListener('click', e => {
      if (e.target.closest('button')) { document.body.classList.remove('workspace-nav-open'); $('workspaceMenu').setAttribute('aria-expanded','false'); }
    });
    $('workspaceInspector').addEventListener('click', e => {
      const tab=e.target.closest('[data-inspector-tab]');if(tab){inspectorTab=tab.dataset.inspectorTab;renderInspector();$('workspaceInspector').querySelector('[aria-selected=true]')?.focus();return;}
      const dep=e.target.closest('.dep-link');if(dep){api.dependency?.(dep.dataset.dept,dep.dataset.depid,dep.dataset.deplabel);return;}
      if(e.target.closest('[data-inspector-close]')) { const id=inspected;inspected=null;renderInspector();[...document.querySelectorAll('#ptable [data-open]')].find(b=>b.dataset.open===id)?.focus(); }
      if(e.target.closest('[data-inspector-detail]') && inspected) api.detail(inspected);
    });
    $('rolloutSteps').addEventListener('click', e => {
      const b=e.target.closest('[data-rollout-step]'); if(!b)return;
      step=Number(b.dataset.rolloutStep);renderRollout();
    });
    $('rolloutBody').addEventListener('change', e => {
      if(!e.target.matches('[data-rollout-check]'))return;
      e.target.checked?checks.add(e.target.dataset.rolloutCheck):checks.delete(e.target.dataset.rolloutCheck);
      renderRollout(e.target.dataset.rolloutCheck);
    });
    $('rolloutBody').addEventListener('click', e => {
      const b=e.target.closest('[data-rollout-action]');if(!b)return;
      const action=b.dataset.rolloutAction;
      if(action==='joey'){return prepareJoey();}
      else if(action==='cloudfellows'){if(!sourceBusy)api.action('cloudfellows');}
      else if(action==='next'){step=Math.min(3,step+1);renderRollout();}
      else if(action==='state'){if(checks.size===3 && current.selected.size)api.state();}
      else api.action(action);
    });
    document.querySelectorAll('[data-workspace-tool]').forEach(b=>b.addEventListener('click',()=>api.action(b.dataset.workspaceTool)));
  }
  function update(data) {
    if(current && (current.tenantKey!==data.tenantKey || current.tenant!==data.tenant || current.demo!==data.demo)){checks.clear();inspected=null;step=0;sourceMessage='';tenantRevision++;if(typeof ListDetail!=='undefined')ListDetail.reset();}
    if(current && (current.readAt!==data.readAt || [...current.selected].join()!==[...data.selected].join()))checks.clear();
    current={...data,selected:new Set(data.selected)};
    $('workspaceContext').textContent=data.tenant?`${data.tenant} · ${data.demo?'Demo · sample data':APP_BUILD.isBeta?'Beta':'Live'}`:'';
    $('workspaceContext').hidden=!data.tenant;
    $('workspaceMenu').hidden=!data.tenant;
    const p=data.policies;
    $('workspaceRead').textContent=`${data.demo?'Sample snapshot':'Policy snapshot'} · ${data.readAt?new Date(data.readAt).toLocaleString():'not read'}`;
    $('workspaceCounts').innerHTML=[['Policies',p.length],['On',p.filter(x=>x.state==='on').length],['Report-only',p.filter(x=>x.state==='report').length],['Off',p.filter(x=>x.state==='off').length]].map(([label,n])=>`<div><span>${label}</span><strong>${n}</strong></div>`).join('');
    $('workspaceListMeta').textContent=`${data.visible.length} policies shown · ${data.selected.size} selected`;
    $('workspaceHeading').hidden=data.view==='analyze';
    $('workspaceCounts').hidden=data.view==='analyze';
    $('workspaceListMeta').hidden=data.view==='analyze';
    $('workspaceInspector').hidden=data.view!=='list';
    $('policyWorkspace').classList.toggle('with-inspector',data.view==='list'&&!!inspected);
    renderInspector();
    if($('screen-rollout').classList.contains('active'))renderRollout();
    document.dispatchEvent(new Event('enca:workspace-updated'));
  }
  function inspect(id) { inspected=id;renderInspector();if(typeof matchMedia!=='undefined'&&matchMedia('(max-width:900px)').matches){$('workspaceInspector').scrollIntoView({block:'start'});$('workspaceInspector').querySelector('button')?.focus();} }
  // THE ROW WHOSE POLICY IS OPEN ON THE RIGHT STAYS MARKED ON THE LEFT
  // (25466, Mihai: "when selecting a policy, it should stay highlighted").
  // The list is redrawn on every refresh — a tick in a checkbox, a filter,
  // a search, a state chip — so a class added on the click would be wiped by
  // the very next redraw. It is re-applied from `inspected` here instead,
  // and this runs after every redraw because refreshViews writes the table
  // and only then calls Workspace.update → renderInspector. aria-current
  // carries the same fact to a screen reader. Back to results clears it,
  // since that sets inspected to null and comes back through here.
  function markInspectedRow() {
    document.querySelectorAll('#ptable tr.is-inspected').forEach(r=>{r.classList.remove('is-inspected');r.removeAttribute('aria-current');});
    if(!inspected||!current||current.view!=='list')return;
    const b=[...document.querySelectorAll('#ptable [data-open]')].find(x=>x.dataset.open===inspected);
    const tr=b&&b.closest('tr');
    if(tr){tr.classList.add('is-inspected');tr.setAttribute('aria-current','true');}
  }
  function renderInspector() {
    const host=$('workspaceInspector');
    const p=current?.visible.find(p=>p.id===inspected);
    host.hidden=!p || current.view!=='list';
    $('policyWorkspace').classList.toggle('with-inspector',!!p&&current.view==='list');
    markInspectedRow();
    if(!p)return;
    host.dataset.section=inspectorTab;
    host.innerHTML=`<div class="workspace-panel-head"><button class="btn sm" data-inspector-close>Back to results</button><button class="btn sm" data-inspector-detail>Open wide & actions</button></div>
      <h2>${esc(p.name)}</h2><span class="state ${esc(p.state)}">${state(p.state)}</span>
      <div class="wp-tabs" role="tablist" aria-label="Policy settings">${['Settings','Assignments','Conditions','Controls','Definition'].map(t=>`<button role="tab" id="wp-tab-${t}" aria-controls="wp-content" aria-selected="${inspectorTab===t}" data-inspector-tab="${t}">${t}</button>`).join('')}</div>
      <div id="wp-content" role="tabpanel" aria-labelledby="wp-tab-${inspectorTab}">${typeof Render!=='undefined'?Render.card(p,current.tenant):''}
      <pre ${inspectorTab==='Definition'?'':'hidden'}>${esc(JSON.stringify(p.raw,null,2))}</pre></div>`;

  }
  function review(result,filter,categories,meta={}) {
    const order={critical:0,high:1,medium:2,low:3,info:4};
    const list=result.findings.filter(f=>(filter==='all'||f.severity===filter)&&(!categories?.length||categories.includes(f.category))).sort((a,b)=>(order[a.severity]??5)-(order[b.severity]??5));
    if(!list.length)return '<div class="workspace-empty">No findings match these filters. This is a configuration review; it does not prove effective access.</div>';
    reviewIndex=Math.min(reviewIndex,list.length-1);
    const f=list[reviewIndex];
    return `<div class="review-desk"><div class="review-queue" aria-label="Findings, ordered by severity">${list.map((f,i)=>`<button data-review-pick="${i}" aria-pressed="${i===reviewIndex}" class="review-item ${i===reviewIndex?'active':''}"><span class="review-severity ${esc(f.severity)}">${esc(f.severity)}</span><b>${esc(f.title)}</b><small>${esc(f.policyName)}</small></button>`).join('')}</div>
      <article class="review-evidence"><span class="workspace-eyebrow">${esc(f.category)} · Configuration evidence</span><h2>${esc(f.title)}</h2><p class="workspace-native">${esc(f.policyName)}</p>
      <div class="workspace-source">Source: policy snapshot + Bypass & Swiss cheese rules.<br>${meta.readAt?`Read ${esc(new Date(meta.readAt).toLocaleString())}. `:''}${meta.demo?'Sample data. ':''}${meta.incomplete?'Context incomplete: '+esc(meta.incomplete):'Context read for this review.'} Sign-in impact and effective membership are separate checks.</div>
      <h3>What was found</h3><p>${esc(f.description)}</p><h3>Recommended next step</h3><p>${esc(f.recommendation)}</p>
      ${f.policyId?`<button class="btn primary pol-link" data-polid="${esc(f.policyId)}">Inspect affected policy →</button>`:''}
      <details><summary>How to interpret this result</summary><p>This rule inspects configuration. Review exclusions, actual group membership and sign-in evidence before changing enforcement. No compliance certification or effective-access guarantee is implied.</p></details></article></div>`;
  }
  function pickReview(index){reviewIndex=index;}
  function openRollout(){renderRollout();}
  async function prepareJoey() {
    if(sourceBusy || !current)return;
    const revision=tenantRevision;
    sourceBusy=true;sourceMessage='Fetching the latest Joey release…';renderRollout();
    try {
      const result=await api.fetchJoey(message=>{
        if(revision!==tenantRevision)return;
        sourceMessage=message;renderRollout();
      });
      if(revision!==tenantRevision)return;
      const {status,bundle}=result;
      if(status.error || status.status!=='live')throw new Error(status.error || 'The latest release could not be read.');
      if(!bundle?.complete || !bundle.policies?.length || bundle.depSkipped?.length)throw new Error('The release or its dependencies are incomplete. Retry Fetch latest before importing.');
      sourceMessage=`Joey ${bundle.release} · ${String(bundle.commit || '').slice(0,7)} · ${bundle.policies.length} policies fetched. Review the import before making changes: groups are created by name and attached, and the shared E-Admins policies can be added there from the CloudFellows ZIP.`;
      await api.prepareJoey(bundle);
    } catch(error) {
      if(revision===tenantRevision)sourceMessage=`Could not prepare Joey: ${error.message || error} No older snapshot was opened. Retry Fetch latest.`;
    } finally {
      sourceBusy=false;renderRollout();
    }
  }
  function renderRollout(focusCheck) {
    if(!current)return;
    const picked=current.policies.filter(p=>current.selected.has(p.id));
    const impact=api.impact();
    $('rolloutSteps').innerHTML=['Scope','Plan','Observed impact','Go live'].map((name,i)=>`<button data-rollout-step="${i}" aria-current="${step===i?'step':'false'}" class="${step===i?'active':''}"><span>${i+1}</span>${name}</button>`).join('');
    const head=`<div class="workspace-source">${esc(current.tenant)} · ${current.demo?'Demo — writes are simulated':'Tenant changes use the existing confirmation flow'} · ${picked.length} selected policies</div>`;
    const selection=`<div class="rollout-selection">${picked.length?picked.map(p=>`<div><b>${esc(p.name)}</b><span class="state ${esc(p.state)}">${state(p.state)}</span></div>`).join(''):'No policies selected. Choose policies in the policy workspace, or prepare a new baseline import.'}</div>`;
    const action=(key,label,primary=false)=>`<button class="btn ${primary?'primary':''}" data-rollout-action="${key}">${label}</button>`;
    const sources=`<section class="rollout-sources" aria-label="Baseline policy sources"><h3>Start from a baseline</h3><div class="rollout-source-grid"><article><h4>CloudFellows</h4><p>Load policies and dependencies from your baseline backup ZIP.</p><button class="btn primary" data-rollout-action="cloudfellows" ${sourceBusy?'disabled':''}>Choose ZIP</button></article><article><h4>Joey Verlinden</h4><p>Fetch the latest release, including policies, groups and named locations.</p><button class="btn primary" data-rollout-action="joey" ${sourceBusy?'disabled':''}>${sourceBusy?'Fetching…':'Fetch latest'}</button></article></div><p class="workspace-source">Review the imported policies and assignment mode before applying them. Source policies are separate from the existing tenant selection above. A Joey import creates his groups by name and attaches them; add the shared E-Admins policies in its import dialog with ＋ E-Admins from the CloudFellows ZIP.</p><p role="status" aria-live="polite">${esc(sourceMessage)}</p></section>`;
    let content;
    if(step===0)content=`<h2>Start with a deliberate scope</h2><p>Select the policies for this rollout. Keep emergency access and exclusions visible throughout the change.</p>${selection}<div class="workspace-actions">${action('policies','Choose policies',true)}${action('baseline','Compare a baseline')}${action('guide','Check deployment prerequisites')}</div>`;
    if(step===1)content=`<h2>Prepare the plan and rollback</h2><p>Export the current definitions, review dependencies, and stage new policies. Imports create disabled policies first and read them back before restoring an approved replacement state.</p>${selection}<div class="workspace-actions">${action('backup','Back up selected policies',true)}${action('import','Prepare an import')}${action('groups','Review groups & exclusions')}</div><p class="workspace-source">A backup is a file you must keep. ENCA does not automatically certify that you saved it or that rollback has been tested.</p>`;
    if(step===2)content=`<h2>Read what report-only would change</h2><p>Use observed sign-ins for the proposed scope. A window with no matching sign-ins gives no evidence of a safe rollout.</p><div class="rollout-metrics">${impact?`<div><b>${impact.records}</b><span>sign-ins in the loaded window</span></div><div><b>${impact.blockedUsers}</b><span>users with a predicted denial</span></div><div><b>${impact.promptedUsers}</b><span>users with a predicted prompt</span></div>`:'No completed impact read in this session.'}</div><p class="workspace-source">${impact?`Read ${esc(new Date(impact.readAt).toLocaleString())}; ${impact.days} days. These totals describe the loaded impact report, not necessarily your selection. Open the report to confirm policy coverage, caps and unresolved records.`:'Impact is not checked yet. Read report-only impact before deciding to enforce.'}</p><div class="workspace-actions">${action('impact','Open report-only impact',true)}${action('checks','Review configuration findings')}${action('whatif','Test a sign-in scenario')}</div>`;
    if(step===3)content=`<h2>Review before enforcement</h2><p>These are your acknowledgements. They are not automated validation or a claim that the rollout is safe.</p>${selection}<div class="rollout-checks">${[['scope','I reviewed the selected policies, exclusions and emergency access.'],['backup','I saved the current definitions and have a rollback procedure.'],['impact','I reviewed sign-in impact and accept any missing evidence.']].map(([key,label])=>`<label><input type="checkbox" data-rollout-check="${key}" ${checks.has(key)?'checked':''}>${label}</label>`).join('')}</div><button class="btn primary" data-rollout-action="state" ${checks.size!==3||!picked.length?'disabled':''}>Review policy state change →</button><p class="workspace-source">The next screen names each proposed state. Its confirmation and permission checks still apply. Refreshing the policy snapshot or changing selection clears these acknowledgements.</p>`;
    $('rolloutBody').innerHTML=head+`<div class="rollout-content">${content}${step<2?sources:''}${step<3?`<div class="rollout-next">${action('next','Continue →')}</div>`:''}</div>`;
    if(focusCheck)$('rolloutBody').querySelector(`[data-rollout-check="${focusCheck}"]`)?.focus();
  }
  return {init,update,inspect,review,pickReview,openRollout,
    get context(){return current?{tenant:current.tenant,demo:current.demo,key:current.tenantKey||current.tenant,readAt:current.readAt}:null;}
  };
})();
