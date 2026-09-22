/* Shared tool presentation. Native ENCA owns data, actions and dialogs. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  // Headers are rebuilt by each tool after reads, filters and tab changes.
  // Mark the existing heading, keeping its status/version chips and content.
  // THE HEAD FOLDS (build 25451, Mihai: "allow the top bar to collapse, it
  // takes too much space"). Every tool head is a title line plus prose — 120
  // to 250 words on most tools (the 2026-09-21 layout audit). A ▾ / ▸ button
  // at the end of the title folds the prose away and keeps the title, its
  // chips and any meta block; the choice is kept per screen in localStorage,
  // so a tool read once stays short. Heads are rebuilt by their tools after
  // every read, so the fold is re-applied by the same observer that marks
  // the title.
  const FOLD_KEY = id => 'enca-head-fold:' + id;
  const folded = id => { try { return localStorage.getItem(FOLD_KEY(id)) === '1'; } catch { return false; } };
  const remember = (id, on) => { try { on ? localStorage.setItem(FOLD_KEY(id), '1') : localStorage.removeItem(FOLD_KEY(id)); } catch {} };
  function foldable(head, id) {
    const title = head.querySelector('h1,h2,h3');
    if (!title) return;
    title.classList.add('wc-page-title');
    if (!title.querySelector('.wc-head-fold')) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wc-head-fold';
      b.addEventListener('click', e => { e.stopPropagation(); const on = !head.classList.contains('wc-head-folded'); head.classList.toggle('wc-head-folded', on); remember(id, on); b.textContent = on ? '▸' : '▾'; b.title = on ? 'Show what this tool does' : 'Hide the description — the title stays'; });
      title.appendChild(b);
    }
    const on = folded(id);
    head.classList.toggle('wc-head-folded', on);
    // write only what changed: this runs from a childList observer on the
    // head, and setting textContent to the same value is still a mutation
    const b = title.querySelector('.wc-head-fold'), want = on ? '▸' : '▾';
    if (b.textContent !== want) b.textContent = want;
    const tip = on ? 'Show what this tool does' : 'Hide the description — the title stays';
    if (b.title !== tip) b.title = tip;
  }
  document.querySelectorAll('.screen.tool').forEach(screen => {
    const head = screen.querySelector(':scope > .readme, :scope > .workspace-heading');
    if (!head) return;
    head.classList.add('wc-tool-head');
    const markTitle = () => foldable(head, screen.id);
    markTitle();
    new MutationObserver(markTitle).observe(head, {childList:true, subtree:true});
  });
  // Coverage shares the Policies screen and keeps its introductory form.
  $('anIntro')?.classList.add('wc-tool-head');
  $('anIntro')?.querySelector('h3')?.classList.add('wc-page-title');

  // Custom palettes may use a light primary or dark accent. Keep text readable
  // in the new header and selected rail item, also after a theme/brand change.
  function contrastInk(color) {
    const rgb = color.match(/^rgba?\(([^)]+)\)$/)?.[1].split(/[\s,\/]+/).slice(0,3).map(Number);
    if (!rgb || rgb.some(Number.isNaN)) return '#fff';
    const l = rgb.map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
    const luminance = l[0] * .2126 + l[1] * .7152 + l[2] * .0722;
    return luminance > .179 ? '#111111' : '#ffffff';
  }
  function syncContrast() {
    const header = document.querySelector('body > header');
    if (!header) return;
    document.body.style.setProperty('--wc-brand-ink', contrastInk(getComputedStyle(header).backgroundColor));
    const sample = document.createElement('span');
    sample.style.cssText = 'position:absolute;visibility:hidden;background:var(--lemon)';
    document.body.append(sample);
    document.body.style.setProperty('--wc-accent-ink', contrastInk(getComputedStyle(sample).backgroundColor));
    sample.remove();
  }
  new MutationObserver(syncContrast).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme','data-brand','style']});
  new MutationObserver(syncContrast).observe(document.body, {attributes:true, attributeFilter:['class']});
  document.addEventListener('enca:brand-updated',syncContrast);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',syncContrast);
  syncContrast();
})();
