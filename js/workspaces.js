/* Workspaces: session-aware navigation around ENCA's existing tools/actions. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = key => FlatIcons.tool(key);
  const blurbs = {
    toolPolicies: 'View policies as a list, cards or settings matrix.',
    toolAnalyze: 'See which policies apply to users and where coverage is missing.',
    toolWhatIf: 'Explore the outcome of a sign-in scenario.',
    toolWhoIs: 'Trace a person’s Conditional Access scope.',
    toolSpGap: 'Find referenced apps without a service principal.',
    toolGroupUse: 'Find where a user or group is used.',
    toolExclusions: 'Inspect exclusions and the policies that use them.',
    toolAudit: 'Inspect policy changes and configuration drift.',
    toolSignins: 'Explore sign-in failures and report-only impact.',
    toolGapCheck: 'Run the existing configuration and baseline checks.',
    toolBaseline: 'Compare the tenant with the available baseline catalogs.',
    toolCaGroups: 'Inspect and manage Conditional Access groups.',
    toolProtect: 'Manage protection of exclusion groups.',
    toolLocations: 'Manage named locations, strengths, contexts and terms of use.',
    toolRmau: 'Inspect and manage restricted administrative units.',
    toolUserImpact: 'Prepare a policy-based user impact brief.',
    toolImport: 'Import policies and dependencies with the existing review steps.',
    toolDeploy: 'Prepare a rollout using the existing guided workflow.',
    toolSmsVoice: 'Assess the impact of SMS and voice retirement.',
    toolMemberOf: 'Find memberOf rules and their dependent services.',
    toolChangelog: 'Read the release history.',
    toolRoadmap: 'See what is planned and what has shipped.',
    toolPermissions: 'View session permissions, consent and revocation guidance.',
    toolHelp: 'Find guidance, permissions and release information.',
  };
  const recent = [];
  let lastActive = null;
  let initialized = false;
  let tools = [];
  let sessionKey = '';

  function synchronizeBranding() {
    const brand = typeof Brand !== 'undefined' ? Brand.current : null;
    if (!brand || !$('wcBrandName')) return;
    $('wcBrandName').textContent = brand.name || 'ENCA';
    // The original image stays connected to ENCA's live branding updates.
    // Inherit its logo, wordmark dimensions and theme-specific asset swap.
    document.body.classList.toggle('wc-wide-logo', !!brand.logoWide);
  }

  function openTool(id) {
    if (!document.body.classList.contains('with-side')) return;
    const original = $('side-' + id) || $(id);
    if (!original) return;
    if ($('wcLauncher').open) $('wcLauncher').close();
    original.click(); // The existing app owns the route, subtab and state.
  }
  const card = t => `<button type="button" class="wc-tool" data-wc-tool="${esc(t.id)}"><span class="wc-tool-icon" aria-hidden="true">${icon(t.id)}</span><strong>${esc(t.name)}</strong><span>${esc(t.description)}</span><small>${esc(t.number || t.group)}</small></button>`;
  function readTools() {
    let group = '';
    return [...document.querySelectorAll('#screen-home .tool-sec, #screen-home .tools > .tool[id]')].flatMap(el => {
      if (el.classList.contains('tool-sec')) { group = el.querySelector('h3').textContent.trim(); return []; }
      const side = $('side-' + el.id);
      if (!side) return [];
      return [{id:el.id, name:side.querySelector('.sn-txt').textContent.trim(), icon:side.querySelector('.sn-ic').textContent.trim(), number:side.querySelector('.sn-t')?.textContent.trim() || '', group, description:blurbs[el.id] || ''}];
    });
  }
  function renderLauncher() {
    const q = $('wcSearch').value.trim().toLowerCase();
    const matches = tools.filter(t => [t.name,t.group,t.number,t.description].join(' ').toLowerCase().includes(q));
    $('wcTools').innerHTML = matches.length ? [...new Set(matches.map(t=>t.group))].map(group=>`<section><h3>${esc(group)}</h3><div class="wc-tool-grid">${matches.filter(t=>t.group===group).map(card).join('')}</div></section>`).join('') : '<p class="wc-no-results">No tools match this search.</p>';
    $('wcResultCount').textContent = `${matches.length} tools`;
  }
  function renderRecent() {
    $('wcRecent').innerHTML = recent.length ? recent.map(id => {
      const t=tools.find(t=>t.id===id); if(!t)return '';
      return `<button type="button" class="wc-recent" data-wc-tool="${esc(id)}"><span aria-hidden="true">${icon(t.id)}</span><span><strong>${esc(t.name)}</strong><small>Opened this session</small></span><span aria-hidden="true">↗</span></button>`;
    }).join('') : '<div class="wc-empty"><span aria-hidden="true">↗</span><h3>Your next session starts here.</h3><p>Tools you open appear here for a quick return.</p><button type="button" class="wc-text-button" data-wc-tool="toolPolicies">Open Policies →</button></div>';
  }
  function synchronize() {
    if (!initialized) return;
    const signedIn = document.body.classList.contains('with-side');
    const context = Workspace.context;
    const key = signedIn && context ? `${context.demo}:${context.key}` : '';
    if (key !== sessionKey) {
      sessionKey = key; ListDetail.reset(); recent.length = 0; lastActive = null; renderRecent();
    }
    const theme = $('themeBtn');
    if (signedIn && theme.parentElement !== $('acctMenu')) {
      theme.setAttribute('role','menuitem');$('acctMenu').insertBefore(theme,$('signOutBtn'));
    } else if (!signedIn && theme.parentElement === $('acctMenu')) {
      theme.removeAttribute('role');document.querySelector('header .hwrap').insertBefore(theme,$('tenantBox'));
    }
    if (!signedIn) {
      $('wcLauncher').open && $('wcLauncher').close();
      $('toolNav').style.display='none';
      return;
    }
    const active = $('toolNav').querySelector('.toolnav-tab.active [data-nav]')?.dataset.nav || '';
    const home = $('screen-home').classList.contains('active');
    document.querySelectorAll('#wcRail button[data-wc-tool]').forEach(button => {
      const on = !home && button.dataset.wcTool === active;
      button.classList.toggle('active',on);
      on ? button.setAttribute('aria-current','page') : button.removeAttribute('aria-current');
    });
    $('wcHomeButton').classList.toggle('active',home);
    home ? $('wcHomeButton').setAttribute('aria-current','page') : $('wcHomeButton').removeAttribute('aria-current');
    if(active && active !== lastActive && !home) {
      lastActive = active;
      const index=recent.indexOf(active); if(index>=0)recent.splice(index,1);
      recent.unshift(active); recent.splice(5);
      renderRecent();
    }
    const demo = !!context?.demo;
    const tenant = context?.tenant || $('tenantName').textContent || 'Workspace';
    $('wcTenant').textContent = tenant;
    $('wcAccountLabel').textContent = (demo ? tenant.replace(/\s*\(demo\)$/i,'') : tenant) + (demo ? ' · Demo' : '');
    $('wcEnvironment').textContent = demo ? 'Demo · sample data' : 'Tenant · policy snapshot';
    $('wcSnapshotNote').textContent = demo ? 'ENCA’s demo policies. Changes in this session are simulated.' : 'Policies loaded from your tenant. Refresh Policies to read the latest settings.';
    $('wcSessionNote').textContent = demo ? 'Demo · changes are simulated' : 'Signed in · tenant actions use the existing confirmation steps';
    $('acctBtn').setAttribute('aria-label',$('wcAccountLabel').textContent + ' — account options');
    // Keep ENCA's tab elements and delegated handlers. Only their presentation
    // changes; Overview remains present, as in the selected Workspaces mockup.
    const nav=$('toolNav');
    nav.style.display='block';
    const overview=nav.querySelector('[data-navhome]');
    if(overview){
      overview.innerHTML=icon('overview')+'<span>Overview</span>';
      overview.setAttribute('aria-label','Overview');overview.title='Overview';
      overview.setAttribute('aria-current',home?'page':'false');
    }
    nav.querySelectorAll('.toolnav-tab [data-nav]').forEach(button=>{
      const t=tools.find(t=>t.id===button.dataset.nav);
      if(t)button.innerHTML=icon(t.id)+`<span>${esc(t.name)}</span>`;
      button.setAttribute('aria-current',button.dataset.nav===active&&!home?'page':'false');
    });
    $('wcCloseAll').disabled=!nav.querySelector('[data-close]');
    document.querySelectorAll('#toolNav [data-close]').forEach(button=>{
      const t=tools.find(t=>t.id===button.dataset.close);
      button.setAttribute('aria-label',`Close ${t?.name || 'tool'} tab`);
    });
    // Many workspaces stay on one scrollable row. Re-check after decorating
    // labels, whose widths differ from the native emoji labels, without
    // changing the tool's remembered vertical scroll position.
    const strip=nav.querySelector('.toolnav-inner');
    const tab=nav.querySelector('.toolnav-tab.active');
    if (home && strip) strip.scrollLeft=0;
    else if (strip && tab) {
      const bounds=strip.getBoundingClientRect(), target=tab.getBoundingClientRect();
      const left=bounds.left+(overview?.offsetWidth || 0)+12;
      if (target.left<left) strip.scrollLeft+=target.left-left;
      else if (target.right>bounds.right-12) strip.scrollLeft+=target.right-bounds.right+12;
    }
  }
  function initialize() {
    if(initialized || !$('side-toolPolicies'))return;
    tools=readTools();
    initialized=true;
    document.body.classList.add('workspaces-shell');
    const rail=document.createElement('nav');rail.id='wcRail';rail.setAttribute('aria-label','Workspace navigation');
    // Work order, not the order tools were added in: what exists (Policies,
    // Sign-ins), who it reaches (Who is…), what is wrong with it (Checks),
    // then what to change (Baseline, CA groups, Building blocks).
    const shortcuts=[['toolPolicies','🗂','Policies'],['toolSignins','🚦','Sign-ins'],['toolWhoIs','🕵','Who is…'],['toolGapCheck','🛡','Checks'],['toolBaseline','🧬','Baseline'],['toolCaGroups','👥','CA groups'],['toolLocations','🧩','Building blocks']];
    rail.innerHTML=`<button type="button" id="wcHomeButton" data-wc-home><span aria-hidden="true">${FlatIcons.tool("home")}</span><small>Home</small></button>${shortcuts.map(([id,icon,label])=>`<button type="button" data-wc-tool="${id}" aria-label="${esc(tools.find(t=>t.id===id)?.name || label)}"><span aria-hidden="true">${FlatIcons.tool(id)}</span><small>${label}</small></button>`).join('')}<span class="wc-rail-divider"></span><button type="button" data-wc-library><span aria-hidden="true">${FlatIcons.tool("overview")}</span><small>All tools</small></button><button type="button" data-wc-tool="toolHelp"><span aria-hidden="true">${FlatIcons.tool("toolHelp")}</span><small>Help</small></button><span class="wc-rail-caption">WORKSPACES<br>01</span>`;
    document.body.append(rail);
    const brand=document.createElement('span');brand.className='wc-brand';
    brand.innerHTML='<span id="wcBrandName">ENCA</span>';
    brand.prepend($('brandLogo'));
    $('logoHome').append(brand);
    synchronizeBranding();
    document.addEventListener('enca:brand-updated',synchronizeBranding);
    new MutationObserver(synchronizeBranding).observe($('brandTag'),{childList:true,characterData:true,subtree:true});
    const header=document.querySelector('header .hwrap');
    const context=document.createElement('span');context.className='wc-header-context';context.textContent='Conditional Access / Workspaces';
    $('logoHome').after(context);
    const allTools=document.createElement('button');allTools.type='button';allTools.id='wcHeaderTools';allTools.dataset.wcLibrary='';
    allTools.innerHTML=icon('overview')+'<span>All tools</span>';
    header.insertBefore(allTools,$('tenantBox'));
    const accountLabel=document.createElement('span');accountLabel.id='wcAccountLabel';
    $('acctBtn').prepend(accountLabel);
    // Account settings remain available, without adding controls to the
    // mockup's uncluttered top bar. The existing theme handler is retained.
    const theme=$('themeBtn');theme.setAttribute('role','menuitem');
    const themeLabel=document.createElement('span');themeLabel.textContent=' Theme';theme.append(themeLabel);
    const menu=$('acctMenu');menu.insertBefore(theme,$('signOutBtn'));
    const connection=document.createElement('div');connection.id='wcConnection';connection.className='wc-connection';
    menu.insertBefore(connection,$('copyTenantBtn'));
    let connectionRequest=0;
    $('acctBtn').addEventListener('click',async()=>{
      if(menu.hidden)return;
      const request=++connectionRequest,key=sessionKey;
      if(Workspace.context?.demo){connection.textContent='Demo · no app connection';return;}
      connection.innerHTML='<span class="wc-eyebrow">Connected app</span><span>Loading registration…</span>';
      const info=await Graph.connectionInfo();
      if(request!==connectionRequest||key!==sessionKey)return;
      const own=info.ownerTenantId&&info.ownerTenantId.toLowerCase()===String(Workspace.context?.key||'').toLowerCase();
      const type=info.ownerTenantId?(own?'App registration in this tenant':(/^AzureADMultipleOrgs$|^AzureADandPersonalMicrosoftAccount$/.test(info.audience)?'Multitenant app in another tenant':'App registration in another tenant')):'App owner unavailable';
      connection.innerHTML=`<span class="wc-eyebrow">Connected app</span><strong>${esc(info.name||'Application')}</strong><span class="wc-connection-id">${esc(info.clientId)}</span><span>${esc(type)}</span>${info.ownerTenantId?`<span>Owner tenant: ${own?esc(Workspace.context.tenant)+' · ':''}<span class="wc-connection-id">${esc(info.ownerTenantId)}</span></span>`:'<span>Registration details could not be read with this session.</span>'}`;
    });
    const closeAll=document.createElement('button');closeAll.type='button';closeAll.id='wcCloseAll';closeAll.setAttribute('role','menuitem');closeAll.textContent='Close all workspaces';
    closeAll.addEventListener('click',()=>{
      const all=$('toolNav').querySelector('[data-navcloseall]');
      if(all)all.click();else $('toolNav').querySelector('[data-close]')?.click();
    });
    menu.insertBefore(closeAll,$('signOutBtn'));
    const note=document.createElement('p');note.className='wc-account-note';note.id='wcSessionNote';menu.append(note);
    const home=document.createElement('div');home.id='wcHome';
    home.innerHTML=`<div class="wc-home-heading"><div><div class="wc-eyebrow" id="wcTenant"></div><h1>Conditional Access overview</h1><p id="wcHomeLead"></p></div><span class="wc-demo"><span></span>Demo · sample data</span></div><div class="wc-home-layout"><aside class="wc-recent-panel"><h2>Recent tools</h2><div id="wcRecent"></div><div class="wc-session"><span class="wc-eyebrow">Current snapshot</span><div id="wcSnapshot"></div><p>ENCA’s existing demo policies.<br>Changes in this session are simulated.</p></div></aside><section class="wc-library"><div class="wc-section-heading"><h2>All ${tools.length} tools</h2><span class="wc-section-actions"><button type="button" id="wcToggleLibrary" class="wc-text-button" aria-expanded="false" aria-controls="wcOverviewTools">Show</button><button type="button" id="wcToggleGroups" class="wc-text-button" hidden>Collapse all</button></span></div><div id="wcOverviewTools" hidden>${[...new Set(tools.map(t=>t.group))].map(group=>`<details class="wc-tool-group" open><summary>${esc(group)} <span>${tools.filter(t=>t.group===group).length} tools</span></summary><div class="wc-tool-grid">${tools.filter(t=>t.group===group).map(card).join('')}</div></details>`).join('')}</div></section></div><div class="wc-home-foot"><span>Open tools stay in the tabs above your workspace.</span><button type="button" class="wc-text-button" data-wc-tool="toolHelp">ENCA help →</button></div>`;
    $('screen-home').prepend(home);
    // The Overview (js/overview.js, 25419) renders into the home once this
    // layout exists — say so, rather than have it poll for us.
    document.dispatchEvent(new CustomEvent('enca:wchome'));
    // The library sits under the Overview, closed until asked for (25422):
    // the rail and the header keep All tools one press away, and a home page
    // that starts with forty cards buries what it just learned. The choice is
    // remembered per browser.
    const LIB_KEY='enca.wcLibraryOpen';
    const libToggle=$('wcToggleLibrary'),lib=$('wcOverviewTools'),layout=home.querySelector('.wc-home-layout');
    const setLib=(open)=>{lib.hidden=!open;libToggle.textContent=open?'Hide':'Show';libToggle.setAttribute('aria-expanded',String(open));$('wcToggleGroups').hidden=!open;layout.classList.toggle('lib-closed',!open);try{localStorage.setItem(LIB_KEY,open?'1':'0');}catch{}};
    let libOpen=false;try{libOpen=localStorage.getItem(LIB_KEY)==='1';}catch{}
    setLib(libOpen);
    libToggle.addEventListener('click',()=>setLib(lib.hidden));
    const toggleGroups=$('wcToggleGroups');
    const groups=[...home.querySelectorAll('.wc-tool-group')];
    const syncGroups=()=>{toggleGroups.textContent=groups.some(g=>g.open)?'Collapse all':'Expand all';};
    groups.forEach(g=>g.addEventListener('toggle',syncGroups));
    toggleGroups.addEventListener('click',()=>{const open=!groups.some(g=>g.open);groups.forEach(g=>g.open=open);syncGroups();});
    home.querySelector('.wc-demo').innerHTML='<span></span><span id="wcEnvironment"></span>';
    home.querySelector('.wc-session p').id='wcSnapshotNote';
    // Counts are copied from the app's own live-rendered policy summary.
    const syncCounts=()=>{ $('wcSnapshot').replaceChildren(...[...$('workspaceCounts').children].map(el=>el.cloneNode(true))); };
    syncCounts();new MutationObserver(syncCounts).observe($('workspaceCounts'),{childList:true,subtree:true,characterData:true});
    const dialog=document.createElement('dialog');dialog.id='wcLauncher';dialog.setAttribute('aria-labelledby','wcLauncherTitle');
    dialog.innerHTML='<div class="wc-launcher-head"><div><span class="wc-eyebrow">ENCA tool library</span><h2 id="wcLauncherTitle">Open a tool</h2></div><button type="button" id="wcCloseLauncher" aria-label="Close tool library">×</button></div><label class="wc-search-label" for="wcSearch">Find a tool</label><input id="wcSearch" type="search" placeholder="Search by name, task or tool number…"><p id="wcResultCount" role="status"></p><div id="wcTools"></div>';
    document.body.append(dialog);
    $('wcSearch').addEventListener('input',renderLauncher);
    $('wcCloseLauncher').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}
    });
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    document.addEventListener('click',e=>{
      if (!document.body.classList.contains('with-side')) return;
      const tool=e.target.closest('[data-wc-tool]'); if(tool){openTool(tool.dataset.wcTool);return;}
      if(e.target.closest('[data-wc-home]')){$('side-home').click();return;}
      if(e.target.closest('[data-wc-library]')){$('wcSearch').value='';renderLauncher();dialog.showModal();$('wcSearch').focus();}
    });
    renderRecent();
    new MutationObserver(synchronize).observe($('toolNav'),{childList:true});
    new MutationObserver(synchronize).observe($('screen-home'),{attributes:true,attributeFilter:['class']});
    new MutationObserver(synchronize).observe(document.body,{attributes:true,attributeFilter:['class']});
    document.addEventListener('enca:workspace-updated',synchronize);
    synchronize();
    window.dispatchEvent(new Event('resize'));
  }
  const ready=new MutationObserver(()=>{initialize();if(initialized)ready.disconnect();});
  ready.observe($('sideNav'),{childList:true});
  initialize();
  FlatIcons.start();
})();
