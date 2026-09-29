// Review contract for the two customer Word references. No tenant reads.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
function contract() {
  const cat = new Function(read('js/pimBaselineData.js') + ';return PIM_BASELINE;')();
  const baseline = new Function(read('js/pimbaseline.js') + ';return PimBaseline;')();
  const profiles = Object.fromEntries(baseline.profileIds(cat).map(id => {
    const p = baseline.profile(cat, id);
    return [id, { groups: p.groups, roles: p.roles, templates: p.templates, profile: p.profile }];
  }));
  return { release: cat.release, revised: cat.revised, profiles, regions: cat.regions, intuneRoles: cat.intuneRoles, approvers: cat.approvers, authContext: cat.authContext, notifications: cat.notifications, protected: cat.protected, protection: cat.protection, outside: cat.outside };
}
module.exports = { contract };
