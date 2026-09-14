// Shared keyboard support for the existing dialog surfaces and home launchers.
(() => {
  const focusable = root => [...root.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(e => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length && !e.closest('[inert]'));
  let stack=[], inerted=[];
  function sync() {
    const open=[...document.querySelectorAll('.modal-bg.open, #fsModal.show')];
    const closed=stack.filter(x=>!open.includes(x.el));
    const added=open.filter(el=>!stack.some(x=>x.el===el));
    stack=stack.filter(x=>open.includes(x.el));
    added.forEach(el=>{
      const panel=el.querySelector('.modal')||el;
      panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.tabIndex=-1;
      if (![...panel.querySelectorAll('button')].some(b => /^(cancel|close|done|got it|✕|×)(\s|$)/i.test(b.textContent.trim()))) {
        const close=document.createElement('button');close.type='button';close.className='btn sm dialog-close';close.textContent='Close';
        close.addEventListener('click',()=>el.classList.remove('open'));panel.prepend(close);
      }
      const title=panel.querySelector('h1,h2,h3,h4');
      if(title){if(!title.id)title.id='dialog-title-'+el.id;panel.setAttribute('aria-labelledby',title.id);}
      else panel.setAttribute('aria-label','Dialog');
      stack.push({el,panel,returnTo:document.activeElement});
    });
    inerted.forEach(el=>el.inert=false);inerted=[];
    const top=stack.at(-1);
    if(top){
      let branch=top.el;
      while(branch.parentElement&&branch.parentElement!==document.documentElement){
        [...branch.parentElement.children].filter(el=>el!==branch&&!['SCRIPT','STYLE','LINK'].includes(el.tagName)&&!el.inert).forEach(el=>{el.inert=true;inerted.push(el);});
        branch=branch.parentElement;
      }
      if(added.length)(focusable(top.panel)[0]||top.panel).focus();
    } else if(closed.length){const target=closed[0].returnTo;if(target?.isConnected)target.focus();}
    if(top&&closed.length&&!top.panel.contains(document.activeElement))(focusable(top.panel)[0]||top.panel).focus();
  }
  new MutationObserver(records=>{
    if(records.some(r=>r.type==='attributes'&&(r.target.classList?.contains('modal-bg') || r.target.id === 'fsModal')))sync();
  }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('keydown',e=>{
    const top=stack.at(-1);if(!top)return;
    if(e.key==='Tab'){
      const items=focusable(top.panel),first=items[0],last=items.at(-1);
      if(!first){e.preventDefault();top.panel.focus();}
      else if(e.shiftKey&&(document.activeElement===first||!top.panel.contains(document.activeElement))){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||!top.panel.contains(document.activeElement))){e.preventDefault();first.focus();}
    }
    if(e.key==='Escape'){
      const close=focusable(top.panel).find(b=>b.tagName==='BUTTON'&&/^(cancel|close|done|got it|✕|×)(\s|$)/i.test(b.textContent.trim()));
      e.preventDefault();e.stopImmediatePropagation();if(close)close.click();
    }
  },true);
  document.addEventListener('focusin',e=>{const top=stack.at(-1);if(top&&!top.panel.contains(e.target))(focusable(top.panel)[0]||top.panel).focus();});
  document.querySelectorAll('#screen-home .tool').forEach(tile=>{
    tile.classList.add('tool-tile');
    const h=tile.querySelector('h3');if(!h)return;
    // Keep the tile listener as the route; the native button supplies keyboard activation.
    const b=document.createElement('button');b.type='button';b.className='tool-launch';
    const title=[...h.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();
    b.textContent=title||tile.id;b.setAttribute('aria-label','Open '+b.textContent);
    [...h.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).forEach(n=>n.remove());h.prepend(b);
  });

  ['logoHome'].forEach(id=>{const e=document.getElementById(id);if(!e)return;e.tabIndex=0;e.setAttribute('role','button');e.setAttribute('aria-label','Go to tools');e.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();e.click();}});});
  sync();
})();
