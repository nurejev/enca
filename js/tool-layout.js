/* Shared tool presentation. Native ENCA owns data, actions and dialogs. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  // Headers are rebuilt by each tool after reads, filters and tab changes.
  // Mark the existing heading, keeping its status/version chips and content.
  document.querySelectorAll('.screen.tool').forEach(screen => {
    const head = screen.querySelector(':scope > .readme, :scope > .workspace-heading');
    if (!head) return;
    head.classList.add('wc-tool-head');
    const markTitle = () => head.querySelector('h1,h2,h3')?.classList.add('wc-page-title');
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
