// ======================================================================
// 📰 Learn changes — decisions RECORDED for the nightly Microsoft Learn feed.
//
// Read by the tab (js/learnfeed.js) and by the nightly run
// (.github/workflows/learn-feed.yml checks this file out from beta), so an
// item decided here stops being open on every browser AND drops out of the
// GitHub issue. Decisions made on the tab are pending on that browser until
// they are written here — 📋 Work order carries them, as ready-to-paste
// lines, to the session that records them.
//
// Key: "doc:<path in MicrosoftDocs/entra-docs>" or "wn:<Month YYYY>|<title>".
// d:    reverified | check-change | new-check | extends | covered | not-relevant
// upTo: the change the decision is about (ISO date from the feed). A page
//       that changes again after it is open again — a decision covers what
//       was read, not whatever Microsoft writes next.
// at:   when it was decided. why: the reason, or the check it belongs to.
// checks: for a check-page item, the checks it was about.
//
// When a check is changed to follow its page, move that check's `verified`
// date in js/mslearn.js as well — the entry here can then stay as history.
// ======================================================================
const LEARN_TRIAGE = {
  updated: "2026-09-23",
  decisions: {
  },
};
