// 👥 CA groups 5.17 (beta 32503): the drawer's add box takes a list —
// GroupsView.splitMembers. No credentials, external packages or network.
// Run: node --test tools/cg-addmany.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = { window: {}, console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/groupsview.js'), 'utf8') + ';globalThis.GV = GroupsView;', ctx);
const split = (s) => [...ctx.GV.splitMembers(s)];

test('one entry stays one entry', () => {
  assert.deepEqual(split('eva@pvm.com'), ['eva@pvm.com']);
  assert.deepEqual(split('  Eva Jansen  '), ['Eva Jansen']);
  assert.deepEqual(split(''), []);
  assert.deepEqual(split(' ; , '), []);
});

test('; , tab and new line all separate', () => {
  assert.deepEqual(split('a@x.com; b@x.com, c@x.com\td@x.com\ne@x.com\r\nf@x.com'),
    ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com']);
});

test('the same entry twice, any case, is kept once in typed order', () => {
  assert.deepEqual(split('b@x.com; a@x.com; B@X.COM; a@x.com'), ['b@x.com', 'a@x.com']);
});

test('an Outlook To line gives the addresses, names with commas included', () => {
  assert.deepEqual(split('"Jansen, Eva" <eva@x.com>; Max Mol <max@x.com>; z@x.com'), ['eva@x.com', 'max@x.com', 'z@x.com']);
});

test('quotes around an entry are dropped', () => {
  assert.deepEqual(split('"a@x.com"; \'b@x.com\''), ['a@x.com', 'b@x.com']);
});
