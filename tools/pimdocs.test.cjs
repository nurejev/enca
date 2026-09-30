// Changes to the contract or document bytes require a deliberate review of BOTH documents.
// Do not refresh the snapshot merely to silence a failing test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { contract } = require('./pimdocs-contract.cjs');
const root = path.resolve(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(root, 'docs/handovers/pimbuddy-documentation-contract.json'), 'utf8'));
const current = JSON.parse(JSON.stringify(contract()));
const xml = name => execFileSync('unzip', ['-p', path.join(root, name), 'word/document.xml'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const text = value => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
test('reviewed Word reference contract matches every effective model and regional template', () => {
  assert.deepEqual(current, snap.catalog, 'Catalog changed: review both Word documents and then refresh the contract');
});
test('reviewed Word documents match their recorded checksums and the build they were reviewed at', () => {
  const build = new Function(fs.readFileSync(path.join(root, 'js/version.js'), 'utf8') + ';return APP_BUILD.build;')();
  // The documents are reviewed AT a build, not re-reviewed on every build: a later
  // application build passes as long as the catalog contract above is unchanged
  // (that test is what forces a docs review). A snapshot newer than the app is wrong.
  assert.ok(Number.isInteger(snap.build) && snap.build <= build, `Reviewed build ${snap.build} must not be newer than the application build ${build}`);
  for (const doc of snap.documents) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, doc.path))).digest('hex'), doc.sha256, doc.path);
    assert.ok(text(xml(doc.path)).includes(String(snap.build)), 'Document must identify the build it was reviewed at');
  }
});
test('baseline Word reference contains every central group, role identifier and custom permission', () => {
  const content = text(xml(snap.documents[0].path));
  for (const p of Object.values(current.profiles)) {
    for (const g of p.groups) assert.ok(content.includes(g.name), g.name);
    for (const r of p.roles) { assert.ok(content.includes(r.name), r.name); assert.ok(content.includes(r.templateId), r.templateId); }
    for (const a of p.profile.intune.assignments) assert.ok(content.includes(a.name), a.name);
    for (const a of p.profile.rmau) assert.ok(content.includes(a.name), a.name);
  }
  for (const r of current.intuneRoles) for (const permission of r.allowed) assert.ok(content.includes(permission), permission);
});
