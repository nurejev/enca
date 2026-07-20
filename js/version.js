// ======================================================================
// Build stamp. Shown on the sign-in screen and in the footer so you can
// tell at a glance whether the deployed site is the version you pushed —
// GitHub Pages and the browser cache can both lag a commit behind.
//
// `build` matches the ?v= cache-busting number on every asset URL in
// index.html; bump both together when releasing.
// ======================================================================
const APP_BUILD = {
  version: "1.0",
  build: 83,
  date: "2026-07-20",
  get label() { return `v${this.version}.${this.build}`; },
  get full() { return `${this.label} · ${this.date}`; },
};
