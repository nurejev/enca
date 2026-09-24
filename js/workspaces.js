/* Workspaces: session-aware navigation around ENCA's existing tools/actions.
   32407 (R67): two workspaces on one shell — 01 Conditional Access, the tools
   as they were, and 02 PIM-buddy, everything privileged access. One header,
   one rail, one strip of open tools; what changes is which tools the rail and
   the library offer, the home page, and the header colour. The tools, their
   data and their confirmation steps are untouched — a carry-over tool (CA
   groups, Checks, Changes …) is the same screen from either side. */
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
    toolPimBaseline: 'Match this tenant’s PIM role settings and PIM groups against the CloudFellows PIM framework.',
    toolChangelog: 'Read the release history.',
    toolRoadmap: 'See what is planned and what has shipped.',
    toolPermissions: 'View session permissions, consent and revocation guidance.',
    toolHelp: 'Find guidance, permissions and release information.',
  };
  // ---- 32407: the two workspaces ----------------------------------------
  // A tile belongs to 01 unless it is listed under PIM_ONLY; 02 offers the
  // roster below — its own tools plus the carry-overs, each with a blurb in
  // PIM words. A carry-over is the SAME module and keeps its T-number; the
  // "PIM lens" (a PIM-only catalogue, tab strip and Help text for it) is on
  // the roadmap, and the card says so rather than promising it.
  const WS_KEY = 'enca.workspace';
  const PIM_ONLY = new Set(['toolPimBaseline']);
  const PIM_ROSTER = [
    { group: '🧬 Compare against the CloudFellows PIM framework', tools: [
      { id: 'toolPimBaseline', name: 'PIM baseline', icon: '🧬', number: 'T48', blurb: blurbs.toolPimBaseline, planned: 'lands in the next build' },
      { id: 'toolGapCheck', blurb: 'The MS Learn checks already cover privileged roles and break-glass; a PIM-only catalogue is on the roadmap.', lens: true },
    ] },
    { group: '👁 See what is privileged', tools: [
      { id: 'toolCaGroups', blurb: 'Role-assignable groups, their members and the roles they carry — the PIM groups of the framework.', lens: true },
      { id: 'toolGroupUse', blurb: 'Pick a user or group: its directory roles and PIM eligibilities, and where else it is used.', lens: true },
      { id: 'toolSignins', blurb: 'Sign-in failures — including the MFA and authentication-context failures at activation time.', lens: true },
      { id: 'toolAudit', blurb: 'Directory changes from the audit log — role settings and assignments among them.', lens: true },
    ] },
    { group: '✍️ Manage', tools: [
      { id: 'toolRmau', blurb: 'Put PIM-managed admin accounts and PIM groups in a restricted management AU so nobody edits them from the side.', lens: true },
    ] },
    { group: '❓ Help', tools: [
      { id: 'toolHelp' }, { id: 'toolChangelog' }, { id: 'toolRoadmap' }, { id: 'toolPermissions' },
    ] },
  ];
  const WORKSPACES = {
    ca: { num: '01', name: 'Conditional Access', title: 'Conditional Access overview', context: 'Conditional Access / Workspace 01',
      // Work order, not the order tools were added in: what exists (Policies,
      // Sign-ins), who it reaches (Who is…), what is wrong with it (Checks),
      // then what to change (Baseline, CA groups, Building blocks).
      shortcuts: [['toolPolicies','🗂','Policies'],['toolSignins','🚦','Sign-ins'],['toolWhoIs','🕵','Who is…'],['toolGapCheck','🛡','Checks'],['toolBaseline','🧬','Baseline'],['toolCaGroups','👥','CA groups'],['toolLocations','🧩','Building blocks']] },
    pim: { num: '02', name: 'PIM-buddy', title: 'Privileged access overview', context: 'Privileged Identity Management / Workspace 02',
      lead: 'Who can become what, under which rules, and whether this tenant still matches the CloudFellows PIM framework. Reads only — every write keeps the confirmation steps of the tool that makes it.',
      // Same work order: see it (Baseline), the groups that carry it, who
      // holds it, what is wrong with it, then what to protect and what changed.
      shortcuts: [['toolPimBaseline','🧬','Baseline'],['toolCaGroups','👥','PIM groups'],['toolGroupUse','🔗','Who holds…'],['toolGapCheck','🛡','Checks'],['toolRmau','🛡','Restricted AUs'],['toolAudit','🕓','Changes']] },
  };
  let ws = 'ca';
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
    // A tool opened from the wrong side switches the side first, so the rail
    // and the strip agree with the screen (32407).
    if (!inWorkspace(id, ws)) setWorkspace(inWorkspace(id, 'pim') ? 'pim' : 'ca', { quiet: true });
    original.click(); // The existing app owns the route, subtab and state.
  }
  const inWorkspace = (id, which) => which === 'pim' ? PIM_ROSTER.some(g => g.tools.some(t => t.id === id)) : !PIM_ONLY.has(id);
  const card = t => t.planned
    ? `<div class="wc-tool wc-planned" aria-disabled="true"><span class="wc-tool-icon" aria-hidden="true">${esc(t.icon || '')}</span><strong>${esc(t.name)}</strong><span>${esc(t.description)}</span><small>${esc(t.number || '')} · <span class="wc-chip">${esc(t.planned)}</span></small></div>`
    : `<button type="button" class="wc-tool" data-wc-tool="${esc(t.id)}"><span class="wc-tool-icon" aria-hidden="true">${icon(t.id)}</span><strong>${esc(t.name)}</strong><span>${esc(t.description)}</span><small>${esc(t.number || t.group)}${t.lens ? ' · <span class="wc-chip lens" title="The same tool as in Workspace 01. A PIM-only catalogue, tab strip and Help text for it is on the roadmap.">PIM lens · roadmap</span>' : ''}</small></button>`;
  function readTools() {
    let group = '';
    return [...document.querySelectorAll('#screen-home .tool-sec, #screen-home .tools > .tool[id]')].flatMap(el => {
      if (el.classList.contains('tool-sec')) { group = el.querySelector('h3').textContent.trim(); return []; }
      const side = $('side-' + el.id);
      if (!side) return [];
      return [{id:el.id, name:side.querySelector('.sn-txt').textContent.trim(), icon:side.querySelector('.sn-ic').textContent.trim(), number:side.querySelector('.sn-t')?.textContent.trim() || '', group, description:blurbs[el.id] || ''}];
    });
  }
  // The tools a workspace offers, in its own order and with its own words.
  function toolsOf(which) {
    if (which !== 'pim') return tools.filter(t => !PIM_ONLY.has(t.id));
    return PIM_ROSTER.flatMap(g => g.tools.map(r => {
      const t = tools.find(t => t.id === r.id);
      if (!t) return r.planned ? { id: r.id, name: r.name, icon: r.icon, number: r.number, group: g.group, description: r.blurb || '', planned: r.planned } : null;
      return { ...t, group: g.group, description: r.blurb || t.description, lens: !!r.lens };
    }).filter(Boolean));
  }
  function renderLauncher() {
    const q = $('wcSearch').value.trim().toLowerCase();
    const matches = toolsOf(ws).filter(t => !t.planned && [t.name,t.group,t.number,t.description].join(' ').toLowerCase().includes(q));
    $('wcTools').innerHTML = matches.length ? [...new Set(matches.map(t=>t.group))].map(group=>`<section><h3>${esc(group)}</h3><div class="wc-tool-grid">${matches.filter(t=>t.group===group).map(card).join('')}</div></section>`).join('') : '<p class="wc-no-results">No tools match this search.</p>';
    $('wcResultCount').textContent = `${matches.length} tools · Workspace ${WORKSPACES[ws].num}`;
  }
  function renderRecent() {
    $('wcRecent').innerHTML = recent.length ? recent.map(id => {
      const t=tools.find(t=>t.id===id); if(!t)return '';
      return `<button type="button" class="wc-recent" data-wc-tool="${esc(id)}"><span aria-hidden="true">${icon(t.id)}</span><span><strong>${esc(t.name)}</strong><small>Opened this session</small></span><span aria-hidden="true">↗</span></button>`;
    }).join('') : `<div class="wc-empty"><span aria-hidden="true">↗</span><h3>Your next session starts here.</h3><p>Tools you open appear here for a quick return.</p><button type="button" class="wc-text-button" data-wc-tool="${ws === 'pim' ? ($('toolPimBaseline') ? 'toolPimBaseline' : 'toolCaGroups') : 'toolPolicies'}">${ws === 'pim' ? ($('toolPimBaseline') ? 'Open PIM baseline →' : 'Open PIM groups →') : 'Open Policies →'}</button></div>`;
  }
  // ---- rail, header chip, home: one renderer each, re-run on a switch ----
  function renderRail() {
    const w = WORKSPACES[ws], other = ws === 'pim' ? 'ca' : 'pim';
    const shortcut = ([id, glyph, label]) => {
      const t = tools.find(t => t.id === id);
      if (!t) return `<button type="button" class="wc-planned" disabled title="${esc(label)} — lands in the next build"><span aria-hidden="true">${FlatIcons.tool(id)}</span><small>${esc(label)}</small></button>`;
      return `<button type="button" data-wc-tool="${id}" aria-label="${esc(t.name)}"><span aria-hidden="true">${FlatIcons.tool(id)}</span><small>${esc(label)}</small></button>`;
    };
    $('wcRail').innerHTML = `<button type="button" id="wcHomeButton" data-wc-home><span aria-hidden="true">${FlatIcons.tool("home")}</span><small>Home</small></button>${w.shortcuts.map(shortcut).join('')}<span class="wc-rail-divider"></span><button type="button" data-wc-library><span aria-hidden="true">${FlatIcons.tool("overview")}</span><small>All tools</small></button><button type="button" data-wc-tool="toolHelp"><span aria-hidden="true">${FlatIcons.tool("toolHelp")}</span><small>Help</small></button><span class="wc-rail-caption">WORKSPACE<br><button type="button" class="wc-rail-switch" data-wc-switch="${other}" title="Switch to ${esc(WORKSPACES[other].num)} · ${esc(WORKSPACES[other].name)}"><span class="wc-ws-dot" aria-hidden="true"></span>${esc(w.num)} ⇄</button></span>`;
  }
  function openTabIds() { return [...document.querySelectorAll('#toolNav .toolnav-tab [data-nav]')].map(b => b.dataset.nav); }
  function renderChip() {
    const w = WORKSPACES[ws];
    $('wcWsNum').textContent = w.num; $('wcWsName').textContent = w.name;
    $('wcHeaderContext').textContent = w.context;
    const open = openTabIds();
    for (const id of Object.keys(WORKSPACES)) {
      const row = $('wcWsRow-' + id); if (!row) continue;
      row.classList.toggle('cur', id === ws); row.setAttribute('aria-current', id === ws ? 'true' : 'false');
      const n = open.filter(t => inWorkspace(t, id)).length;
      row.querySelector('.wc-ws-open').textContent = n ? `${n} open tool${n === 1 ? '' : 's'}` : 'no open tools';
    }
  }
  function renderHome() {
    const w = WORKSPACES[ws];
    $('wcHomeTitle').textContent = w.title;
    $('wcPimLead').textContent = w.lead || '';
    const list = toolsOf(ws), real = list.filter(t => !t.planned);
    $('wcLibraryCount').textContent = `All ${real.length} tools`;
    $('wcOverviewTools').innerHTML = [...new Set(list.map(t=>t.group))].map(group=>`<details class="wc-tool-group" open><summary>${esc(group)} <span>${(n=>`${n} tool${n===1?'':'s'}`)(list.filter(t=>t.group===group && !t.planned).length)}</span></summary><div class="wc-tool-grid">${list.filter(t=>t.group===group).map(card).join('')}</div></details>`).join('');
    bindGroups();
    renderRecent();
  }
  let bindGroups = () => {};
  function setWorkspace(next, opts = {}) {
    if (!WORKSPACES[next]) return;
    const changed = next !== ws;
    ws = next;
    document.body.dataset.ws = ws;
    try { localStorage.setItem(WS_KEY, ws); } catch { /* private mode */ }
    try { const u = new URL(location.href); if (ws === 'pim') u.searchParams.set('ws', 'pim'); else u.searchParams.delete('ws'); history.replaceState(history.state, '', u); } catch { /* opaque origin */ }
    renderChip(); renderRail(); renderHome(); setLib();
    closeWsMenu();
    if (changed && !opts.quiet) {
      // A tool open on the other side stays open (its tab is only hidden);
      // the screen goes to this side's home so rail, strip and page agree.
      const active = $('toolNav').querySelector('.toolnav-tab.active [data-nav]')?.dataset.nav || '';
      if (active && !inWorkspace(active, ws)) $('side-home')?.click();
      else synchronize();
    } else synchronize();
  }
  function closeWsMenu() { const m = $('wcWsMenu'); if (m && !m.hidden) { m.hidden = true; $('wcWsChip').setAttribute('aria-expanded', 'false'); } }
  function toggleWsMenu() { const m = $('wcWsMenu'); const open = m.hidden; m.hidden = !open; $('wcWsChip').setAttribute('aria-expanded', String(open)); if (open) renderChip(); }
  // ⌘K entries: "Switch to 02 · PIM-buddy" beside the tools (app.js cpBuild
  // asks for these; the palette itself stays app.js's).
  function paletteItems(q, score) {
    return Object.keys(WORKSPACES).filter(id => id !== ws).map(id => {
      const w = WORKSPACES[id], label = `⇄ Switch to ${w.num} · ${w.name}`;
      const sc = score ? score(label, q) : 1;
      return sc ? { kind: 'tool', id: 'side-home', label, hint: `Workspace ${w.num} — ${w.name === 'PIM-buddy' ? 'everything privileged access' : 'the Conditional Access tools'}`, score: sc, go: () => setWorkspace(id) } : null;
    }).filter(Boolean);
  }
  let setLib = () => {};
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
      closeWsMenu();
      return;
    }
    const active = $('toolNav').querySelector('.toolnav-tab.active [data-nav]')?.dataset.nav || '';
    const home = $('screen-home').classList.contains('active');
    // A tool of the other side opened by the app itself (⌘K, a link in a
    // report, Back) takes the shell with it: the screen decides the side, so
    // the rail and the strip never disagree with the page (32407).
    if (active && !home && !inWorkspace(active, ws)) { setWorkspace(inWorkspace(active, 'pim') ? 'pim' : 'ca', { quiet: true }); return; }
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
    $('wcTenant').textContent = `${tenant} · Workspace ${WORKSPACES[ws].num}`;
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
      // A tab belongs to the workspace its tool is in; the other side's tabs
      // stay open and come back with the switch (32407).
      button.closest('.toolnav-tab').hidden = !inWorkspace(button.dataset.nav, ws);
    });
    $('wcCloseAll').disabled=!nav.querySelector('[data-close]');
    document.querySelectorAll('#toolNav [data-close]').forEach(button=>{
      const t=tools.find(t=>t.id===button.dataset.close);
      button.setAttribute('aria-label',`Close ${t?.name || 'tool'} tab`);
    });
    if (!$('wcWsMenu').hidden) renderChip();
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
    // Which side to start on: the link (?ws=pim) wins, then the last choice in
    // this browser, then 01.
    try { ws = new URLSearchParams(location.search).get('ws') === 'pim' ? 'pim' : (localStorage.getItem(WS_KEY) === 'pim' ? 'pim' : 'ca'); } catch { ws = 'ca'; }
    document.body.dataset.ws = ws;
    const rail=document.createElement('nav');rail.id='wcRail';rail.setAttribute('aria-label','Workspace navigation');
    document.body.append(rail);
    const brand=document.createElement('span');brand.className='wc-brand';
    brand.innerHTML='<span id="wcBrandName">ENCA</span>';
    brand.prepend($('brandLogo'));
    $('logoHome').append(brand);
    synchronizeBranding();
    document.addEventListener('enca:brand-updated',synchronizeBranding);
    new MutationObserver(synchronizeBranding).observe($('brandTag'),{childList:true,characterData:true,subtree:true});
    const header=document.querySelector('header .hwrap');
    // The workspace chip: the one switch. It sits beside the wordmark, not in
    // the wordmark's link, so the logo still goes home.
    const chipWrap=document.createElement('span');chipWrap.className='wc-ws';
    chipWrap.innerHTML=`<button type="button" class="wc-ws-chip" id="wcWsChip" aria-haspopup="menu" aria-expanded="false" title="Switch workspace"><span class="wc-ws-num" id="wcWsNum"></span><span id="wcWsName"></span><span class="wc-ws-caret" aria-hidden="true">▾</span></button><div class="wc-ws-menu" id="wcWsMenu" role="menu" hidden><div class="wc-ws-label">Workspaces</div>${Object.keys(WORKSPACES).map(id=>{const w=WORKSPACES[id];return `<button type="button" class="wc-ws-row" id="wcWsRow-${id}" data-wc-switch="${id}" role="menuitem"><span class="wc-ws-sw wc-ws-sw-${id}" aria-hidden="true">${esc(w.num)}</span><span><strong>${esc(w.name)}</strong><small class="wc-ws-open"></small></span><span class="wc-ws-keys" aria-hidden="true"><kbd>⌘⇧${esc(w.num.replace(/^0/,''))}</kbd></span></button>`;}).join('')}<div class="wc-ws-foot">Switching keeps every open tool of the other workspace; its tabs come back with it. The header colour says which side you are on.</div></div>`;
    $('logoHome').after(chipWrap);
    const context=document.createElement('span');context.className='wc-header-context';context.id='wcHeaderContext';
    chipWrap.after(context);
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
      // 🪪 the wizard's entry is the static Own app registration row right under this block (index.html, js/onboard.js) — a row cannot be missed by an async paint (25444)
    });
    const closeAll=document.createElement('button');closeAll.type='button';closeAll.id='wcCloseAll';closeAll.setAttribute('role','menuitem');closeAll.textContent='Close all workspaces';
    closeAll.addEventListener('click',()=>{
      const all=$('toolNav').querySelector('[data-navcloseall]');
      if(all)all.click();else $('toolNav').querySelector('[data-close]')?.click();
    });
    menu.insertBefore(closeAll,$('signOutBtn'));
    const note=document.createElement('p');note.className='wc-account-note';note.id='wcSessionNote';menu.append(note);
    const home=document.createElement('div');home.id='wcHome';
    home.innerHTML=`<div class="wc-home-heading"><div><div class="wc-eyebrow" id="wcTenant"></div><h1 id="wcHomeTitle"></h1><p id="wcHomeLead"></p><p id="wcPimLead"></p></div><span class="wc-demo"><span></span>Demo · sample data</span></div><div class="wc-home-layout"><aside class="wc-recent-panel"><h2>Recent tools</h2><div id="wcRecent"></div><div class="wc-session"><span class="wc-eyebrow">Current snapshot</span><div id="wcSnapshot"></div><p>ENCA’s existing demo policies.<br>Changes in this session are simulated.</p></div></aside><section class="wc-library"><div class="wc-section-heading"><h2 id="wcLibraryCount"></h2><span class="wc-section-actions"><button type="button" id="wcToggleLibrary" class="wc-text-button" aria-expanded="false" aria-controls="wcOverviewTools">Show</button><button type="button" id="wcToggleGroups" class="wc-text-button" hidden>Collapse all</button></span></div><div id="wcOverviewTools" hidden></div></section></div><div class="wc-home-foot"><span>Open tools stay in the tabs above your workspace.</span><button type="button" class="wc-text-button" data-wc-tool="toolHelp">ENCA help →</button></div>`;
    $('screen-home').prepend(home);
    // The Overview (js/overview.js, 25419) renders into the home once this
    // layout exists — say so, rather than have it poll for us.
    document.dispatchEvent(new CustomEvent('enca:wchome'));
    // The library sits under the Overview, closed until asked for (25422):
    // the rail and the header keep All tools one press away, and a home page
    // that starts with forty cards buries what it just learned. The choice is
    // remembered per browser — per workspace since 32407, and 02 starts open
    // because it has no Overview above the library yet.
    const libKey=()=>`enca.wcLibraryOpen:${ws}`;
    const libToggle=$('wcToggleLibrary'),lib=$('wcOverviewTools'),layout=home.querySelector('.wc-home-layout');
    setLib=(open)=>{
      if(open===undefined){try{const v=localStorage.getItem(libKey());open=v===null?ws==='pim':v==='1';}catch{open=ws==='pim';}}
      else{try{localStorage.setItem(libKey(),open?'1':'0');}catch{}}
      lib.hidden=!open;libToggle.textContent=open?'Hide':'Show';libToggle.setAttribute('aria-expanded',String(open));$('wcToggleGroups').hidden=!open;layout.classList.toggle('lib-closed',!open);
    };
    libToggle.addEventListener('click',()=>setLib(lib.hidden));
    const toggleGroups=$('wcToggleGroups');
    bindGroups=()=>{
      const groups=[...home.querySelectorAll('.wc-tool-group')];
      const syncGroups=()=>{toggleGroups.textContent=groups.some(g=>g.open)?'Collapse all':'Expand all';};
      groups.forEach(g=>g.addEventListener('toggle',syncGroups));
      toggleGroups.onclick=()=>{const open=!groups.some(g=>g.open);groups.forEach(g=>g.open=open);syncGroups();};
      syncGroups();
    };
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
      if (!document.body.classList.contains('with-side')) { closeWsMenu(); return; }
      const sw=e.target.closest('[data-wc-switch]'); if(sw){setWorkspace(sw.dataset.wcSwitch);return;}
      if(e.target.closest('#wcWsChip')){toggleWsMenu();return;}
      if(!e.target.closest('#wcWsMenu'))closeWsMenu();
      const tool=e.target.closest('[data-wc-tool]'); if(tool){openTool(tool.dataset.wcTool);return;}
      if(e.target.closest('[data-wc-home]')){$('side-home').click();return;}
      if(e.target.closest('[data-wc-library]')){$('wcSearch').value='';renderLauncher();dialog.showModal();$('wcSearch').focus();}
    });
    // ⌘⇧1 / ⌘⇧2 (Ctrl+Shift on Windows) switch sides; plain ⌘1 is the browser's
    // own first-tab shortcut and stays its.
    document.addEventListener('keydown',e=>{
      if(!(e.metaKey||e.ctrlKey)||!e.shiftKey||e.altKey)return;
      if(!document.body.classList.contains('with-side'))return;
      const hit=Object.keys(WORKSPACES).find(id=>e.code===`Digit${+WORKSPACES[id].num}`||e.key===String(+WORKSPACES[id].num));
      if(!hit)return;
      e.preventDefault();setWorkspace(hit);
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeWsMenu();});
    renderChip(); renderRail(); renderHome(); setLib();
    new MutationObserver(synchronize).observe($('toolNav'),{childList:true});
    new MutationObserver(synchronize).observe($('screen-home'),{attributes:true,attributeFilter:['class']});
    new MutationObserver(synchronize).observe(document.body,{attributes:true,attributeFilter:['class']});
    document.addEventListener('enca:workspace-updated',synchronize);
    synchronize();
    window.dispatchEvent(new Event('resize'));
  }
  globalThis.Workspaces = { current: () => ws, switch: (id) => setWorkspace(id), paletteItems, list: () => Object.keys(WORKSPACES).map(id => ({ id, num: WORKSPACES[id].num, name: WORKSPACES[id].name })) };
  const ready=new MutationObserver(()=>{initialize();if(initialized)ready.disconnect();});
  ready.observe($('sideNav'),{childList:true});
  initialize();
  FlatIcons.start();
})();
