/* Shared list/detail presentation. Existing nodes and delegated actions stay in their tool. */
const ListDetail = (() => {
  const states=new Map();
  const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function mount(host,items,{key=host.id,before=[],after=[]}={}) {
    if(!items.length)return;
    const old=states.get(key)||{selected:null,wide:false,mobile:false,ratio:54,tab:'Overview'};
    if(!items.some(x=>x.key===old.selected)){old.selected=items[0].key;old.wide=false;old.mobile=false;}
    states.set(key,old);
    const shell=el('div','ld-shell'),list=el('div','ld-list'),panel=el('section','ld-panel');panel.setAttribute('aria-label','Selected item details');
    const divider=el('input','ld-divider');divider.type='range';divider.min='40';divider.max='65';divider.value=old.ratio;divider.setAttribute('aria-label','List width');
    const controls=el('div','ld-controls'),back=el('button','btn sm','Back to results'),wide=el('button','btn sm'),caption=el('span','mini muted','Details');back.type=wide.type='button';controls.append(back,caption,wide);
    const title=el('h2','ld-title'),tabs=el('div','ld-tabs'),body=el('div','ld-content');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Detail sections');body.id='ld-content-'+key.replace(/[^a-z0-9-]/gi,'-');body.setAttribute('role','tabpanel');panel.append(controls,title,tabs,body);
    const buttons=new Map();
    for(const item of items){
      const b=el('button','ld-row');b.type='button';b.dataset.ldKey=item.key;b.append(el('strong','',item.title));if(item.meta)b.append(el('span','mini muted',item.meta));
      b.addEventListener('click',()=>{old.selected=item.key;old.mobile=true;paint();if(matchMedia('(max-width:900px)').matches)back.focus();});list.append(b);buttons.set(item.key,b);
    }
    function paint(){
      const item=items.find(x=>x.key===old.selected)||items[0];shell.classList.toggle('ld-wide',old.wide);shell.classList.toggle('ld-mobile-detail',old.mobile);shell.style.setProperty('--ld-list',old.ratio+'%');
      wide.textContent=old.wide?'Restore split view':'Open wide';title.textContent=item.title;
      for(const [id,b] of buttons)b.setAttribute('aria-pressed',String(id===item.key));
      body.replaceChildren(typeof item.node==='function'?item.node():item.node);tabs.replaceChildren();
      const sections=item.sections||[];
      if(sections.length){if(!sections.some(s=>s.name===old.tab))old.tab=sections[0].name;
        sections.forEach((s,i)=>{const b=el('button','',s.name);b.type='button';b.id=body.id+'-tab-'+i;b.setAttribute('aria-controls',body.id);if(s.name===old.tab)body.setAttribute('aria-labelledby',b.id);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(s.name===old.tab));b.addEventListener('click',()=>{old.tab=s.name;paint();tabs.querySelector('[aria-selected=true]')?.focus();});tabs.append(b);s.show(old.tab===s.name);});
      }
      tabs.hidden=!sections.length;
      if(typeof FlatIcons!=='undefined')FlatIcons.apply(panel);
    }
    wide.addEventListener('click',()=>{old.wide=!old.wide;old.mobile=true;paint();wide.focus();});
    back.addEventListener('click',()=>{old.wide=false;old.mobile=false;paint();buttons.get(old.selected)?.focus();});
    divider.addEventListener('input',()=>{old.ratio=+divider.value;shell.style.setProperty('--ld-list',old.ratio+'%');});
    shell.append(list,divider,panel);host.replaceChildren(...before,shell,...after);paint();
  }
  function cards(id,selector,{key=id,title='.lo-h b,.au-h b,h4',meta='.lo-d,.au-sub',identity,sections=true}={}){
    const host=document.getElementById(id);if(!host||host.querySelector(':scope > .ld-shell'))return;
    const cards=[...host.querySelectorAll(selector)];if(!cards.length)return;
    const items=cards.map((node,i)=>{
      const heading=node.querySelector(title);const name=(node.querySelector('.lo-h')?[...node.querySelectorAll('.lo-h>b')].map(n=>n.textContent.trim()).join(' '):heading?.textContent.trim())||'Details';
      const marker=identity?node.querySelector(identity):null;
      const id=marker?[...marker.attributes].find(a=>a.name.startsWith('data-'))?.value:null;
      node.querySelectorAll('[data-auid],[data-siid],[data-wo-fold]').forEach(n=>{n.removeAttribute('data-auid');n.removeAttribute('data-siid');n.removeAttribute('data-wo-fold');});
      const item={key:id||name+'#'+i,title:name,meta:node.querySelector(meta)?.textContent.trim(),node};
      if(sections){const evidence=[...node.querySelectorAll(':scope > .au-diff,:scope > .lo-u')];if(evidence.length){item.sections=[{name:'Overview',show:active=>{[...node.children].forEach(n=>n.hidden=!active);}}, {name:node.querySelector('.au-diff')?'Evidence':'Used by',show:active=>{if(active)[...node.children].forEach(n=>n.hidden=!evidence.includes(n)&&!n.matches('.lo-act'));}}];}}
      return item;
    });
    const containers=new Set(cards.map(n=>n.parentElement===host?n:n.parentElement));const before=[...host.children].filter(n=>!containers.has(n));
    mount(host,items,{key,before});
  }
  function pairs(id,rowSelector,attribute,key){
    const host=document.getElementById(id),rows=[...host.querySelectorAll(rowSelector)];if(!rows.length)return;
    const items=rows.map((row,i)=>{const node=el('div','ld-pair-detail');const next=row.nextElementSibling;if(next?.classList.contains('au-sumdet')){node.innerHTML=next.firstElementChild.innerHTML;node.querySelectorAll('button[data-sisum]').forEach(b=>b.remove());}
      const title=row.cells[0].textContent.trim();const meta=[...row.cells].slice(1).map(c=>c.textContent.trim()).filter(Boolean).join(' · ');
      const summary=el('p','mini muted',meta);node.prepend(summary);return {key:row.getAttribute(attribute)||String(i),title,meta,node};});
    const before=[...host.children].filter(n=>!n.querySelector(rowSelector));mount(host,items,{key,before});
  }
  function reset(){states.clear();}
  return {mount,cards,pairs,reset};
})();
