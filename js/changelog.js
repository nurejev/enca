// ======================================================================
// Changelog — the source of truth for both the "What's new" overlay shown
// after sign-in and the full changelog page.
//
// HOUSEKEEPING: whenever a tool is added or changed, add a NEW release
// object here for that build, in the same commit as the code, and bump
// APP_BUILD.build in version.js to match.
//
// AND js/promote.js — the beta-channel promotion queue shown in Help. Same
// commit, same discipline: a change that reaches beta without an entry there
// becomes invisible when deciding what to push to production.
//
// One release object per build, holding ONLY what changed in that build.
// Do not bump an existing release's number to cover new work — the overlay
// shows every release newer than the build the person last acknowledged, so
// reusing an entry re-shows unrelated older items to people who already
// read them.
//
// kind: "new"      — a whole tool or capability that did not exist
//        "improved" — an existing tool got better
//        "fixed"    — something was wrong and now is not
//
// TEXT IS PLAIN TEXT. clEntries() escapes it, so an HTML tag written here comes
// out as angle brackets mid-sentence. That was true from build 161 and nobody
// noticed for 228 tags; build 25156 stripped them. Quote a literal token — "bad"
// — rather than reaching for code, and carry emphasis in the words.
//
// Newest release first.
// ======================================================================
const CHANGELOG = [
  {
    build: 25218, date: "2026-08-27", title: "The refused row now carries the way out",
    items: [
      { kind: "improved", tool: "Protect exclusions", text: "A role-assignable group's row in the protection list refused the checkbox and explained why, but the way out — convert it to a plain group in CA groups (7) Migrate — was named only in the prose above the table. The refusal itself now ends in a (7) Migrate it button that takes you there; the conversion is not duplicated, because Migrate finds every role-assignable candidate in its own scan. From the standalone tool a toast says where you are being taken and to come back and protect the group afterwards. A frozen row — role-assignable AND already in a restricted unit — deliberately gets no button: its way out starts with removing it from the unit, and a Migrate button there would put the steps in the wrong order. The same row serves CA groups (6) Protect." },
    ],
  },
  {
    build: 25217, date: "2026-08-27", title: "Items 101 and 102 reached production 301",
    items: [
      { kind: "improved", tool: "All tools", text: "The 20px sidebar icons \u2014 one shared rule, both states \u2014 and the branding gear on every host are live on enca.limon-it.nl as build 301, the day they were built. The two items leave the queue together because their builds interleave, and the production build the queue measures against is v1.0.301. The beta-only test-checklist styles travelled nowhere: they were carved out of the port. Items 92, 34 and 24 stay behind." },
    ],
  },
  {
    build: 25216, date: "2026-08-27", title: "The icons changed size when the sidebar unfolded",
    items: [
      { kind: "fixed", tool: "All tools", text: "25214 gave the collapsed rail 20px icons and left the expanded list on the 13px it inherited from the button, so folding the sidebar out visibly shrank every icon and nudged it sideways. The size is now set once, on the shared rule, and applies to both states \u2014 the collapsed rule only re-centres the glyph in the 56px rail. Two numbers to keep in step is exactly how they fell out of step." },
      { kind: "improved", tool: "All tools", text: "The icon box widens from 22px to 26px to hold the bigger glyph without clipping, and cannot be squeezed by the flex row. That also brings its centre to within about 5px of where the rail centres it, so the fold barely moves it \u2014 it was 7px before, with a size change on top. The line height stays at 1 in the expanded list: a 20px glyph should not also make every row 20px taller when there are 37 entries and the column already scrolls. The rail keeps its airier spacing." },
    ],
  },
  {
    build: 25215, date: "2026-08-27", title: "The branding gear was hidden from the one host that pays for it",
    items: [
      { kind: "improved", tool: "All tools", text: "The \u2699 gear next to Sign out appears on every host now, production included. Two different things had been sitting behind one guard: the gear, which writes to localStorage and changes the look in THAT browser only, and the deployment file, which is served to every visitor. Only the second is a self-hosting mechanism. Anyone could already have the look by self-hosting, so denying it to the person running the hosted site was protecting nothing." },
      { kind: "fixed", tool: "All tools", text: "The deployment file stays non-production and so does the ribbon it softens: selfhost-branding.json is not fetched on the hosted site, and no amount of local branding produces a BETA or SELF-HOSTED ribbon there. BRANDING.host is still not configurable anywhere \u2014 it drives the production check, the ribbon and the export credit, and a wrong host would let a copy pass itself off as production. That reasoning was always about the served file rather than a per-browser preference, and the note in js/selfhost.js now says which is which instead of covering both with one sentence." },
      { kind: "improved", tool: "All tools", text: "On production the dialog says what it is: the settings apply to your browser only, nobody else sees them, Reset undoes it, and the downloaded file is for an instance you run yourself \u2014 serving it on the hosted site would do nothing, because the identity there comes from js/branding.js. The tooltip on the gear changes with the host for the same reason." },
    ],
  },
  {
    build: 25214, date: "2026-08-27", title: "In the collapsed rail the icon is the row",
    items: [
      { kind: "improved", tool: "All tools", text: "The icons in the collapsed sidebar go from the 13px they inherited from the button to 20px. Collapsed there is no label beside them, so the icon IS the row \u2014 and at button text size, on a 56px rail with thirty-odd of them stacked, it reads as a smudge rather than something to aim at. That is also the state the sidebar remembers between visits, so it is what most people see most of the time. Expanded rows are untouched: there the icon sits next to a label at text size, which is correct." },
    ],
  },
  {
    build: 25213, date: "2026-08-27", title: "Item 100 reached production 300",
    items: [
      { kind: "improved", tool: "SMS & voice retirement", text: "The Phone role column and the Notify users button are live on enca.limon-it.nl as build 300, the day after they were built. The queue item leaves and the production build the queue measures against is v1.0.300. Items 92, 34 and 24 stay behind." },
    ],
  },
  {
    build: 25212, date: "2026-08-26", title: "What the phone IS to each user, and the email that tells them",
    items: [
      { kind: "new", tool: "SMS & voice retirement", text: "A Phone role column states outright what the verdict only implied: whether the phone is the user's ONLY MFA method, the DEFAULT their sign-in prompts actually use today, or a backup sitting next to something better. The default is read from the preferred-method field in both its dialects, and it matters even when a passkey is registered - those users feel the retirement first, because every prompt they see today goes to the phone. In the summary line, the table, the Markdown report, and as two explicit yes/no columns in the CSV." },
      { kind: "new", tool: "SMS & voice retirement", text: "A Notify users button turns the result into the communication: the recipient list (the users whose verdict is locked out or migrate, disabled accounts skipped - or the whole scope when registration data was not read, and it says which) plus a ready-to-send plain-text email telling people to register a passkey at aka.ms/mysecurityinfo and then remove their phone method, with both retirement dates spelled out. Copy buttons for the BCC list and the text, a download of the whole thing, and an open-in-mail-app link that only appears when the list is small enough for a mailto URL to survive - a truncated link would silently notify an arbitrary prefix of the tenant. The bracketed service-desk lines are left for you on purpose; Microsoft's own templates are linked beside it." },
    ],
  },
  {
    build: 25211, date: "2026-08-26", title: "Item 99 reached production 299",
    items: [
      { kind: "improved", tool: "SMS & voice retirement", text: "Promoted to production as build 299, one day after it was built: the Temporary tools section and the whole tool - policy scope read the way Microsoft's script reads it, the users behind it, the registration-report verdicts and the Enabled-column fix from 25210. The only-here chip comes off on this channel too, the tool is 1.0 now (a tool a customer can open is not a 0.x thing - the BETA chip is what still says proving itself), and the queue's production build is v1.0.299. Items 92, 34 and 24 stay behind." },
    ],
  },
  {
    build: 25210, date: "2026-08-26", title: "The Enabled column stops answering with a question mark",
    items: [
      { kind: "fixed", tool: "SMS & voice retirement", text: "On an ALL USERS scope every row's Enabled column read as a question mark. The user list on that path comes from the registration-details report, which does not carry accountEnabled, and the tool refuses to guess - so it printed the honest unknown for twenty-five thousand rows at once, which is honest and useless. One paged read over the directory (id and accountEnabled only) now fills the flag in; a user past the read cap keeps the question mark, because past the cap unknown is still the truth. Direct user targets, which had the same gap, get the same fix." },
    ],
  },
  {
    build: 25209, date: "2026-08-26", title: "Items 93, 96, 97 and 98 reached production 298",
    items: [
      { kind: "improved", tool: "All tools", text: "Promoted to production as build 298: the side navigation with its tool numbers and collapsed rail (item 96, betas 25202, 25203 and 25206), fork detection with the update-from-upstream notice (item 93, beta 25195), the centred Help page and roadmap timeline (item 97, beta 25204), and the In beta today roadmap era (item 98, beta 25205). The four items leave the promotion queue and the production build the queue measures against is now v1.0.298." },
      { kind: "improved", tool: "Roadmap", text: "R15 Fork detection graduates from In beta today to Now on both channels - live at beta 25195, production 298 - which is the new era doing exactly what it was built for: a waiting room, not a second home for shipped work. The era keeps R01 CIS Benchmark and R06 Self-hosting, which stay beta-only; self-hosting's packaging (item 92) stays behind in the queue on purpose, as does the SMS and voice retirement tool (item 99)." },
    ],
  },
  {
    build: 25208, date: "2026-08-26", title: "A tool with an expiry date, in a section that says so",
    items: [
      { kind: "new", tool: "SMS & voice retirement", text: "T33, BETA, beta-site only, and openly TEMPORARY. Microsoft retires its own SMS and voice MFA delivery on 1 February 2027, and from 1 September 2026 every user still enabled for SMS or voice is auto-enabled for passkeys and nudged at sign-in; after the retirement a user whose ONLY MFA method is a phone number gets a BLOCKING passkey-registration prompt, with no opt-out. The tool reads the sms and voice authentication method configurations the way Microsoft's own Get-SmsVoicePolicyUsers.ps1 does — state, registration campaign, include and exclude targets resolved to names — and then goes further than the script: the scope is expanded to the actual users, and each one carries a verdict." },
      { kind: "new", tool: "SMS & voice retirement", text: "The verdict is about who actually USES a phone, not just who a policy names. With AuditLog.Read.All — asked once, on the run click, and a refusal degrades the run to scope-only instead of killing it — the registration-details report is joined per user: phone as the only MFA method (locked out after 1 Feb 2027), phone plus another MFA method (migrate — nudged from Sep 1, phone dies Feb 1), phishing-resistant method already registered (the retirement changes nothing), or in scope with no phone method registered at all. Filter chips per verdict, a countdown to both dates, the temporary opt-out (passkeyDynamicMigration) surfaced when the tenant exposes it, Markdown report and a full CSV export. An ALL USERS scope is read from the registration report, or from the directory capped and marked partial." },
      { kind: "new", tool: "All tools", text: "A new Temporary tools section sits FIRST on the home page, and this tool is its first tenant. The section is for deadline-driven tools: each one names the date it stops mattering, and both the tool and the section are removed once the last date has passed. Deliberately at the top — a deadline tool below the fold is a tool that gets opened after the deadline." },
    ],
  },
  {
    build: 25207, date: "2026-08-26", title: "The queue takes ticks, and hands back an order",
    items: [
      { kind: "new", tool: "All tools", text: "The promotion queue in Help grew a tick box per item and an export button. Tick the items you have verified on this channel, press export, and a small file comes down \u2014 the promotion order: the ticked numbers up front, each item's title, tools, builds, risk and files below, and a machine-readable block at the end. Hand that file to the working session and it becomes the promotion instruction. Ticks persist across reloads, keyed on the item's stable number, and a tick whose item ships is pruned rather than left pointing at nothing. Ported from TUNO, build 10444." },
      { kind: "new", tool: "All tools", text: "The file says on its face what it is and is not: the ORDER, not the verification. The receiving session still checks every item against what main actually contains before building the production commit \u2014 the queue's own oldest rule, and a nicer file format does not bend it. An export with nothing ticked refuses; a stale tick for an item that has already shipped refuses BY NAME rather than silently dropping it, because an order that quietly shrank is the same lie as a range that quietly shrank." },
      { kind: "improved", tool: "All tools", text: "Both refusals surface as a toast rather than an alert, and the download URL is released afterwards. Nothing about the queue's contents changed: it is still hand-maintained, still beta-only, and still says at the foot not to trust its own list over the changelog and the build numbers." },
    ],
  },
  {
    build: 25206, date: "2026-08-26", title: "The sidebar names the tools; now it numbers them too",
    items: [
      { kind: "improved", tool: "All tools", text: "Every row in the side navigation carries its tool number on the right, T01 through T32, the same permanent numbers the home tiles and the Tool numbers help section already use. They are what a tool is called when somebody quotes one to somebody else, and the sidebar is where you go looking for a tool \u2014 which made it the one place they were missing. Ported from TUNO, where the rail has had them since build 10391." },
      { kind: "fixed", tool: "All tools", text: "The number rides in its own span pushed to the right, and the row is a flex line rather than a block. Appended to the label it would have been the first thing ellipsised on a 240px rail \u2014 on exactly the longer names it is most useful for. Now the NAME truncates and the number stays. The four pages that deliberately carry no number (Overview, What's new, Roadmap, Help) render none rather than an empty gap, and the collapsed rail drops the numbers with the names, keeping both in the hover tooltip." },
    ],
  },
  {
    build: 25205, date: "2026-08-25", title: "Next was answering two different questions at once",
    items: [
      { kind: "improved", tool: "Roadmap", text: "A new era sits between Now and Next: IN BETA TODAY, running on the beta channel and not yet in production. \ud83d\udcd0 CIS Benchmark, \ud83d\udc33 Self-hosting with Docker and \ud83c\udf74 Fork detection move into it \u2014 the three cards already carrying that chip. Next keeps what is planned or partially done." },
      { kind: "improved", tool: "Roadmap", text: "They were answering two different questions from one list. R01 and R06 are running today and can be opened on this site right now; R12 and R13 are ideas with nothing behind them yet. Separated only by a small chip, the difference was easy to miss \u2014 and a reader on the beta channel could not tell which entries they were already able to use. Mixing them makes every row in the list worth less." },
      { kind: "improved", tool: "Roadmap", text: "The new era's timeline dot is filled, because these exist, and deliberately not green, because green means production throughout this map. When one of the three graduates its card moves to Now with the build it went live in, exactly as before: this is a waiting room, not a second home for shipped work." },
    ],
  },
  {
    build: 25204, date: "2026-08-25", title: "Two more blocks that collected all their slack on one side",
    items: [
      { kind: "fixed", tool: "All tools", text: "The Help page and the roadmap timeline sat hard against the left of the content column, so every pixel the column did not use piled up down the right. Both are centred now, and both keep their measure \u2014 920px and 820px are reading widths, so it is the block that moves to the middle, not the text that gets wider. A longer line is not more information." },
      { kind: "improved", tool: "All tools", text: "Found by sweep rather than by waiting for the next screenshot: every rule in the stylesheet with a max-width over 600px, checked for whether it centres. The rest of what that returned is right as it stands and the stylesheet now says so \u2014 modals are centred by their backdrop's flexbox, the tool intro card fills the column deliberately, and a paragraph measure inside a card must start at the card's edge, because centring body text inside a card is a different mistake." },
      { kind: "improved", tool: "All tools", text: "This was never the sidebar's doing. Main is 1180px in production while these blocks are 920 and 820, so the dead strip down the right of the Help page has been there all along; widening the column to 1500 beside the rail only made it impossible to miss." },
    ],
  },
  {
    build: 25203, date: "2026-08-25", title: "The page was centred; the thing inside it was not",
    items: [
      { kind: "fixed", tool: "All tools", text: "The home grid kept the 1180px cap it was given before the sidebar existed, while main widened to 1500px to make room beside the rail. So the section headings and the tiles sat against the left of the column and every pixel of slack collected on the right \u2014 the whole page read as pushed left, even though main itself centres correctly in both rail states. The block is centred in the column now, headings and tiles moving together." },
      { kind: "improved", tool: "All tools", text: "Centred rather than widened, deliberately. Letting the grid fill 1500px produces five columns of minmax(250px, 1fr), and a collapsed section shows four tiles \u2014 so every collapsed section would render four tiles in a five-wide row with a hole where the fifth belongs. Four across is the contract the collapse is built on, and it keeps its measure." },
      { kind: "fixed", tool: "All tools", text: "The footer sits outside main and was still centred on the viewport rather than on the content column, so with a sidebar present it drifted left of everything above it by half the rail. It follows the same offset as main now, in both rail states, and the narrow breakpoint releases all of it together when the sidebar goes." },
    ],
  },
  {
    build: 25202, date: "2026-08-25", title: "The sidebar arrives: every tool on the left, from anywhere",
    items: [
      { kind: "new", tool: "All tools", text: "A side navigation, ported from TUNO: once signed in, every tool sits in a fixed sidebar on the left, grouped exactly as on the home grid, reachable from any screen. The tab bar stays and the two do different jobs - the sidebar is where you CAN go, the tabs are what you HAVE open. The active entry follows the active tab, so the two can never disagree about where you are." },
      { kind: "new", tool: "All tools", text: "The chevron at the top folds the sidebar to a 56px icon rail; hovering the rail peeks it open as an overlay, and picking a tool folds it back. The collapsed state survives a refresh the same guarded-localStorage way the theme does. The content column centres in whatever space the rail leaves, so collapsing reads as a rail folding, not a page relayout." },
      { kind: "improved", tool: "All tools", text: "The signed-in shell widens from 1180px to a 1500px cap beside the sidebar - the header and the tab strip follow the content column. Below 1240px the sidebar goes and the shell returns to the centred column: the tab bar and the home grid keep every tool reachable, so the sidebar is a convenience, never the only door. The sign-in screen keeps its centred card and none of this exists before authentication." },
    ],
  },
  {
    build: 25201, date: "2026-08-24", title: "Items 90, 91, 94 and 95 reached production 297 — and 92 and 93 stayed behind on purpose",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 90 (the action bar hiding under the toolbar), 91 (the host string leaving the header), 94 (the self-host branding gear, S02) and 95 (the per-audience demo retired from the repository) are live in production build 297. Removed from the queue; the numbers are retired rather than reused. productionBuild moves to v1.0.297." },
      { kind: "improved", tool: "All tools", text: "92 (the Docker self-hosting package, R06) and 93 (fork detection, R15) did NOT go, and build 25195 bundled all three of 92, 93 and 94 — so the port was a carve rather than a copy: js/selfhost.js and its three app.js hooks crossed, js/fork.js did not, and production's Content-Security-Policy keeps its current connect-src, because the upstream host was named there for the fork check alone. This is what the queue header means by one item per change: three items in one build cost a hand-separation that three builds would not have." },
      { kind: "improved", tool: "Roadmap", text: "S02's card reads live · beta 25195 · production 297 here and live · build 297 on main. R06 and R15 stay in beta today here and planned there, which is the honest reading on each channel. Main's copies of S01 and S03 are reworded rather than copied: this channel's versions describe a published image and a live fork notice, and production has neither until 92 and 93 follow." },
      { kind: "improved", tool: "All tools", text: "Item 95's reach is the part worth restating now it has landed: production no longer serves the /pvm front door or the mail-domain-triggered look. Anyone still using that entry point gets the default ENCA. The look itself was exported whole into a selfhost-branding.json before the removal, so it can be worn on a self-hosted instance — which is what the gear promoted alongside it exists for." },
    ],
  },
  {
    build: 25200, date: "2026-08-24", title: "The retired demo's name leaves the code, not just the code's behaviour",
    items: [
      { kind: "fixed", tool: "All tools", text: "Retiring the per-audience demo in 25196 removed its pages, logos and branding entry - but the customer's company name and both UPN domains still sat in the served JavaScript: an old changelog entry, a promotion-queue item and a comment in the branding file. All identifying strings are now scrubbed from every tracked file; the historical entries still describe what happened, they just no longer name who it happened with. What remains is the neutral pvm folder path in the ignore rules, which has to stay or the offline folders would be re-added by accident." },
      { kind: "improved", tool: "All tools", text: "Worth knowing about any scrub of this kind: git history is not rewritten by it. The identifiers remain in old commits on both remotes; removing them from history would mean a coordinated rewrite of every clone. The current build serves none of them, which is what the served site and every future fork gets." },
    ],
  },
  {
    build: 25199, date: "2026-08-24", title: "A branded instance stops flashing Limon-IT on every hard refresh",
    items: [
      { kind: "fixed", tool: "All tools", text: "index.html carries the default look as static markup and every app script loads at the end of the body, so on a hard refresh a branded self-hosted instance painted Limon-IT first and swapped to its own look only when the scripts arrived - and the deployment branding file is fetched even later than that. A small blocking script now runs in the head before first paint: it reads the brand this browser already knows - the gear's saved look, or a cache of the last fetched selfhost-branding.json - and injects the palette, logo and favicon before anything is drawn." },
      { kind: "improved", tool: "All tools", text: "The cache mirrors the fetch exactly: stored on success, cleared when the file is gone, untouched on a network error - so a removed branding stops appearing after one load and going briefly offline changes nothing. The one flash that remains is the very first visit in a browser, which has nothing cached yet; avoiding that too would mean a blocking network fetch before every paint, which taxes every load to save the first. The boot stylesheet hands over to the real branding code as soon as it runs, so the two can never disagree for more than a moment." },
    ],
  },
  {
    build: 25198, date: "2026-08-24", title: "Dark mode stops keeping the green to itself under a brand",
    items: [
      { kind: "fixed", tool: "All tools", text: "Under a custom brand, dark mode kept drawing the policy-card header in the default green while light mode wore the brand's colour. Light mode builds that header from the brand variables, but the dark rules hard-coded the muted greens - for the card header gradient, the matrix header, the selection bar and toast, and the page glow. Those are now brand-overridable variables (pchead-a, pchead-b, panel-deep, hero-glow) with the greens as fallbacks, so an unbranded deployment is pixel-identical and a branded dark mode finally matches its light mode." },
      { kind: "improved", tool: "All tools", text: "A branding file's colorsDark can now carry the four new variables; files without them keep the default dark chrome rather than breaking." },
    ],
  },
  {
    build: 25197, date: "2026-08-24", title: "The branding dialog can read the file it writes",
    items: [
      { kind: "new", tool: "All tools", text: "Import from JSON in the branding settings. The dialog could produce a selfhost-branding.json but not read one back - so a look made on one machine, or handed over by a customer, had to be retyped field by field. The new import button loads such a file into the form for REVIEW: nothing is saved or applied until Apply, and the file passes through exactly the same sanitiser as the fetched deployment file, because an imported file earns no more trust than a downloaded one." },
      { kind: "fixed", tool: "All tools", text: "Full palettes now survive the dialog. A branding file can carry every CSS variable per theme, but the form shows only the five identity colours - and Apply rebuilt the palette from those five, silently dropping the rest. The pickers now override their five entries in the palette the form was opened with instead of replacing it, so an imported or hand-edited full palette round-trips intact." },
    ],
  },
  {
    build: 25196, date: "2026-08-24", title: "A gear you can see, and the per-audience demo retires into a branding file",
    items: [
      { kind: "fixed", tool: "All tools", text: "The branding gear next to Sign out was drawn at the button's default text size and was easy to miss entirely - a settings entry nobody finds may as well not exist. It now draws at 21px in the same neutral button: larger glyph, same header height, still only on non-production hosts." },
      { kind: "improved", tool: "All tools", text: "The per-audience demo look was a demo of the override mechanism, and the demo is done: the entry, its logos and the /pvm front door have left the repository and the deployed sites. The look itself was exported whole - names, wordmark and favicon embedded as data URIs, login text, both full colour palettes - into a selfhost-branding.json, so trying it from now on means self-hosting it: serve that one file next to index.html and every visitor gets the branding. BRAND_OVERRIDES ships empty; the machinery - UPN matching, the brand query, the per-theme stylesheet injection - stays, working, for the day a real entry returns." },
    ],
  },
  {
    build: 25195, date: "2026-08-24", title: "Run it yourself: Docker self-hosting, a fork that knows it is behind, and branding without a fork",
    items: [
      { kind: "new", tool: "Self-hosting", text: "R06 first cut. A published Docker image - ghcr.io/nurejev/enca, nginx over these same files, built by CI as :latest from main and :beta from the beta channel - plus a docker compose example, one-command install scripts for Mac (install.sh) and Windows (install.ps1) that check Docker, pull, run and open the browser, and a Deploy to Azure button that stands up an Azure Container App with scale-to-zero, so an idle instance costs close to nothing. SELF-HOSTING.md ties it together and leads with the one step nothing can automate: every host you serve from must be a SPA redirect URI on the app registration - the step that produces the AADSTS50011 sign-in error when missed." },
      { kind: "new", tool: "All tools", text: "R15 fork detection. A copy running on a non-canonical host whose build is older than upstream now says so: a strip under the header reads how many builds behind it is, and opens the What's-new headline of every build in between, with the commands to update a Docker instance or pull main into a reviewed fork. Deliberately not auto-updating - that would defeat the reason for forking - and deliberately silent when upstream cannot be read, because offline or air-gapped is a legitimate way to run this and a wrong claim is worse than none. The Content-Security-Policy names the upstream host in connect-src for exactly this one check." },
      { kind: "new", tool: "All tools", text: "Branding for self-hosted instances, without forking. On any non-production host a gear appears next to Sign out: product and organisation names, logos, login text and light/dark identity colours, through the same override mechanism as the per-audience looks - chrome only, exports keep the neutral product credit. Apply keeps the look in this browser; Download produces selfhost-branding.json, and serving that file next to index.html gives every visitor the branding and softens the red BETA ribbon to a neutral SELF-HOSTED one. The canonical host is deliberately not configurable: it drives the production check and the export credit, and a settings dialog must not be able to make a copy claim to be production." },
      { kind: "new", tool: "Roadmap", text: "The roadmap grew a Self-hosted section with its own S-numbers, for what only makes sense on an instance you run yourself: S01 an optional SQLite store next to the container for Drift watch snapshots, reports and preferences - the hosted site keeps storing nothing anywhere - S02 the branding gear (live), S03 a stated update-channel choice. R06 and R15 moved to in beta today." },
    ],
  },
  {
    build: 25194, date: "2026-08-24", title: "The header said the app name twice, and one of them was not true",
    items: [
      { kind: "improved", tool: "All tools", text: "The host string next to the Tools button is gone. The ENCA chip sits two elements to its left, so the header was saying the same thing twice in a row that also has to fit a tenant name, a user, a theme button and sign-out." },
      { kind: "fixed", tool: "All tools", text: "It was also not what it appeared to be. That label rendered BRANDING.host \u2014 the brand's canonical PRODUCTION host \u2014 rather than the address you are actually on, so on the beta site, on a local server or on any fork it read enca.limon-it.nl while you were somewhere else. A line that looks like a location and is not one is worse than no line: the red BETA banner is what tells you which deployment you are on, and it should not have to argue with the header. BRANDING.host is untouched and still drives that banner, isProdHost, and the credit and stamp on exports." },
      { kind: "improved", tool: "All tools", text: "Its branding hook and the phone rule that used to hide it went with it, so nothing is left referring to an element that no longer exists." },
    ],
  },
  {
    build: 25193, date: "2026-08-24", title: "The action bar was hiding under the toolbar it is supposed to sit below",
    items: [
      { kind: "fixed", tool: "List Policies", text: "The green action bar slid underneath the toolbar and took its own first line with it. That line is the one carrying the policy count and the sentence explaining that Documentation, Backup and Gap analyse act on everything in view \u2014 so what was left was a strip of buttons apparently floating under the filters, with nothing saying what they would act on. The toolbar is z-index 40 and the bar 39, which is deliberate layering; the fault was the offset the bar sticks at, not the stacking." },
      { kind: "fixed", tool: "List Policies", text: "The formula was right and the measurement was stale. The sticky offsets were computed at load, on window resize and on a few render paths \u2014 but these boxes change height for reasons nothing calls a resize: the state chips render after the policies load, Select all grows from (0) to (105), a second open tab wraps the tool nav onto two rows, and the toolbar wraps Collapse all and Refresh onto a second line at some widths and not others. Any of those after the last measurement left the bar sticking at an offset for a toolbar that had since grown." },
      { kind: "improved", tool: "All tools", text: "So the boxes are observed rather than guessed at. A ResizeObserver on the header, the tool tab bar and the list toolbar recomputes the offsets whenever any of them actually changes size, which removes the whole class rather than the one path that was reported. The window resize listener stays as the fallback where ResizeObserver is not available, and the phone layout is untouched \u2014 there both bars are deliberately static, because a sticky toolbar on a phone eats a third of the viewport." },
    ],
  },
  {
    build: 25192, date: "2026-08-24", title: "R39 gets its design: what the second opinion reads, and what it is allowed to say",
    items: [
      { kind: "improved", tool: "Roadmap", text: "R39 is rewritten from a one-paragraph idea into a design. It starts as ONE button on the expanded policy card, next to the per-policy What-If flow, because that is already the corner where you interrogate a single policy. It is called Second opinion rather than anything with Analyse or AI in it: the name is the promise, advisory and labelled as such. A selection of two to five policies comes later, which is where conflict and shadowing analysis actually lives, and the whole set later still." },
      { kind: "improved", tool: "Roadmap", text: "One policy first is not timidity. It is the only scope where the answer can be checked against tools that already know the answer - MS Learn, CIS, the CA validator and the dependency inspector all judge a single policy deterministically. That is also why the model is handed those FINDINGS rather than the raw JSON alone: a model paraphrasing a check adds nothing except a chance to be subtly wrong. Gap analyse already tags every finding with a policy id, so the per-policy slice costs nothing to assemble." },
      { kind: "improved", tool: "Roadmap", text: "Every line it produces has to be one of two things, and they are rendered differently: a RELAYED finding, linked back to the tool that made it and styled like ENCA's own, or ITS OWN reading, marked as opinion and never dressed up as a check. When it contradicts a deterministic result the disagreement is shown loudly rather than resolved quietly - either the model is wrong or a check has a blind spot, and both are worth knowing. It fails soft per R32: it works with nothing but the policy and states what it did not see, which tells you the answer is thinner than it could be and exactly which button makes it better." },
      { kind: "improved", tool: "Roadmap", text: "Redaction is three tiers rather than one switch, because the obvious version destroys the signal. A policy name IS the stated intent, and intent-versus-implementation is precisely what a model is good at. Always replaced: tenant name and domain, user UPNs, object GUIDs. Kept: the baseline convention, CA numbers and the CAB-SEC and CAD-SEC families, which are published documentation rather than a secret. Replaced with the mapping held in the browser so a finding reads back to real names: the tenant's own group and location names, which are facts about that organisation. That split is one ENCA can already evaluate - it is the same convention-or-not question R28's group mapping answers." },
      { kind: "improved", tool: "Roadmap", text: "One exclusion is new. The output never reaches Create documentation alongside the deterministic findings: in one document a model's opinion and a CIS control result look equally authoritative, and they are not. The two that were already there stand - no generated PowerShell, and naming the API host in the Content-Security-Policy is a deliberate reviewable change rather than something to slip in early." },
    ],
  },
  {
    build: 25191, date: "2026-08-24", title: "R39 — AI analysis without growing a backend",
    items: [
      { kind: "new", tool: "Roadmap", text: "R39 — bring your own key and let a model read the policies with you: a second opinion on what a policy set actually does, and the useful half, which of them fight each other and how to resolve it. The obvious way to build that is a small server holding the key and forwarding the calls, and the card records outright that ENCA is not going to grow one. Static files in a browser, no server, nothing stored anywhere — that promise is worth more than the convenience of any single feature." },
      { kind: "new", tool: "Roadmap", text: "It does not need one. The Anthropic API can be called directly from the browser — CORS is enabled for it, opted into with a request header — so a bring-your-own-key analysis stays fully static. The card fixes the handling now rather than at build time: the key is pasted per session and held in memory, never in localStorage where it would outlive the tab and end up in a profile backup; it goes to one host and nowhere else; and the whole feature is off until somebody types a key in. Tools that reach for a proxy here are solving a problem this architecture does not have." },
      { kind: "improved", tool: "Roadmap", text: "The prerequisite is named rather than assumed: ENCA has no redaction pass today. A policy set carries the tenant's name, its group names, break-glass UPNs and the shape of its administrative model, and sending that to a third party because a checkbox was ticked is not a trade to make quietly. So the first half of the item is redaction in 📄 Create documentation — stable placeholders, the mapping kept in the browser so a finding reads back to real names — and the analysis rides on it. That redaction earns its place on its own: every export this tool already produces leaves the building with those names in it." },
      { kind: "improved", tool: "Roadmap", text: "Two things the card rules out in advance. No generated PowerShell — ENCA ships scripts written and tested deliberately, and a model improvising one that writes to a tenant is the wrong shape for a toolset whose pitch is that it cannot do much harm. And the model's output is never presented as a finding of ENCA's own; it is a second reader, labelled as one, with the redacted payload it saw available to inspect. Adding the API host to the Content-Security-Policy is called out as a deliberate, reviewable change rather than something to slip in early." },
    ],
  },
  {
    build: 25190, date: "2026-08-21", title: "Items 88 and 89 reached production 296, and the guard learned about the other branch",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 88 (🧷 Update pre-requirements in 🧬 Baseline Policies) and 89 (the two dropdowns that did not look like dropdowns) are live in production build 296. Removed from the queue; the numbers are retired rather than reused. productionBuild moves to v1.0.296. Both tiles already carried UPDATED, so nothing new had to be flagged — which is what the tag discipline is supposed to feel like." },
      { kind: "fixed", tool: "All tools", text: "tools/check-plain-text.js read js/promote.js unconditionally, and this file is beta-only by design. The script is per-clone tooling that follows the working tree across branches, so the pre-commit hook its own header recommends would have thrown ENOENT and refused every commit on main — a guard that blocks the branch it was never meant to check. A file that is not on this branch is now nothing to check; a file that exists and cannot be parsed still throws, because that is a real problem. It went to production with 296 for the same reason: one hook, both branches." },
      { kind: "improved", tool: "All tools", text: "The queue is 34 and 24 again — the ❓ Help section for 📐 CIS Benchmark, and 📖 Baseline usage guide (R05). Neither moves without its tool, and neither tool is leaving this channel yet." },
    ],
  },
  {
    build: 25189, date: "2026-08-21", title: "The guard that only fires after the commit now runs before it",
    items: [
      { kind: "fixed", tool: "All tools", text: "Build 25188 put two formatting tags into its own changelog entry, so the beta page rendered them as literal angle brackets with the markup chip beside them. Stripped, emphasis carried in the words. That is the second time in a fortnight, and both times the self-check did its job and nobody was looking: it console.warns on every channel and shows a chip on beta, but both happen AFTER the commit is made." },
      { kind: "new", tool: "All tools", text: "tools/check-plain-text.js runs before it. It scans js/changelog.js, js/promote.js (title, what, why and every line of a test checklist) and the per-tool notes in js/version.js, names the file and the exact tags, and exits non-zero. It reuses the same regex as the in-app CL_MARKUP check on purpose - two copies that disagreed would be worse than one that is late. Its header carries the one-line git hook that makes it automatic." },
      { kind: "fixed", tool: "All tools", text: "Promotion queue items 61 and 62 had no test checklist. Every other item carries one, because the checklist is how the item gets verified before it ships rather than after; without it the reader has to reconstruct what to look at from the description. Both now have one, and the pre-requirements item leads with the check that matters - it must capture every policy, not the current selection." },
      { kind: "fixed", tool: "All tools", text: "Those two items were also numbered 61 and 62, which had already been used and shipped: 61 was the licence gap and 62 was the sign-in-failures interrupt attribution, both live in production since build 290. A number identifies one decision permanently, which is the entire reason for numbering them - push 61 has to mean one thing forever. They are renumbered 88 and 89, the next free numbers after 87." },
    ],
  },
  {
    build: 25188, date: "2026-08-20", title: "Two dropdowns that did not look like dropdowns",
    items: [
      { kind: "fixed", tool: "Protect exclusions", text: "The FALLBACK ADMINISTRATIVE UNIT picker rendered as a bare native control — no border treatment, no pointer cursor, and in dark mode a black box that looked nothing like every other dropdown in the app. Styling a select here is opt-in (class=\"btn\", or sitting inside a .wi-f wrapper), so a select added without it simply comes out unstyled. It now matches the rest. The CSV persona-mapping dropdown in ⑤ Import members had the same omission and is fixed with it — those were the only two." },
      { kind: "improved", tool: "All tools", text: "Because the styling is opt-in, the next one would have gone the same way. The verification now catches both kinds: the boot harness checks every select in the page DOM, where it can tell whether one sits inside a styled wrapper, and a source scan covers the selects written into JS templates — which never exist until a panel renders, and are exactly the ones that get forgotten. The source scan skips selects inside a standalone exported document (Gap analyse's HTML report ships its own stylesheet, so bare is correct there), deciding by the enclosing function rather than a fixed window, so a real miss in a neighbouring function is not swallowed with it." },
    ],
  },
  {
    build: 25187, date: "2026-08-20", title: "Baseline update pre-requirements",
    items: [
      { kind: "new", tool: "Baseline Policies", text: "\ud83e\uddf7 Update pre-requirements \u2014 one click, before you change anything, for the three things that cannot be captured afterwards. A configuration SNAPSHOT (JSON) goes first, because it is the only one that can be diffed against a later read in \ud83d\udcc9 Drift watch: it is what answers \"what did this change?\". Then a full policy BACKUP with every dependency resolved \u2014 groups, named locations, authentication strengths and contexts, terms of use \u2014 because a policy backup without its dependencies restores to a policy pointing at ids the tenant may no longer have, which is not a backup. Then DOCUMENTATION as Markdown, for the change record and the reviewer." },
      { kind: "improved", tool: "Baseline Policies", text: "It captures EVERY policy, not the current selection: a pre-requirement that took whatever happened to be ticked would be worse than none, because it would look complete. The three artefacts are attempted independently, so one failing does not cost the other two, and the run always ends in a report saying which were captured \u2014 with anything unreadable named rather than skipped silently: an area the snapshot could not read, a dependency that failed to fetch. A backup with a silent hole in it is the kind you find out about while restoring." },
      { kind: "improved", tool: "Baseline Policies", text: "If any step failed the report says so and tells you not to start the update, because a failed pre-requirement is not a formality \u2014 it is the copy you would have restored from. The report also states what each artefact answers and warns to keep all three together: the snapshot without the backup tells you what broke but not how to undo it." },
    ],
  },
  {
    build: 25186, date: "2026-08-20", title: "Items 86 and 87 reached production 295, and the tile that should have said so",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 86 (the brief missing every device requirement written as a block) and 87 (the brief tied to the baseline revision it was checked against) are live in production build 295. Removed from the queue; the numbers are retired rather than reused. productionBuild moves to v1.0.295. 86 was the only HIGH-risk row in the queue and it was high risk because production was already wrong: the brief that gets handed to end users omitted CA205, CA301 and CA309 entirely." },
      { kind: "fixed", tool: "User impact brief", text: "The tile carried no NEW, BETA or UPDATED tag through 25184 and 25185 — the two builds that fixed a wrong brief and then tied it to the catalog. That tag is not decoration: it is what exempts a tile from the home-page collapse and lifts it to the top, so both builds landed behind “Show N more” unless you already knew to expand. Exactly the failure build 25146 was written about, on a tool whose output goes to the whole company. It is flagged now, on both channels." },
      { kind: "improved", tool: "All tools", text: "Production's release note for 293 now names (R38) the way its roadmap card always did — main described the item in the body but not the title, while this channel had it in both. Documentation is not queued; it travels with the next promotion, which is what it did." },
      { kind: "improved", tool: "All tools", text: "The queue is 34 and 24 again. Neither moves without its tool, and neither tool is leaving this channel yet: 34 is the ❓ Help section for 📐 CIS Benchmark, and 24 is 📖 Baseline usage guide (R05)." },
    ],
  },
  {
    build: 25185, date: "2026-08-20", title: "The brief now knows which baseline it was written against",
    items: [
      { kind: "new", tool: "User impact brief", text: "T32 is tied to T10 \ud83e\uddec Baseline Policies, because it has always depended on it without saying so. These rules match on POLICY SHAPE, and the bundled catalog decides what shape a requirement is written in. That is not theoretical: revision 2026-08-20 moved CA205 and CA301 from a compliant-device grant to a block with a device filter \u2014 the same requirement, expressed the only way Entra allows \u2014 and the brief silently stopped covering either of them. Nothing connected the two, so the next revision would have done it again." },
      { kind: "improved", tool: "User impact brief", text: "The rules now carry the revision they were last verified against. When the loaded catalog is newer, the brief says so at the top: both dates, what kind of thing a revision can change, and a link straight to Baseline Policies to compare. The same caveat is written into the Markdown and the Word export, under the title rather than at the end \u2014 a brief handed to people outlives the screen it was generated on, and that is the copy that gets quoted back at you." },
      { kind: "improved", tool: "Baseline Policies", text: "js/baselineData.js tells whoever bumps the revision what else to do: walk the brief's rules against the new catalog, then move the date. The on-screen warning is the safety net, not the process. A catalog that is absent, unreadable or OLDER than the rules is treated as fine and says nothing \u2014 a missing integration must not turn into a warning about something else." },
    ],
  },
  {
    build: 25184, date: "2026-08-20", title: "The brief left out every device requirement written as a block",
    items: [
      { kind: "fixed", tool: "User impact brief", text: "The company-device item matched a compliantDevice GRANT and nothing else \u2014 it explicitly excluded blocks. But Entra has no grant control meaning require Entra joined: only compliantDevice and domainJoinedDevice exist, so the baseline expresses that requirement the only way it can, as a BLOCK on everything a device filter does not cover. CA205 and CA301 (blocked unless Entra joined or hybrid joined) and CA309 (selected apps blocked unless compliant) were therefore absent from the brief altogether. Somebody reading it was told their Mac must be enrolled and never told that a Windows machine which is not joined is refused outright." },
      { kind: "improved", tool: "User impact brief", text: "Both forms now land in one item per audience, because to the person reading this they mean one thing: a personal or unmanaged machine will not get you in. The text names whichever consequences actually apply \u2014 enrolled and compliant, refused outright if not joined, or both \u2014 rather than one sentence covering cases that may not be in scope. And domainJoinedDevice, the hybrid-join grant, is recognised for the first time; it had never been matched at all." },
      { kind: "fixed", tool: "User impact brief", text: "The direction of a device filter is honoured, which is the difference between the requirement and its opposite. A filter names a set and the mode says whether the policy applies to that set or to everything else: exclude plus a positive rule blocks the devices that are NOT joined, and so does include plus a negated one. The other two combinations block company devices instead, and are deliberately not described as requiring one. Session policies carrying a device filter (CA005, CA007, CA202, CA206, CA214) stay out entirely \u2014 they limit what a session can do, they do not decide whether you get in." },
    ],
  },
  {
    build: 25183, date: "2026-08-20", title: "Items 84 and 85 reached production (294)",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 84 (\ud83d\udde3 User impact brief can re-read the tenant, and says how old its answer is) and 85 (\ud83c\udfab Licence gap, \ud83d\udde3 User impact brief and \ud83d\udcaa Authentication strengths out of BETA, the first two renumbered 1.0) are live in production build 294. Removed from the queue; the numbers are retired rather than reused. What remains is the two beta-only tools, and neither can move without its tool." },
    ],
  },
  {
    build: 25182, date: "2026-08-20", title: "Three tools stop calling themselves unproven",
    items: [
      { kind: "improved", tool: "All tools", text: "\ud83c\udfab Licence gap, \ud83d\udde3 User impact brief and \ud83d\udcaa Authentication strengths are out of BETA. The chip comes off in all three places it appears \u2014 the home tile, the Help heading and the tool's own screen header, two of which are rendered from app.js rather than the markup and are exactly the ones a tile-only sweep would miss." },
      { kind: "improved", tool: "All tools", text: "Licence gap and User impact brief are renumbered 1.0. js/version.js has said since build 25078 that a tool which has reached production is at least 1.0 \u2014 whatever it accumulated on the beta channel, something a customer can open is not a 0.x thing, and it is the BETA chip rather than the version number that says still proving itself. Authentication strengths was already 1.0 and only carried the chip." },
      { kind: "improved", tool: "All tools", text: "Four tiles keep theirs, and should: \ud83d\udcd6 Baseline guide and \ud83d\udcd0 CIS Benchmark run on this channel only, \ud83d\udcdc Terms of use has not been asked for yet, and \ud83d\udeab Disable group nesting depends on a Graph property that is not generally available. A chip that everything carries is decoration; these four are the ones that still mean something." },
    ],
  },
  {
    build: 25181, date: "2026-08-20", title: "A brief you send to other people should not be quietly stale",
    items: [
      { kind: "new", tool: "User impact brief", text: "\u27f3 Re-read & analyse. This tool is DERIVED from the policy set already in memory rather than reading the tenant for itself, which is what makes it instant \u2014 and also means it was exactly as current as whenever the policies were last loaded, with nothing on screen saying when that was. The button re-reads the tenant, rebuilds the brief, and returns you HERE: a refresh normally ends on the policy list, and a re-read pressed inside a tool should not move you to a different one." },
      { kind: "improved", tool: "User impact brief", text: "The header says how old the answer is \u2014 just now, 5 min ago, 3 d ago \u2014 and says outright that policies change, so re-read before sending it anywhere. This is the one output in ENCA written to be handed to other people; a brief describing what users will notice, quoting policies that were edited this morning, is exactly the document that gets quoted back at you." },
      { kind: "fixed", tool: "All tools", text: "The tenant load now reports whether it actually succeeded, and stamps the policy set with a read time. Both were needed for the above and neither existed: without the first, a re-read whose sign-in had expired would have drawn the tool over the login screen; without the second, no tool that derives from the loaded policies could say how fresh it is. The read time is available to any of them now." },
    ],
  },
  {
    build: 25180, date: "2026-08-20", title: "Items 80 to 83 reached production 293",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 80 (🎚 Report-only impact's chips and search), 81 (👥 REMOVE starting from what is assigned), 82 (the 2026-08-20 baseline catalog) and 83 (R38, restoring a policy's own exclusion group) are live in production build 293. Removed from the queue; the numbers are retired rather than reused. productionBuild moves to v1.0.293. That is everything this channel had built since 25175 — the four items and the four builds are the same set." },
      { kind: "improved", tool: "Baseline Policies", text: "Item 82 is the one that was quietly costing something every day it waited. Production was measuring every tenant against the 2026-07-21 revision, so it told customers CA205 and CA301 should be compliant-device grants when the baseline had already moved them to a BLOCK with an Entra-joined device filter. A stale catalog does not fail; it answers confidently and wrongly, and the answer is the one people act on. Both channels are on 2026-08-20 now." },
      { kind: "improved", tool: "Roadmap", text: "R38's card reads live · beta 25179 · production 293 on this channel and live · build 293 on main — step 3 of the promotion routine, the one that gets missed because the port is finished and working by the time it comes round. Items 80, 81 and 82 carry no Rnn reference and so have no card on either channel." },
      { kind: "improved", tool: "All tools", text: "The queue is 34 and 24 again, and both are stuck by design: 34 is the ❓ Help section written for 📐 CIS Benchmark, and a Help entry for a tile production does not have is a lie; 24 is 📖 Baseline usage guide (R05), whose prose has to survive real deployments first. Neither moves without its tool, and neither tool is leaving this channel yet." },
    ],
  },
  {
    build: 25179, date: "2026-08-20", title: "Put back the exclusion group a policy has lost (R38)",
    items: [
      { kind: "new", tool: "List Policies", text: "👥 Assign groups or roles gains an eighth action, and it is the only one that does not aim a single group list at everything you selected: RESTORE each policy's own CAxxx-Exclusion group. The baseline's per-policy exclusions cannot work the other way — CA200 wants CA200-Exclusion and CA201 wants CA201-Exclusion — so this action aims a DIFFERENT group at every policy, read from the CA number in the name. It exists because that reference is the first thing to go missing: a policy gets rebuilt, an older version is imported, somebody tidies an exclusion list, and the group is left in the directory with nothing pointing at it. Nothing notices, because a policy that lost its exclusion group looks exactly like one that never had it — until the day the exception it existed for is needed and the bypass is not there." },
      { kind: "new", tool: "List Policies", text: "Step 2 is a drift REPORT rather than a list of things to tick: how many policies are already correct, how many have lost the reference, how many name a group that does not exist in this tenant, and how many have no convention group at all. Only the repairs arrive ticked. Scope it to a selection to fix one policy, or to EVERY policy in the tenant for the sweep — the same question asked of everything, which is the only way to find out how far an estate has drifted. Groups that do not exist yet can be created from their baseline templates in the same run." },
      { kind: "improved", tool: "List Policies", text: "The group name is taken from the baseline catalog wherever the catalog has that CA number, which also means it knows when there is nothing to restore: 14 of the 99 baseline policies legitimately have no exclusion group of their own, and those are reported as such rather than having one invented for them. A policy carrying a CA number the catalog does not have gets the convention applied by inference and is labelled “derived”, so an assumption is visible before it is ticked. Nothing is ever replaced — the group is added to whatever the policy already excludes — but an exclusion WIDENS a policy, so a tenant-wide run asks for the typed ALL and the change report records the policy → group pairing instead of one group list." },
      { kind: "fixed", tool: "List Policies", text: "The REMOVE panel added in the previous build threw “asAssignedGroups is not defined” and stopped at “Reading the current assignment…” for everybody. Its helper functions were declared inside the wizard's Directory roles branch, and a function declaration inside a block is only assigned when that block actually runs — so the panel worked only if you had visited Directory roles first, which nobody does when Groups is the default target. They are declared at module level now, where they exist before the first render. Found by running the feature's own first test step, which is the argument for writing them." },
    ],
  },
  {
    build: 25178, date: "2026-08-20", title: "Baseline catalog revision 2026-08-20",
    items: [
      { kind: "improved", tool: "Baseline Policies", text: "The CloudFellows catalog is re-cut from the 2026-08-20 reference export. Same 99 policies — none added, none retired — and three real changes, all of them moving OFF a compliance grant. CA205 (Internals) and CA301 (Externals) both required a device marked compliant; both are now a BLOCK with a device filter, because there is no grant control that says “must be Entra joined” — the list is compliant device and hybrid joined device, nothing else — so the requirement has to be written as a block on everything that is not. CA205 admits Entra joined only; CA301 admits both join types, so hybrid joined devices are not locked out. CA213 (Internals) now includes the Persona-Internals group rather than a bespoke CA213-Inclusion group. The catalog revision moves to 2026-08-20 while the release stays R26.6 (v3.x): a tenant on the older patch versions is not out of release, only out of revision, and the tool header says which." },
      { kind: "fixed", tool: "Baseline Policies", text: "Most of what a naive re-cut would have called a change was not one. The guest-type wording moved on nine policies — “Guests/external: Local guests, B2B collaboration guests…” became “Guests & external users (all types, incl. service providers)” — because ENCA renders that selection more precisely now than it did when the July catalog was generated; the policies never changed. Group ORDER varies between reads for the same reason. Both were compared out rather than written in, so the diff the tool shows a tenant is about the tenant." },
      { kind: "improved", tool: "Baseline Policies", text: "Two things in the reference export were deliberately NOT taken, so the catalog stays a baseline rather than a copy of one tenant. Fifty-eight policies had dropped their own CAB-SEC-U-CAxxx-Exclusion group there; read as drift in that tenant rather than a redesign, the references are carried forward — the catalog and the bundled group templates have to reconcile exactly, and dropping them would leave 58 templates creating groups no policy names. And CA001 excluded a SEC-VIP-Exceptions group, which is outside the CAB-SEC convention and has no template, so shipping it would tell every tenant to create a group the baseline never defines. Both departures are written into the head of js/baselineData.js, where the next re-cut will find them." },
    ],
  },
  {
    build: 25177, date: "2026-08-20", title: "Removing an assignment started from a list of things that were not assigned",
    items: [
      { kind: "fixed", tool: "List Policies", text: "The two REMOVE actions in \ud83d\udc65 Assign groups or roles asked step 2 the wrong question. REMOVE acts on what a policy ALREADY has, and the panel offered the baseline catalog: ticking a group the policy never referenced did nothing at all, and a group that IS assigned but is not part of the baseline never appeared, so it could not be removed from here. The one action whose target set the tool can know for certain was the one that made you guess it. Step 2 now lists the groups the selected policies actually carry in that bucket." },
      { kind: "improved", tool: "List Policies", text: "They arrive TICKED, because for a removal the useful question is which ones should stay: untick those, and whatever is still ticked comes off. Untick all and Tick all sit above the list with a live count of what will be removed. Where several policies are selected each row says how many of them carry that group, and only those are rewritten." },
      { kind: "new", tool: "List Policies", text: "Names are read per object id rather than looked up in the baseline, so a group with any name at all shows correctly \u2014 and an id the directory no longer has is labelled a dangling reference instead of being rendered as its own GUID. Clearing one of those is a good reason to run this action, not an edge case. If the name read fails the group is still listed and still removable, marked as unresolved rather than dropped." },
      { kind: "improved", tool: "List Policies", text: "Selected policies with nothing in that bucket now say so and point at Back, instead of showing a catalog of groups that removing could not affect. And a REMOVE across the whole tenant asks for the typed ALL that tenant-wide rewrites already ask for: the list arrives fully ticked by design, so stripping every exclusion in the tenant would otherwise be three clicks with nothing in the way." },
    ],
  },
  {
    build: 25176, date: "2026-08-20", title: "Chips that counted one thing while the list showed another",
    items: [
      { kind: "fixed", tool: "Report-only impact", text: "The verdict chips read All (31), would block (5), prompts (4), no change (6) directly above the words \u201cNo report-only policy matches the current filter\u201d. Both were rendered from the same run and they disagreed about it: the chips counted every policy, the list counted what the search had left. Numbers win that argument with the reader, so the screen looked broken rather than empty. The chips now count the searched set, and they recount as you type." },
      { kind: "fixed", tool: "Report-only impact", text: "They also counted the wrong subject in Per user. That view filters on the worst verdict per USER, while the chips were showing per-POLICY counts \u2014 including a never in scope chip that no user can ever carry, so clicking it could only ever produce an empty list. Each view now counts its own rows." },
      { kind: "new", tool: "Report-only impact", text: "The box searches the GROUPS a policy targets, and suggests as you type. A deployment group is how a policy is scoped and it appears nowhere in the policy's own name, so searching one \u2014 the first thing anybody reaches for \u2014 returned nothing, with no hint that the box had never looked there. Suggestions come from this run: policy names and their target groups in Per policy, UPNs in Per user, so a typed term cannot silently match nothing." },
      { kind: "improved", tool: "Report-only impact", text: "An empty list says which of the two controls emptied it and carries the undo. Nothing matching the search quotes the term and states what the box actually searches; a search that hits while the chosen verdict has none of it gives both numbers and offers show all N as well as clear the search; a verdict empty with no search offers only the verdict reset. A verdict chip that drops to zero under a search stays visible rather than disappearing \u2014 a filter you cannot see is a filter you cannot clear." },
    ],
  },
  {
    build: 25175, date: "2026-08-20", title: "Item 79 reached production 292, and the queue is back to the two that cannot move",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue item 79 — 🖥 Device reality check's duplicate run button, and the Try again both it and 🎫 Licence gap were missing on a run that ends without a result — is live in production build 292. Removed from the queue; the number is retired rather than reused. productionBuild moves to v1.0.292. No roadmap card carries it: like 78, it is a wiring fix with no Rnn reference, so steps 2 and 3 of the promotion routine do not apply." },
      { kind: "improved", tool: "Device reality check", text: "Worth recording where the fix landed on each channel, because the two numbers differ: the Rescan pattern reached production with 🎫 Licence gap at 290, and the gap it opened — a failed read leaving no run control at all — was found here one build later and is closed in production at 292. Production never ran Device reality check with the duplicate button hidden and no Try again behind it, which is the only reason this was a small fix rather than a broken tool on the live site." },
      { kind: "improved", tool: "All tools", text: "The queue is 34 and 24 again, and neither can move on its own: 34 is the ❓ Help section written for 📐 CIS Benchmark, and 24 is 📖 Baseline usage guide (R05). Both travel with their tool, and both tools stay on this channel by design. An empty-looking queue here means the two channels differ only by the things that are meant to differ." },
    ],
  },
  {
    build: 25174, date: "2026-08-20", title: "Item 78 reached production 291",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue item 78 — 🗣 User impact brief opening without a tab, and the console warning for a breadcrumb name that resolves to none — is live in production build 291. Removed from the queue; the number is retired rather than reused. productionBuild moves to v1.0.291. No roadmap card carries it: the item is a wiring fix with no Rnn reference, so steps 2 and 3 of the promotion routine do not apply, and saying so is cheaper than somebody later looking for the card that was never there." },
      { kind: "improved", tool: "User impact brief", text: "Production 291 also carries the release note this channel already had and main did not: 290 tagged 🗂 List Policies as UPDATED while nothing in its notes named the tool. Queue item 76 changed that screen and its note had been filed under 🔍 Gap analyse alone. Nothing about the code moved — only what production says about itself, which is the half of a release that is easiest to leave half done." },
      { kind: "improved", tool: "All tools", text: "What is left in the queue is 79, and 34 and 24 behind it. 79 is a day old and has not been looked at on a real tenant yet; 34 and 24 cannot move at all without the tools they belong to." },
    ],
  },
  {
    build: 25173, date: "2026-08-20", title: "Two Check the coverage buttons, and no way back from a failed read",
    items: [
      { kind: "fixed", tool: "Device reality check", text: "The toolbar carried \u25b6 Check the coverage right next to the big one in the run prompt, and before a first run the two did exactly the same thing. The toolbar button is now \u27f3 Rescan and exists only once there is a result worth redoing \u2014 the shape Change audit uses and \ud83c\udfab Licence gap adopted in 25164." },
      { kind: "fixed", tool: "Device reality check", text: "Hiding that button exposed a worse problem underneath it. Two paths leave a run early \u2014 a declined Intune consent, and a failed read \u2014 and both write their explanation over the run prompt and return without re-rendering. With a toolbar button that only appears once there is a result, that left the tool with NO run control anywhere: the message told you what went wrong and gave you nothing to do about it short of leaving the tool and coming back. Both panels now carry Try again." },
      { kind: "fixed", tool: "Licence gap", text: "The same trap has been live here since 25164, when the Rescan pattern was introduced: a failed tenant read replaced the prompt with an error and hid the toolbar button, and the tool could only be recovered by reopening it. Its error panel carries Try again now too. The pattern is worth keeping \u2014 it just has to account for the runs that never produce a result." },
    ],
  },
  {
    build: 25172, date: "2026-08-19", title: "A tool that opens without a tab, and the one word that did it",
    items: [
      { kind: "fixed", tool: "User impact brief", text: "Opening the tool added no tab, and the home button stayed lit while you were standing on it. The cause is one word: the tool announced itself as 🗣 User impact brief and the tab registry had it as 🗣 User impact. The lookup matches the label exactly, found nothing, and took the branch meant for going home — which both skips pushing a tab and clears the active one. The two strings are the same now. It shipped to production 290 this way, which is the part worth remembering: nothing failed, nothing threw, and the only symptom was a missing tab on a tool nobody had opened twice yet." },
      { kind: "new", tool: "All tools", text: "A crumb name that resolves to no tab now says so in the console on any non-production host — the same isProdHost guard the changelog markup check uses. This is the second silent-string bug in a month (the changelog's own markup was the first) and the lesson is the same: an exact-match lookup with a quiet fallback will ship, because the fallback is a legitimate state for a different caller. Going home is still silent, because crumb(\"\") means exactly that." },
    ],
  },
  {
    build: 25171, date: "2026-08-19", title: "Seven of the nine reached production 290, and the queue is down to the two that cannot move",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 67 (R28 — a tenant's own groups in the persona vaults), 70 (the 🔍 Gap analyse coverage flow), 73 and 74 (🎫 Licence gap: one run button, and the user read finished on big tenants), 75 (🚫 disable nesting is opt-in until it is GA), 76 (a way out of Gap analyse that says what it does) and 77 (🗣 User impact brief) are live in production build 290. Removed from the queue; the numbers are retired rather than reused. productionBuild moves to v1.0.290." },
      { kind: "improved", tool: "Conditional Access groups", text: "Item 75 is the one worth naming on its own: it was the only high-risk row in the queue, and it was high risk because production was already broken by it. Since build 284 every create path there set disableNesting by default, so on a tenant whose directory does not carry the property every single group created ended in a red failure — and the failure text sent the reader to ⑧ Disable nesting, which retried the same call and then offered to recreate the group. That dead end is gone from production as of 290." },
      { kind: "improved", tool: "Restricted AUs", text: "R28 was held back from production 287 while the seven items around it went, because it is the only change in that batch that alters where a write puts a group object. It ships in 290, one release behind its neighbours. Its roadmap card here now reads live · beta 25153 · production 290 rather than held from production, and the card's closing paragraph says so — the held wording exists to be temporary, and a card still claiming it after the item shipped is the same drift the wording was invented to prevent." },
      { kind: "new", tool: "User impact brief", text: "The tool had no ❓ Help entry — it was added on both channels in the promotion, because a tile a customer can open and nothing in Help explaining it is not a finished tool. The entry says what the brief is derived from, that every statement names its policies, how live-now is separated from at-go-live, which audiences exist and which are deliberately not audiences, and that the risk in BETA is wrong words rather than wrong writes. The 🚚 only here chip is off the tile: production carries it now." },
      { kind: "improved", tool: "All tools", text: "What is left in the queue is items 34 and 24, and neither can move by itself: 34 is the ❓ Help section written for 📐 CIS Benchmark, and a Help entry for a tile production does not have is a lie; 24 is 📖 Baseline usage guide (R05), whose prose has to survive a few real deployments first. Both travel with their tool. The CIS tool and this queue remain permanent residents of the beta channel." },
    ],
  },
  {
    build: 25170, date: "2026-08-19", title: "The baseline speaks first",
    items: [
      { kind: "improved", tool: "User impact brief", text: "The persona baseline (the CAxxx-numbered policies) is analyzed FIRST and carries the whole brief; policies without a persona CA number — a tenant's own ad-hoc set, an interim baseline — are analyzed last, in their own trailing section on screen, in the Markdown and in the Word export, marked as possibly temporary. One build in, the tool's first real tenant showed why: six interim DEVCF policies sat enforced next to 99 prepared baseline policies, and a brief that mixes the two announces a temporary 8-hour session rule with the same weight as the design it is about to be replaced by. The split uses the same persona rule Backup and the Gap checks already apply — a CAxxx number in the name — so the three tools cannot disagree about what the baseline is." },
    ],
  },
  {
    build: 25169, date: "2026-08-19", title: "The rollout email, written by the tenant itself",
    items: [
      { kind: "new", tool: "User impact brief", text: "A new tool (T32): the question every Conditional Access rollout stumbles over is not whether the policies are right but what to TELL PEOPLE — what they will notice, and what will deliberately no longer be possible. Writing that email by hand from a hundred policies means it is written once, goes stale, and describes the design rather than the tenant. This tool derives it from the policies actually deployed: 23 rules translate configuration into end-user language — MFA and phishing-resistant strengths, legacy-auth and device-code blocks, app protection on phones, view-only sessions on unmanaged devices, session lifetimes, country allowlists, the secure-network client, compliant devices, guest allowlists, admin O365 blocks, risk handling, guarded MFA registration, the Azure DevOps lockdown — each statement grouped per audience and backed by the named policies, with click-through to the policy card." },
      { kind: "new", tool: "User impact brief", text: "The states do the honest work: a statement backed by an enforced policy is marked live now, report-only reads as staged, Off as at go-live — so the brief never announces something that already happened, or promises today what only arrives at go-live. Service accounts, workload identities and the break-glass set are deliberately not audiences: nobody emails a service principal. Export is a Markdown draft through the report viewer or a text Word document built in the browser, both ending with an appendix naming the policies behind every sentence — the communications team gets a draft, the reviewer gets the evidence." },
    ],
  },
  {
    build: 25168, date: "2026-08-19", title: "A view picker with nothing selected is not a view picker",
    items: [
      { kind: "fixed", tool: "Gap analyse", text: "Gap analyse renders inside the List Policies screen rather than on one of its own, and that screen's Cards / List / Matrix picker stayed up over it. It could only switch AWAY from Gap analyse, never within it, and none of the three was highlighted \u2014 because none of them was where you were. A picker showing no selection reads as one that has lost its place. Worse, its Matrix means the policies-by-settings grid, while the Matrix tab in Gap analyse's own toolbar means users by policies: two buttons carrying one label on a single screen, and the only reason they never appeared side by side is that the second does not render until a run has finished." },
      { kind: "improved", tool: "Gap analyse", text: "The picker is hidden while Gap analyse is showing \u2014 the same treatment the policy search box, the state chips and the select-all already had \u2014 and one button labelled with what it does takes its place: \u2190 Back to policies. It returns you to whichever view you came from, so leaving the Matrix for Gap analyse and coming back lands on the Matrix rather than dumping you on Cards. Opened straight from the home tile, it falls back to the last policy view used." },
      { kind: "fixed", tool: "List Policies", text: "That exit had to exist rather than simply removing the picker: the green action bar is hidden in this view too, so the picker was the only control on the screen that could get you out of Gap analyse. Hiding it on its own would have left the tab bar as the only way back." },
    ],
  },
  {
    build: 25167, date: "2026-08-19", title: "The guard was right, and the build after it was not",
    items: [
      { kind: "fixed", tool: "All tools", text: "Build 25166 wrote 22 formatting tags across five of its own changelog items \u2014 b, i and code \u2014 five builds after 25162 added the check that catches exactly that, and one build after the check reached production. The beta page duly rendered them as literal angle brackets with a markup chip beside every one, which is the guard doing its job while nobody read it. The tags are stripped and the emphasis is carried in the words, as the header of this file has asked since 25156. js/promote.js and the per-tool notes in js/version.js were checked at the same time and are clean \u2014 both are escaped when rendered, so the same rule governs them." },
    ],
  },
  {
    build: 25166, date: "2026-08-19", title: "Disable nesting was promising something the directory refuses",
    items: [
      { kind: "fixed", tool: "CA groups", text: "A real tenant answered EVERY disableNesting write with 400 Request_BadRequest \u2014 \u201cUnexpected request made to property 'disableNesting' of resource 'Group'\u201d \u2014 on the create body as well as the PATCH. That wording is the directory saying it does not know the property NAME: not that it dislikes the value, and not \u201csettable only at creation\u201d, which is what the field reports had led us to assume. Checking Learn again settles it. The v1.0 Update group page names the property once, in a permissions note; the beta page does not list it as updatable; and NEITHER version's group resource carries it, in the property table or the JSON representation. The permission is documented, the property is on no published schema. It is not generally available." },
      { kind: "improved", tool: "CA groups", text: "So it is OFF BY DEFAULT on every create path, and offered as a tick in \u2460 Create missing groups and \u2461 Build a group manually instead. Since build 284 it was applied automatically everywhere \u2014 right in principle, and in a tenant without the property it meant a red failure line under every single group created, for a setting the panel had promised in its footnote. One constant, CaGroups.NESTING_GA, flips the default back the day Microsoft ships it, without touching a caller. \u2466 Migrate's nesting box follows the same default, and the nesting permission is requested only when the box is ticked." },
      { kind: "fixed", tool: "CA groups", text: "The request also goes to v1.0 now, for this property only. ENCA talks to /beta everywhere, and the only Learn page that names disableNesting is the v1.0 one \u2014 so a tenant that HAS the property should not be refused merely because we asked a version whose documentation does not carry it. Every other call is unchanged." },
      { kind: "fixed", tool: "CA groups", text: "\u2467 Disable nesting no longer walks you into a destructive dead end. When the property was unknown it reported the failure and then offered its fallback: rename the group aside, recreate it, move the members, repoint every policy \u2014 setting disableNesting in the create body, which is the request that had just been refused. A rebuild to arrive at the identical error. That refusal is now told apart from an ordinary one: the action stops being offered for the rest of the session, the report explains why nothing here can set it, and it points at a restricted management administrative unit, which limits who can change the members at all and is available today. An ordinary refusal \u2014 a group that already holds nested groups \u2014 still offers the recreate, because there it works." },
      { kind: "fixed", tool: "Import", text: "The \u267b\ufe0f preflight asked for disableNesting inside the batch that looks up the file's groups by name. On a tenant without the property that whole sub-request returns 400, leaving the lookup empty \u2014 which does not read as \u201ccould not check\u201d, it reads as \u201cnone of these groups exist in this tenant\u201d. A wrong answer rather than a failure, and the panel would have reported nothing being reused when everything was. Nesting is read on its own pass now, and anything unreadable stays \u201cnot reported\u201d." },
      { kind: "improved", tool: "All tools", text: "Nothing claims the setting was applied unless it read back as applied, and \u201cthis tenant has not got the feature\u201d is now a distinct outcome from \u201cthis group refused it\u201d everywhere it can occur \u2014 the create panels, the batch create result, \ud83d\udce5 Import's harden ticks and \u2466 Migrate. Roadmap R04 is unaffected: nesting was never the mechanism it turns on, and a restricted administrative unit still does that work." },
    ],
  },
  {
    build: 25165, date: "2026-08-19", title: "An exact tile next to a prefix-only list reads as a contradiction",
    items: [
      { kind: "improved", tool: "Licence gap", text: "Queue item 74 — on a 32k-member tenant the P2 tile said 20,622 short while the named list found 11,367, and both were right: the tile is count arithmetic (exact), the list covers only the users actually read, and the read capped at ~20k. Three fixes. The per-pass cap rose to ~50k users. The partial chip now says first N of M users read instead of just capped, so the prefix is a number rather than a vibe. And a Read-the-remaining-users button finishes the job: it continues the read from its saved nextLink — never starting over — judges the new users by exactly the same rules (one shared mapper serves the first pass and the continuation), re-analyzes in place, and stays bounded per click on tenants larger still. Admin-group exclusions and a mailbox check already done both survive the re-analysis." },
    ],
  },
  {
    build: 25164, date: "2026-08-19", title: "Two buttons doing the same thing is one too many",
    items: [
      { kind: "improved", tool: "Licence gap", text: "Queue item 73 — the toolbar carried a second Count the gap next to the big one in the run prompt, and before the first run they did exactly the same thing. The toolbar button is now Rescan and exists only once there is a result to redo — the same shape Change audit uses — so the empty screen has one obvious way in, and a finished screen has one obvious way to re-read the tenant." },
    ],
  },
  {
    build: 25163, date: "2026-08-19", title: "The logo and the changelog guard reached production",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue item 71 — the official ENCA mark in the header, on the sign-in page and as the favicon — is live in production build 289. The three files went across byte-identical, with the version query intact: those filenames previously held the Limon-IT mark, so without it a returning visitor is served the old logo out of cache." },
      { kind: "improved", tool: "All tools", text: "Queue item 72 — the changelog's plain-text check — is live in production build 288, and shipped there ahead of this reconciliation rather than as part of it. Production was carrying 134 formatting tags and showing them, so the fix went to main in the same pass that fixed this channel. Both items are removed from the queue and their numbers retired rather than reused; productionBuild moves to v1.0.289." },
      { kind: "improved", tool: "All tools", text: "Neither item has a roadmap card, so there is no card to move — but the promotion routine's other three steps still applied, and this entry is the fourth. What remains queued is 70 (the Gap analyse coverage flow), 67 (custom groups in the persona vaults, deliberately held back), and the two beta-only tools, neither of which can move without its tool." },
    ],
  },
  {
    build: 25162, date: "2026-08-19", title: "The changelog is plain text, and now it says so when it is not",
    items: [
      { kind: "fixed", tool: "All tools", text: "Every b, i and code tag written into this page since build 25151 rendered as literal angle brackets — 146 of them across eleven releases. clEntries() escapes the item text and always has; the header of js/changelog.js has said so in capitals since build 25156, when the same thing was cleaned up for the first 228 tags. It was written there and then ignored. The tags are gone and the prose is untouched: 551 items across 270 releases compared before and after, and every one is identical once the markup is resolved." },
      { kind: "fixed", tool: "All tools", text: "Two HTML entities went with them \u2014 an escaped ampersand and an escaped pair of angle brackets, which would have rendered as their own source once the tags around them were removed — the same mistake wearing a different hat. One of the two predates this cycle and was missed by the 25156 sweep." },
      { kind: "new", tool: "All tools", text: "A comment nobody reads is not a guard, so the file now checks itself. On every channel a console warning names any release whose text carries formatting markup, because the mistake is usually found while porting to main and that is where a console is open. On the beta site the offending entry is additionally chipped in the What's-new list, so the author sees it on the screen they were already looking at. Production shows nothing: a customer should not be shown our authoring slips." },
      { kind: "improved", tool: "All tools", text: "The check is deliberately narrow. It flags only the tags an author reaches for to format — b, i, em, strong, code, u, br, small, mark — and the HTML entities. Prose that NAMES an element is legitimate and must not trip it: \"selecting from a <datalist>\" and \"loaded through <img src>\" are both real sentences in this changelog, and both still pass. Ten cases are checked, including a bare less-than sign in ordinary arithmetic." },
      { kind: "improved", tool: "All tools", text: "Three places were asking whether this is the production deployment, in three slightly different ways — the BETA banner, the promotion queue, and now this check. There is one isProdHost() and they share it. A blank or missing host answers no rather than letting an unconfigured build pass itself off as the real one." },
    ],
  },
  {
    build: 25161, date: "2026-08-19", title: "The logo, built the way the other product marks are",
    items: [
      { kind: "fixed", tool: "All tools", text: "Build 25160 shipped the ENCA mark as an icon tile — artwork with its own painted background, rounded by the stylesheet so it did not sit on the header as a square patch. That is not how the other Limon-IT product marks are built. TUNO's is transparent: no background rect, so it carries on any header colour with nothing behind it and no rounding to maintain. ENCA's is now built the same way, from the same drawing, and the rounding rule is gone rather than left applying to nothing." },
      { kind: "improved", tool: "All tools", text: "Two framings from one drawing, which is the part 25160 got backwards. The mark keeps the orbit ring (viewBox 84 84 856 856) — at 34px in the header and 76px on the sign-in card it is the ring that makes the mark read as a mark rather than a green dot. The favicon is cropped to the inner disc (270 263 484 484), because a browser tab renders it at 16–32 pixels and the ring is only noise there. 25160 used one over-cropped file for all three and had no favicon of its own." },
      { kind: "fixed", tool: "All tools", text: "A claim in 25160 was wrong and is withdrawn. It said the two marks sharing internal SVG ids would have made the dark one render in the light palette. They would not: an SVG loaded through <img src> or CSS content:url() is its own document, and its ids are scoped to it — the collision only exists if the markup is inlined, which it is not. The defensive id-suffixing is removed, so the files match the other product marks byte for byte outside their own glyph." },
      { kind: "improved", tool: "All tools", text: "The files go back to the names the rest of the family uses — logo-mark-light.svg, logo-mark-dark.svg, favicon.svg — and every reference to them carries ?v=. That is not decoration: those exact filenames previously held the Limon-IT mark, so without it a returning visitor keeps being served the old logo out of cache, on the one screen where it is most obvious." },
    ],
  },
  {
    build: 25160, date: "2026-08-19", title: "ENCA gets its own logo",
    items: [
      { kind: "new", tool: "All tools", text: "The official ENCA mark — the shield, keyhole and gear inside its ring — replaces the Limon-IT mark in the header, on the sign-in page and as the favicon. It is the app's own logo rather than the company's, which is what the sign-in page has needed since the tool was named: ENCA is what you are signing in to, and the header was introducing something else." },
      { kind: "improved", tool: "All tools", text: "Light and dark are separate artwork, not one file with the colours filtered. The dark variant is swapped in by the stylesheet rather than by script, so it is already correct on the sign-in screen before the app has finished booting — the moment where a wrong-theme logo is most visible, because there is nothing else on the page yet. Both paint their own background, so the mark carries on any header colour, and the stylesheet rounds them like an app icon rather than leaving a square patch." },
      { kind: "improved", tool: "All tools", text: "The framing is the one thing that changed about the artwork. As supplied it is a 1024px icon tile that spends its outer third on the dashed orbit ring — which reads beautifully at that size and is illegible at the 34 pixels the header actually uses, where the shield lands on about twelve of them. The viewBox is cropped to the inner disc: every element is still there, nothing is redrawn, and the original framing is recorded in a comment at the top of each file so it can be restored in one edit." },
      { kind: "fixed", tool: "All tools", text: "The two files shared every internal id — glow, softglow, bgg, goldg. SVG ids are document-global, so with both marks on one page the second one's gradients would have silently lost to the first and the dark mark would have rendered in the light palette. Each file's ids are now suffixed. The old Limon-IT mark and favicon are removed rather than left in assets/ for somebody to wire up again by mistake, and the licence note names both marks as excluded from the MIT terms." },
    ],
  },
  {
    build: 25159, date: "2026-08-19", title: "Gap analyse answers the question it never asked: how many of them do your policies actually reach?",
    items: [
      { kind: "new", tool: "Gap analyse", text: "A coverage flow above the results, and usually the first thing worth reading. Five stages, each a subset of the one above: everyone in scope → targeted by at least one active policy → covered by one that is actually enforced → required to do MFA → holding the licence their own policies oblige. The four summary cards each counted a different thing against a different denominator and none of them said how many people were in the tenant to begin with — so the one number everybody actually wants, how much of the tenant does this cover, could not be read off the screen at all." },
      { kind: "new", tool: "Gap analyse", text: "The drops are the finding, not the totals. Every bar is drawn against the same denominator, so the shape of the funnel is readable without doing arithmetic on five percentages — and a tenant with 900 targeted users and 40 covered by an enforced policy has a report-only backlog, not a coverage problem, which is a distinction no single number can carry. Users reached by no active policy at all and users targeted only by report-only policies are called out under the funnel: for the first group Conditional Access is not weak, it is absent." },
      { kind: "new", tool: "Gap analyse", text: "Every drop clicks through to exactly those users — and clicking again clears it, because a filter you cannot switch off is a trap on a list this long. The drop sets are deliberately not the summary cards' sets: “No MFA from CA” counts everyone without MFA including the users no policy reaches, while the funnel's MFA drop counts only those a policy does reach and still does not ask. Reusing the card filters would have put a number on the funnel that opened a different number of rows, so the predicate that counts a drop is the same one that filters the list. A stage with no drop offers no drop link — only the first row stays clickable, and it clears the filter." },
      { kind: "new", tool: "Gap analyse", text: "The licence stage reads its own data. The assigned licences ride along on the /users read the tool was doing anyway and the subscribed SKUs are one more call, both covered by permissions it already holds — so there is no extra consent and no dependency on 🎫 Licence gap having run first. The verdict comes from LicGap.licenceOf, now extracted so both tools share one definition of licensed; a second implementation is how two screens end up disagreeing about the same user, which has happened here before. P2 is required where a risk-based policy targets someone, P1 otherwise, and report-only counts — the obligation follows targeting, not enforcement." },
      { kind: "fixed", tool: "Gap analyse", text: "The first draft of the licence read would have been wrong on every real tenant, and confidently so. It resolved the users through /directoryObjects/getByIds, which returns only the common user property set and does not honour $select — so assignedLicenses came back absent for everybody, every user classified as unlicensed, and the stage reported that as a read rather than as a failure. Demo mode hid it completely, because the fixtures were hand-shaped with the fields present. The two fields now ride along on the /users read the tool was already doing, which is what makes the “no extra call” claim true; a user record carrying neither field is treated as NOT READ for that user, never as unlicensed." },
      { kind: "improved", tool: "Gap analyse", text: "Not read is not zero. A refused or broken licence read leaves that one stage saying not read with every other stage unaffected, because “we did not look” and “nobody is licensed” are opposite findings. Targeted users with no licence record at all — guests, or a capped read — are left out of the stage and counted separately rather than rounded up to licensed. The funnel itself is a pure function of the report, testable with node alone; building it caught a real bug in its own first draft, where the licence stage was measured against the MFA row instead of the targeted one and reported a drop of 1 while the list it opened held 2. 🔍 Gap analyse is v1.8." },
      { kind: "improved", tool: "Gap analyse", text: "Two smaller things the funnel dragged into the light. The exported report named its own filter from a three-entry lookup, so exporting under a coverage filter produced a deliverable whose scope line read “filtered:” and then nothing — every filter is nameable now, and the funnel in the export describes the whole run rather than the filtered subset, which would have made the drop set its own denominator and read 100% at every stage. And the per-user licence entitlement is deliberately stripped from the data embedded in that file: the report renders nothing from it, and this is the file that gets shared." },
      { kind: "improved", tool: "Gap analyse", text: "The group, user-type and search controls narrow the list below the funnel without narrowing the funnel, so a row reading −7 could open a list of 2. Clicking a drop now clears those three, because the funnel's promise is that −7 shows those seven — and while any of them is active the funnel says outright that the list is filtered further. The alternative, quietly recomputing the funnel against whatever is on screen, would have made the headline number move every time somebody typed in the search box." },
      { kind: "new", tool: "All tools", text: "Every row in 🚚 Waiting for production now carries a test checklist. Why already said what the risk was and what would have to be true for an item to graduate; it did not say how to find out, and an item whose graduation condition nobody knows how to check either ships untested or never ships. The steps name the tenant state each one needs and the outcome you should see, so a step can fail rather than be nodded through — and where a check needs a tenant nobody has to hand, the step says so, because knowing which check was skipped is worth more than a list pretending all of them were run. The three items already queued have been backfilled; an item without one is now marked as unfinished in the table itself." },
    ],
  },
  {
    build: 25158, date: "2026-08-19", title: "Eight of the nine reached production 287 — and the ninth says why it did not",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 61 (🎫 Licence gap), 62 (🚦 Sign-in failures gathers the Conditional Access interrupts), 63 (📥 Import finishes the job on the groups it reuses — R04), 64 (🗄 Backup and 📄 Create documentation produce the baseline catalog on a baseline tenant), 65 (🧬 the CloudFellows rename — R35), 66 (🌐 named-location findings — R37), 68 (🔢 permanent T-numbers — R33) and 69 (🧬 both baselines as one table) are live in production build 287. Removed from the queue; the numbers are retired rather than reused. productionBuild moves to v1.0.287." },
      { kind: "improved", tool: "Roadmap", text: "The four cards with roadmap references now read live · beta NNNNN · production 287 on this channel and live · build 287 on main — R04, R35, R37 and R33. Both channels carry their own copy of the roadmap, and step 3 of the promotion routine is the one that gets missed because the port is finished and working by then; eight cards had drifted that way on 2026-08-17." },
      { kind: "improved", tool: "Restricted AUs", text: "Item 67 (R28 — custom groups in the persona vaults) was held back, and its card and its queue row both say so. It is the only change in the batch that alters where a write puts a group object, and a persona vault is an authorisation boundary: file a group in the wrong one and that persona's scoped administrator can edit another persona's exclusions. An empty mapping leaves every existing routing decision byte-for-byte as it was, so the risk is entirely in what an operator states — which is exactly why it wants a real tenant behind it first. The code is unchanged and still running here." },
      { kind: "improved", tool: "All tools", text: "The promotion queue's header gains a third reading of a card that carries no production clause. Two were documented — the tool is genuinely beta-only, or somebody skipped step 3 — and R28 is neither: it is finished, running, and deliberately left out of a release its neighbours went in. That case now has its own wording, “beta NNNNN · held from production”, because a held item and a forgotten one look identical on the card, and “no production clause” must never be something a reader has to interpret." },
      { kind: "improved", tool: "All tools", text: "Production 287 carries two gaps in the T-numbering, T21 and T29, and they are correct: they belong to 📐 CIS Benchmark and 📖 Baseline guide, which are still only here. The numbers are theirs from the day they were assigned, whether or not production carries the tool — when those two graduate they arrive as T21 and T29, not as the next free numbers. Both remain queued, and neither can move without its tool." },
    ],
  },
  {
    build: 25157, date: "2026-08-19", title: "Both baselines render as one table",
    items: [
      { kind: "improved", tool: "Baseline Policies", text: "The Cards / Table toggle is gone and the table is the only view — in both catalogs. It defaulted to the table for CloudFellows and to cards for the community catalogs, so the same screen answered the same question two different ways depending on which catalog you had clicked, and reading the two baselines against each other meant comparing a table with a wall of cards. A baseline comparison is a row per policy with a status; that is a table. Status filters, search and the collapsible persona sections are unchanged." },
      { kind: "improved", tool: "Baseline (Joey Verlinden)", text: "Opens as the same table as the CloudFellows catalog rather than as cards, which is the half of the split that made the two impossible to read side by side. Baseline Policies is v2.0, Baseline (Joey Verlinden) v1.2." },
      { kind: "fixed", tool: "Baseline Policies", text: "Collapse all works under the \"Not in baseline\" filter. It asked which personas were on screen using the card view's row set, which dropped every row with no baseline entry — exactly the rows that filter shows — so it found nothing and the button did nothing. It now selects the same rows the table draws, by the same three steps in the same order." },
      { kind: "fixed", tool: "Baseline Policies", text: "The card renderer went with it — renderCards, its policyCard helper and the 23 lines of CSS only they used. A view nobody can reach is not a feature held in reserve, it is a second answer waiting to disagree with the first the next time the comparison logic changes." },
    ],
  },
  {
    build: 25156, date: "2026-08-19", title: "Documentation follows the same rule as Backup on a baseline tenant",
    items: [
      { kind: "new", tool: "Create documentation", text: "On a baseline tenant the document describes the BASELINE CATALOG, not the tenant — the same rule 🗄 Backup got at build 25150, through the same helper, so the two cannot drift apart. The export modal opens with the scope stated and the number of the tenant's own policies being left out. A backup at least has a folder structure to give the omission away; a Word file handed over as “the baseline” has nothing, which is exactly why prose needed the rule more than JSON did." },
      { kind: "improved", tool: "Create documentation", text: "The scope is carried into the deliverable, not just the dialog. The PDF says it on the cover, the Markdown opens with it as a quote under the header, the Word title line carries it, and the PNG bundle gets a SCOPE.txt beside the images — every format states it in whatever it can hold, from one shared sentence so four formats cannot end up claiming different things. The document is read by somebody who was not there when it was made, and a policy that is absent leaves no trace of its absence. PNG is the exception and the modal now says so: loose images have no cover, header or companion file, so they are the one way to hand somebody a baseline export that cannot admit it is one." },
      { kind: "improved", tool: "Create documentation", text: "The restricted-unit appendix is deliberately NOT filtered. On a baseline tenant those units are the baseline's own persona vaults, so they are documented as they stand, scoped administrators included — and the note in the modal says so rather than leaving you to work out why one part of the document is narrowed and the other is not. Documentation is v1.7." },
      { kind: "improved", tool: "Named locations", text: "The overly-broad-range finding now says what to narrow it TO, per range and per address family: /24 for an office and /16 at the very widest for a whole corporate estate; /48 for an IPv6 site and /64 for a single network. A finding that says “narrow the range” and stops leaves the reader the part they came for, and a guess errs wide — which is the same finding again, one build later. It also points out that the prefix belongs to your addressing plan, not to the address you happened to sign in from." },
      { kind: "fixed", tool: "Named locations", text: "An IPv6 finding no longer opens by explaining what a /8 is. The sentence stated the IPv4 and the IPv6 fact together whichever one had fired, so half of it was a number the reader had to work out did not apply to them. Each family now gets its own explanation, and a location holding both still gets both. Named locations is v1.7." },
      { kind: "fixed", tool: "What's new", text: "Every b, i and code tag ever written into this page rendered as literal text. The renderer has escaped the item text since the changelog was added at build 161, so authors have been writing markup that was never going to work — 228 tags across the history, showing up as angle brackets mid-sentence. The tags are gone and the prose is untouched; this file is plain text, which is what it always actually was." },
    ],
  },
  {
    build: 25155, date: "2026-08-19", title: "The block-list check 25152 promised, and the tile tags 25153 forgot",
    items: [
      { kind: "fixed", tool: "Named locations", text: "The untrusted-IP finding was nagging about _Blocked IPs — the exact case 25152 said it suppressed. An underscore is a word character in a JavaScript regular expression, so \\bblock has no boundary to find in _Blocked IPs and the suppression never fired. A leading underscore is the usual way of pinning a list to the top of an alphabetical list in Entra, which makes it the single most likely spelling of the case the suppression exists for — so the check cried wolf about precisely the normal case it was written to stay quiet about. The boundaries are now explicit “not a letter or digit”, which an underscore satisfies, and blocklist as one word is matched too." },
      { kind: "fixed", tool: "Named locations", text: "Same check, opposite direction: \"bad\" is no longer a block-list word. It suppressed the finding for Bad Homburg office — a real place, and a location whose trusted flag somebody may genuinely want to hear about. A check that silently ignores a location because of where it is would be a worse failure than the nagging it was added to prevent. The IPv6 threshold comment said /48 while the code has always used /32; the code is right — a /32 is what an ISP is handed by its RIR, while a site is normally given a /48 — and the comment now says so." },
      { kind: "fixed", tool: "Import", text: "📥 Import was bumped to v2.7 by build 25153 and its home tile said nothing at all. The tile tag is what surfaces a changed tool on the home page, so a tool whose routing had just changed was the one tool nobody would be shown. Tag added, and this entry names the tool so the recency ranking can find it." },
      { kind: "fixed", tool: "Protect exclusions", text: "🔒 Protect exclusions, 👥 Conditional Access groups and 📄 Create documentation all changed behaviour in 25153 — the first two route through the tenant mapping, the third prints it on the restricted-unit pages — and none of the three had its per-tool version moved. A version that does not move is a reviewer being told nothing changed. 🔒 Protect is v1.7, 👥 CA groups v4.2, 📄 Create documentation v1.6." },
      { kind: "improved", tool: "Conditional Access groups", text: "Nothing about the mapping itself changed in this build, and nothing new is written to any tenant — this is 25152 and 25153 finishing the job they claimed to have finished." },
    ],
  },
  {
    build: 25154, date: "2026-08-19", title: "R33 — every tool gets a permanent number",
    items: [
      { kind: "new", tool: "All tools", text: "The roadmap items carry Rnn references so one can be pointed at without quoting its title. The tools went by name and emoji, which drift — tools get renamed, retitled, and once 🇳🇱 R26 lands, translated, at which point every English note about a tool stops being findable. Each tool now carries a permanent T-number, shown in the corner of its tile and in the tool's own header beside the per-tool version. The two sit together because they are opposite kinds of fact and are read together: the number never changes, the version always does." },
      { kind: "new", tool: "All tools", text: "T01–T31 were reconstructed from git, not assigned by preference — the first commit that put each tile in index.html, ordered by commit time, with tools that arrived in one commit ordered as they were written into the page. That makes the order a fact about the repository rather than a judgement, and it puts 🗂 List Policies, 📄 Create documentation, 🔍 Gap analyse and 🗄 Backup at T01–T04: the day this app existed at all." },
      { kind: "improved", tool: "All tools", text: "Never reused — not when a tool is retired, not when it is folded into another, because a recycled number makes every older note about it wrong, which is precisely the failure the number exists to prevent. A new tool takes the next free number (32 next) in the same commit that adds its tile, alongside the changelog entry and the promotion-queue row. The rule is written where the numbers live, in version.js, rather than in a card somebody has to find." },
      { kind: "improved", tool: "All tools", text: "Findable in the ⌨️ command palette: type T07, or just 7, and you land on 📘 MS Learn checks. An exact number match outranks every other kind of match, because a query that is a tool number is not an accident — and the bare digit works because somebody quoting a number out of a support case should not have to remember the prefix. Each tool row in the palette carries its number." },
      { kind: "improved", tool: "All tools", text: "Three things are deliberately not numbered: ❓ Help, 📋 What's new and 🗺 Roadmap. They are the app describing itself rather than tools that read a tenant, report on it or write to it — which is also why they carry no version. They go by name, and it is written down so nobody later closes the gap by numbering them and shifting everything else." },
      { kind: "improved", tool: "Roadmap", text: "R33 moves to Now, live · beta 25154. It was filed under On the horizon; it turned out to need no new machinery at all — a field beside each tool's version, and the discipline written down next to it." },
    ],
  },
  {
    build: 25153, date: "2026-08-19", title: "R28 — a tenant's own groups can go in the persona vaults",
    items: [
      { kind: "new", tool: "Restricted AUs", text: "🏷 Group personas — a per-tenant mapping from a group to the persona vault it belongs in. Everything here routed a group by reading the CA number in its name, which works for the baseline and nothing else: SEC-VIP-Exceptions and Contractors-NoMFA matched no persona, so ⑥ Protect skipped them, ＋ Bulk add never offered them, and break-glass had to be special-cased by name to work at all. Most tenants have groups that predate the baseline, and telling them their naming is wrong is not a feature. Say it once, in 🛡 Restricted AUs, and every tool routes it there afterwards." },
      { kind: "improved", tool: "Restricted AUs", text: "One function decides — CaMap.codeOf: this tenant's mapping first, the CA number second. ⑥ Protect, ＋ Bulk add, the persona chips, 📥 Import, the 🛡 Markdown report and the restricted-unit pages in 📄 Create documentation all go through it, so none of them can hold a different opinion about where a group belongs. The chips and ＋ Bulk add read mapped groups by id, one lookup each, because their scan is deliberately bounded to the CAB-SEC / CAD-SEC family and could never reach a group called Contractors-NoMFA however well it was mapped." },
      { kind: "improved", tool: "Restricted AUs", text: "It does not guess. Matching is exact: the group's object id, or its display name compared case-insensitively. Nothing is inferred from a prefix or a word in the name — a mapping nobody stated is how a group ends up in the wrong vault silently, and a vault is an authorisation boundary, so the cost of a wrong guess is one persona's scoped administrator holding another persona's exclusions. What the tenant states wins over the CA number, because somebody typed it against this group in this tenant, and ⑥ Protect marks such a row mapped here so a group filed somewhere its name does not explain always says why." },
      { kind: "improved", tool: "Restricted AUs", text: "And it does not hide the unmapped. 🔎 Find the unmapped groups resolves the group ids the loaded policies already reference and lists every one that nothing places, with a persona a click away — the tool reads that itself rather than borrowing the ① Check scan, so it works on a tenant where that scan was never run. A group whose id no longer resolves is deliberately left out: that is a dangling reference and ① Check's finding, and listing it here would send somebody to file a group that is gone. ⑥ Protect now says unmapped on the row instead of quietly skipping it." },
      { kind: "improved", tool: "Restricted AUs", text: "Kept with the tenant, not in the code — the browser's own storage keyed on the tenant id (not its name: two customers can share a display name, and a mapping landing in the wrong tenant would file groups into the wrong vaults). Nothing is written to your directory, nothing leaves the machine, and the site goes on storing nothing server-side. The two consequences are stated rather than hidden — it does not follow you to another browser, and a private window keeps it for the session only, which the panel says outright when storage is refused. ⭳ Export / ⭱ Import is the way round both, with replace or merge offered rather than chosen for you; filing a group from the unmapped list records the object id, which survives a rename in Entra as a typed name does not. 🛡 Restricted AUs is v1.7, 📥 Import v2.7." },
      { kind: "improved", tool: "Roadmap", text: "R28 moves to Now, live · beta 25153. It was reverted once, at build 25100, for being built as a stored mapping in each unit's description — the wrong reading of what \"kept with the tenant\" meant. The card now records what the mapping is, the two things it refuses to do, and where it actually lives. R36 is updated too: the per-baseline naming contract it needs now has the tenant half solved, and the same shape to copy." },
    ],
  },
  {
    build: 25152, date: "2026-08-19", title: "R37 — the named locations tool finally says what is wrong with them",
    items: [
      { kind: "new", tool: "Named locations", text: "The tool already resolved which policies use each location, counted the ones reachable only through All trusted locations, and warned at edit time that flipping the trusted flag moves every policy consuming it — and none of it became a finding. Four checks now run over exactly that data: the location list and the policies already in memory, no extra read of your tenant, which is why this went ahead of anything needing new Graph calls. They surface in a panel above the list, as a ⚠ badge on each row, in the per-location report and in the Markdown export — findings ahead of the inventory table, because the findings are why the file was opened." },
      { kind: "new", tool: "Named locations", text: "A dangling reference — a policy naming a location id this tenant no longer has, the same failure ① Check reports for groups and the same cause: something was tidied up while a policy still pointed at it. Entra keeps the stale id, so the condition reads as configured while matching nothing — for an EXCLUDE that means the exclusion silently stopped applying. High while an enforced policy still names it, medium when only disabled ones do, because that one comes back to life the day somebody switches the policy on." },
      { kind: "new", tool: "Named locations", text: "An empty country location matches no sign-in at all, and still reads as configured from every screen: a block scoped to it blocks nobody, an exclusion built on it excludes nobody. A location that includes unknown regions is deliberately not flagged — that one does match something. An overly broad IP range: a /0 is the whole internet and a /8 is 16.7 million addresses, neither of which is an office (for IPv6 the comparable line is a /32 allocation). A trusted location carrying one is raised a level, because every policy using All trusted locations inherits the range without ever naming it." },
      { kind: "new", tool: "Named locations", text: "The untrusted-IP check is the one that had to be careful. The trusted flag only changes behaviour when something actually consumes All trusted locations — so in a tenant where nothing does, the check says nothing at all rather than filling the screen with a preference. And an untrusted location is very often deliberate: where a Block policy names it, or the name says so itself, nothing is raised, because _Blocked IPs is untrusted on purpose and marking it trusted would be the bug. Everywhere else it is low, and the finding text names the deliberate block list as a valid reason to leave it exactly as it is. A check that cries wolf about the normal case is worse than no check." },
      { kind: "improved", tool: "Named locations", text: "The findings panel is not part of the row filter: a dangling reference belongs to no location, so a panel that came and went with the filter would hide the one finding with no row to hide behind. A ⚠ Findings chip narrows the list to the locations that have one, the badge and the panel both open the same per-location report, and the screen and the exported report read from the same computed result so they cannot disagree. The check logic is a pure function of (locations, policies) in locations.js — no DOM, no globals, no reads of its own — testable with node alone. 🌐 Named locations is v1.6." },
      { kind: "improved", tool: "Roadmap", text: "R37 moves to Now, live · beta 25152. The card keeps the open question open rather than quietly deciding it: findings are deliberately NOT in 🔍 Gap analyse, because that tool reads policies and this reads objects — a first non-policy finding there needs its own answer to what a finding is about. There is now an implementation to argue from." },
    ],
  },
  {
    build: 25151, date: "2026-08-19", title: "R35 — the bundled baseline is now the CloudFellows baseline",
    items: [
      { kind: "improved", tool: "Baseline Policies", text: "The baseline bundled here is published as the CloudFellows baseline — R26.6 (v3.x). It was the Limon-IT baseline; the release designation, the 99 policies and every version in them are byte-for-byte what they were yesterday. This is the name it goes by, not a new catalog — a tenant compared against it this morning gets exactly the same answer this afternoon." },
      { kind: "improved", tool: "Baseline Policies", text: "A rename is not one string, so all of them moved from one place. The catalog's label and author are what the tool header, the summary line under it and the Markdown gap report each read, which is why none of the three could be left behind — and the tile, the home overview and the Help section carry the new name too. The code comments that explain why a rule exists were changed as well: 📘 MS Learn's exclusion-group convention refers to the baseline by name, and a comment naming a thing that no longer exists is how the next person is misled." },
      { kind: "improved", tool: "Baseline Policies", text: "Two things deliberately untouched. The catalog id is still limonit — saved state and 📉 Drift watch snapshots key on it, so renaming it would have silently orphaned every comparison stored before today, and an identifier that appears in no interface has no reason to follow a display name. And the CAB-SEC / CAD-SEC group names are the tenant's own objects, not ours to rename: nothing in the catalog, the group templates or the persona routing moved. Display name everywhere, identifiers nowhere. 🧬 Baseline Policies is v1.9." },
      { kind: "improved", tool: "Roadmap", text: "R35 moves to Now, live · beta 25151. The card records what the rename covered and, more usefully, the two identifiers it refused to touch and why — which is the part a future rename will need." },
    ],
  },
  {
    build: 25150, date: "2026-08-19", title: "On a baseline tenant, Backup backs up the baseline — not the tenant",
    items: [
      { kind: "new", tool: "Backup (JSON)", text: "A baseline tenant is where the baseline is built, so a backup taken there is the baseline catalog — and it now behaves like one. The zip is scoped to the persona CAxxx policies, the same rule the 🔍 Gap and 📚 MS Learn checks already apply on these tenants, and everything else that tenant runs for itself is left out. The confirmation opens with a 🧬 warning saying so and how many of its own policies are being skipped, so nobody finds out from the file." },
      { kind: "new", tool: "Backup (JSON)", text: "Dependencies follow the scope, not the selection. The policies are filtered first and the groups, authentication strengths, named locations, authentication contexts and terms of use are read from the survivors — which is the whole safeguard, because a skipped policy that still contributed its groups would put objects in the catalog that only ever existed in one tenant. That zip gets imported into a customer months later, and by then the question “why is this group here?” has no one left to ask." },
      { kind: "improved", tool: "Backup (JSON)", text: "The scope survives the download. A baseline backup is named ConditionalAccess-BASELINE-… rather than -JSON-…, and carries a BackupScope.json naming the tenant, the policy count and how many were deliberately left out. A zip sits in a downloads folder long after the tenant that produced it is out of reach, and “is this the whole tenant or the catalog?” is not a question a folder of policy JSON can answer. 📥 Import skips the file by name — it describes the backup, it is not content in it." },
      { kind: "improved", tool: "Backup (JSON)", text: "The scoping follows the zip, not the tile. 📄 Create documentation's export modal offers the same JSON backup as one of its formats — the identical file, through a different door — and it now goes through the same filter. Which tile somebody happened to open is not a decision about what ends up in a baseline." },
      { kind: "improved", tool: "Backup (JSON)", text: "There is deliberately no override — no checkbox to take everything just this once. The header badge and the Help section both state the behaviour, and a selection that contains no baseline policy at all is refused with the reason instead of quietly producing an empty zip. 🗄 Backup is v1.3." },
    ],
  },
  {
    build: 25149, date: "2026-08-19", title: "Import stops walking past the groups it reuses (R04)",
    items: [
      { kind: "new", tool: "Import", text: "A group this import CREATES gets nesting disabled and a place in its persona vault. A group it REUSES got neither \u2014 and build 25129 only said so, which turned an invisible gap into a visible one without closing it: the panel told you the group was exposed and then sent you to two other tools. Each reusable row now carries a tick for what is genuinely still open on it \u2014 \ud83d\udeab disable nesting, \ud83d\udd12 file it into its persona vault \u2014 and ticking is the whole interface: nothing is pre-ticked. An existing group may hold members and sit somewhere deliberately, so the decision stays with the person who knows the tenant, not with the importer." },
      { kind: "improved", tool: "Import", text: "What CANNOT be done says why, on the row, instead of showing a checkbox that does nothing: role-assignable (convert it in \u2466 Migrate first \u2014 the flag is immutable and forbids both), dynamic (membership is rule-driven), a Microsoft 365 group (it can never go in a restricted unit), already protected, a group two personas share (filing it under one hands that persona's administrator the other's exclusions), or a persona whose vault does not exist yet \u2014 which names the code and points at the \ud83d\udee1 PROTECTION panel above. A disabled control with no explanation is not a safeguard, it is a dead end." },
      { kind: "improved", tool: "Import", text: "The writes run after the policies land, so an import that fails leaves every existing group exactly as it found it \u2014 and if nothing imported, the ticked changes are skipped and the report says they were. Membership is never touched. Both writes are ones the create path already makes and neither is destructive: Entra REFUSES the nesting change when a group already holds nested groups rather than forcing it, and administrative-unit membership can be undone. The one route that is destructive \u2014 recreating a group Entra refuses \u2014 stays in \u2467 Disable nesting behind its own typed confirmation, and converting a role-assignable group stays in \u2466 Migrate. One implementation each." },
      { kind: "fixed", tool: "Import", text: "Nothing is reported as done unless it was checked. Entra can accept a PATCH and quietly ignore an unknown property, so the nesting change is confirmed by reading the value back \u2014 the rule build 284 set for every create path \u2014 and a group whose write was refused is named in the change report as still unprotected, with the route that can still fix it, rather than rounded up to a clean run. The demo exercises the refusal too, so it does not tell a tidier story than a real tenant." },
      { kind: "improved", tool: "Roadmap", text: "R04 \u2014 retire role-assignable groups everywhere \u2014 moves to Now, live \u00b7 beta 25149. What remains is a property of a tenant rather than a gap in the tools: the flag only truly leaves once \u2466 Migrate has been run there, because nothing retires a group this app did not create. \ud83d\udce5 Import is v2.6, and the queue's production build is reconciled to 286." },
    ],
  },
  {
    build: 25148, date: "2026-08-19", title: "Roadmap R37 — the named locations tool reports what it already knows",
    items: [
      { kind: "new", tool: "Roadmap", text: "R37 — 🌐 Named locations resolves which policies use each location, counts the ones reachable only through All trusted locations, and warns at edit time that flipping the trusted flag moves every policy consuming it. None of that becomes a finding: it reaches no report, no export beyond the location list, and nothing in 🔍 Gap analyse, so a misconfigured location is visible only to somebody who opens that one screen and reads the row. The card records this as a REPORTING gap rather than a reading one — the data is already computed, which is why it goes ahead of anything needing new Graph calls." },
      { kind: "new", tool: "Roadmap", text: "It names four checks — a dangling location reference (the same failure ① Check reports for groups), an empty country location that matches nothing while still reading as configured, an overly broad IP range, and an untrusted IP location. The last one carries the warning: the trusted flag only changes behaviour when something consumes All trusted locations, so the check stays silent where nothing does, and a deliberate block list is untrusted on purpose and must be named as a valid reason to dismiss rather than nagged about. A check that cries wolf about the normal case is worse than no check. The open question is left open in writing — whether findings about OBJECTS belong in a tool that reads POLICIES." },
    ],
  },
  {
    build: 25147, date: "2026-08-19", title: "The error code knows which control stopped the sign-in",
    items: [
      { kind: "improved", tool: "Sign-in failures", text: "Interrupt attribution is narrowed by what the error code can actually demand. First real-tenant record: a 50097 (device authentication required) listed both the MFA policy and the sign-in-frequency policy, and the honest answer was only one of them — neither has a device control, but enforcing sign-in frequency in a browser means authenticating the DEVICE to read the session's auth timestamp, and on an unmanaged machine without a PRT that round-trip is the interrupt. Now the MFA-family codes (50074, 50076, 50072, 50079, 500121) attach to the applied policies carrying an MFA or authentication-strength control, 50097 to compliant/joined-device or sign-in-frequency controls, and 50158 to terms of use. When no applied control matches the code — terms-of-use agreements can surface under their own display name — attribution falls back to every control-bearing applied policy rather than dropping the record." },
    ],
  },
  {
    build: 25146, date: "2026-08-19", title: "A release the home page does not announce did not happen",
    items: [
      { kind: "fixed", tool: "Sign-in failures", text: "Build 25145 shipped the interrupt capture without the tile's UPDATED tag — and the tag is not decoration: it is what exempts a tile from the home-page collapse and lifts it to the top, so the change was invisible behind “Show 7 more” unless you already knew to expand. The tag is on, and the tile now says the tool covers interrupted sign-ins as well as failed ones." },
    ],
  },
  {
    build: 25145, date: "2026-08-19", title: "Interrupted is not a failure, which is exactly how it hid",
    items: [
      { kind: "improved", tool: "Sign-in failures", text: "Enforced mode also gathers the sign-ins Conditional Access INTERRUPTED — the abandoned MFA prompt, MFA enrolment, device authentication, terms of use. These never showed, and could not have: Graph's conditionalAccessStatus has no 'interrupted' value, so a policy stopping a sign-in mid-flow is logged as CA 'success' with only an interrupt error code (50074, 50076, 50072, 50079, 50097, 50158, 500121) to tell the tale — the failure filter was blind to them by design. A second server-filtered fetch on those codes is deduped into the failures, and each interrupt is attributed to the applied policies that actually imposed a control — an interrupt with no such policy (per-user MFA, security defaults) is not CA's doing and stays out. On screen: an amber interrupted badge per sign-in, Blocked / Interrupted filter chips, interrupt counts in the header, the per-policy table and the Markdown report, and 'interrupted' in the CSV's result column." },
    ],
  },
  {
    build: 25144, date: "2026-08-19", title: "A count you cannot click is a claim, not an answer",
    items: [
      { kind: "improved", tool: "Licence gap", text: "Promotion item 61 — the card said “1 to license” but the pop-out gave no way to tell WHICH one: fifty-two rows, buckets only readable from scattered tags. The breakdown chips are now clickable and open the pop-out pre-filtered to exactly that bucket; inside, a Category column names each row’s bucket and filter buttons (All / to license / disabled / no licences / shared-resource / likely) carry the same counts as the card — one shared classifier decides the bucket for both, so the numbers cannot disagree. The not-classifiable pill now says outright that those identities are not rows in the list (no member-user record), which previously read as rows gone missing." },
    ],
  },
  {
    build: 25143, date: "2026-08-19", title: "A role held through a group is people, not one opaque id",
    items: [
      { kind: "fixed", tool: "Licence gap", text: "Promotion item 61 — follow-up from the office365itpros comparison: /directoryRoles/members returns DIRECT assignments, which are not all users. A role held through a role-assignable group arrived as the group object — one opaque id that matched no member user, so the people holding the role that way were silently missing from the targeting of role-scoped policies (a gap the compared script shares). Group-typed role members are now expanded to their transitive users, service principals holding a role are ignored on purpose (they hold no user licences and previously counted as unclassifiable identities), and a failed group expansion marks only that role’s count approximate rather than poisoning the run." },
    ],
  },
  {
    build: 25142, date: "2026-08-18", title: "Compared against another calculator, and took its one good idea",
    items: [
      { kind: "improved", tool: "Licence gap", text: "Promotion item 61 — verified against office365itpros’ Get-UnlicensedEntraP1Users.PS1 (Tony Redmond, Aug 2026). Adopted its one insight we lacked: an enabled account holding NO licences of any kind is usually a service account or a sync artifact that never consumes Microsoft services — those gap users now get their own ‘no licences at all — service account?’ chip, a tag in the pop-out and a label in the export, so the to-license count stops being inflated by accounts nobody would buy for. The advice stays a decision, not a default: exclude them deliberately or license them deliberately — unlike the script, which silently drops every unlicensed account from the obligation." },
      { kind: "improved", tool: "Licence gap", text: "The differences NOT adopted, for the record: the script ignores report-only policies (they evaluate everyone in scope, and Microsoft’s own usage metric counts those evaluations), never subtracts exclusions from scoped policies, counts suspended/expired subscriptions as owned seats, judges per-user licensing on assignedPlans (the exact grace-period mismatch build 25141 fixed), and covers P1 only. Where the two calculators disagree on a tenant, those five points are why." },
    ],
  },
  {
    build: 25141, date: "2026-08-18", title: "Two numbers called themselves the gap, and both were right",
    items: [
      { kind: "fixed", tool: "Licence gap", text: "Promotion item 61 — on a real tenant the tile said 80 short while the named list said 47, and both were correct by their own definition: the tile counts targeted minus seats OWNED (live subscriptions only), while the list judged users by assignedPlans — which keeps a plan in GRACE after its subscription is suspended or expires, so dozens of users read as licensed by seats that are no longer owned. There is now one definition: each user’s p1/p2 comes from assignedLicenses matched against the SAME live SKU set the seat totals count, with per-user disabledPlans respected. Users whose only P1/P2 is a grace plan are IN the gap, counted in their own chip and labelled ‘in grace — seat no longer owned’ in the pop-out and the export — which is also the actionable insight: their licence disappears the day the grace period ends." },
      { kind: "improved", tool: "Licence gap", text: "Targeted identities with no member-user record — guests reached through an included group, or members beyond the user-read cap — were silently dropped from the named list, quietly widening the same tile-versus-list disagreement. They are now counted and shown as ‘not classifiable’, on the card and in the export. When the SKU read fails entirely, the per-user check falls back to assignedPlans and the result already says the gap cannot be computed against seats." },
    ],
  },
  {
    build: 25140, date: "2026-08-18", title: "One admin group was an assumption about how tenants are organised",
    items: [
      { kind: "improved", tool: "Licence gap", text: "Promotion item 61 — admin accounts rarely live in exactly one group: a tenant has its persona group, a break-glass group, sometimes a per-tier split. The exclusion now takes SEVERAL groups, picked one after another from the same auto-fill field — each shown as its own chip with its own ✕, so one group can be removed without losing the rest. The union of their transitive members is excluded through the same single merge point as before, which is what keeps the obligation, the per-policy sizes, the Gap column and both named lists incapable of disagreeing. The result and the export name every group; the intersect-with-members and capped-read honesty rules apply per group." },
    ],
  },
  {
    build: 25139, date: "2026-08-18", title: "Admin accounts are people who already have a licence",
    items: [
      { kind: "new", tool: "Licence gap", text: "Promotion item 61 — Microsoft’s licensing FAQ counts one employee with several internal accounts as ONE licence, so the adm- accounts sitting in every gap list are noise the moment their owners are licensed. The toolbar gains an optional ‘exclude an admin-accounts group’ picker: it auto-fills with the groups the loaded CA policies already reference (that is where an admin persona group usually lives — works in demo mode too) and searches the directory live from two typed characters. The group’s transitive user members drop out of every count, the per-policy sizes and Gap column, and both named lists." },
      { kind: "improved", tool: "Licence gap", text: "The exclusion is honest about its edges: the member set is intersected with the member-user list where that list is complete, so guests or out-of-scope objects inside the group cannot undercount the obligation; a capped member read marks the counts approximate; and the result and the Markdown export both state the exclusion out loud with its assumption — every member of that group maps to an already-licensed owner — and the instruction to document the mapping. Changing or clearing the group re-applies instantly from the kept run, nothing is re-read, and a mailbox-type check already done survives." },
    ],
  },
  {
    build: 25138, date: "2026-08-18", title: "The mailbox check reads the refusal, not just the answer",
    items: [
      { kind: "fixed", tool: "Licence gap", text: "Promotion item 61 — 🏷 Check mailbox types came back ‘not readable’ for every account on a real tenant, including an actual shared mailbox. Cause: Graph’s documented delegated permission is not enough in practice — a delegated token can only read ANOTHER mailbox’s settings when the signed-in person holds rights on that mailbox, so the direct userPurpose read is denied almost everywhere a SPA runs. The check now reads the refusal itself: gap users are unlicensed by definition, and a regular unlicensed user has NO mailbox — so ‘access denied’ proves a mailbox EXISTS without a licence, which is almost always shared, room or equipment. Those accounts are labelled ‘unlicensed mailbox — likely shared/resource’ with a verify-in-Exchange note, counted in their own pill, and exported as such; ‘mailbox not enabled / not found’ confirms a plain unlicensed account (‘no mailbox — regular account’). A direct read that does succeed (own mailbox, delegate rights) still returns the exact type. Only a genuinely unclassifiable error stays ‘not readable’." },
      { kind: "improved", tool: "Licence gap", text: "The check button says what a click will do before it is clicked: ‘Check mailbox types (N)’ counts the distinct gap users it will read, says ‘N of M’ when the 600 cap trims the list, and live progress (‘Checking 40 of 120…’) runs on the button during the \ read. Under the hood, batch responses now carry the Graph error code and status alongside the message — additive, no other consumer changes — because ‘Access is denied’ versus ‘mailbox not enabled’ is exactly the distinction the classification needs." },
    ],
  },
  {
    build: 25137, date: "2026-08-18", title: "A long list is not a decision — the gap now sorts itself into actions",
    items: [
      { kind: "improved", tool: "Licence gap", text: "Promotion item 61 — the named gap list moved out of the card into a searchable pop-out: a large tenant makes it hundreds of rows, and a card that long buries everything after it. The card now shows the decision breakdown instead — how many enabled real users to license, how many disabled accounts to clean up, and (after the mailbox check) how many shared/resource accounts should never have been in scope — with 👥 View all opening the dialog, filterable by name or UPN. The full list stays in the Markdown export either way." },
      { kind: "improved", tool: "Licence gap", text: "The per-policy table gains a Gap column next to Users in scope: how many users THIS policy targets without the licence it needs assigned — a P2 gap for a risk policy, P1 otherwise. Per-policy gaps overlap like the scope counts do (the obligation stays the union above), but the column shows at a glance WHICH policy drags unlicensed users in — an admin-scoped policy with gap 0 next to an All-users policy with gap 4 is the whole story in one row. A gap that cannot be computed (user list not read) renders as — rather than 0." },
      { kind: "new", tool: "Licence gap", text: "🏷 Check mailbox types — shared, room and equipment mailbox accounts are never licensed and should be disabled, but nothing on the user object says which account is which. The check reads mailboxSettings.userPurpose for the GAP users only (never the tenant; capped at 600, sent in $batch chunks) behind MailboxSettings.Read asked once on the click, labels the resource accounts “never licensed — disable or exclude it” on screen and in the export, and reports an unreadable mailbox as ‘not readable’ rather than silently counting it as a user. A new run invalidates the check." },
    ],
  },
  {
    build: 25136, date: "2026-08-18", title: "A gap you cannot name is a gap you cannot fix",
    items: [
      { kind: "improved", tool: "Licence gap", text: "Promotion item 61 — “2 users short” is not actionable until you know which two. The member users are now read with their assigned service plans, and every targeted user WITHOUT a P1 licence assigned (or P2, for risk-based policies) is named — UPN, display name, account state — on screen and in the Markdown export. Disabled accounts sort last and are labelled cleanup candidates, not purchases. The list is deliberately a different number from the tile: the tile counts targeted minus seats OWNED (what must be bought), the list counts targeted without a licence ASSIGNED (what can be fixed today), and the unassigned-seat count bridges the two — assigning is free, buying is not." },
      { kind: "improved", tool: "Licence gap", text: "The P2 half no longer disappears when the tenant has no risk-based policies — it now says so explicitly: no active risk policy means no P2 obligation today, owned P2 seats are named as not required by Conditional Access, and any DISABLED risk policy is called out as the obligation it becomes the day it is switched on. Reading the user list also makes the P1 union exact where it was arithmetic before." },
      { kind: "improved", tool: "Licence gap", text: "The honesty rules extend to the new read: a capped user read (20 pages, ~20k members) marks the named lists partial instead of pretending to be the whole tenant, and a failed user read reports “counted but not named”, never a clean empty list. Licences in grace period (capabilityStatus Warning) still count as assigned, and a P2 plan satisfies the P1 obligation." },
    ],
  },
  {
    build: 25135, date: "2026-08-18", title: "The licence number Microsoft warns about is not the one the blade shows you",
    items: [
      { kind: "new", tool: "Licence gap", text: "Promotion item 61 — Microsoft has started showing a “Licensing overage” warning on the Conditional Access page, and links it to the licence usage blade — which counts EVALUATED users, the ones who happened to trigger a policy last month. The obligation is on TARGETED users: every user a CA policy is scoped to needs Entra ID P1, and every user targeted by a risk-based policy needs P2, whether they signed in or not. A blade showing “2 of 25, fine” can sit on a tenant targeting all 121 of its users. 🎫 Licence gap (BETA) computes the targeted number — All-users minus resolvable exclusions, or the union of included users, transitive group members (nesting counts) and directory-role holders minus exclusions — takes the UNION across policies (one user under five policies needs one licence, never five) and compares it with the seats the tenant owns, matched on the AAD_PREMIUM / AAD_PREMIUM_P2 service plans so bundles count and suspended subscriptions do not. After Rudy Mens’ Get-EntraLicenseGap.ps1 (lazyadmin.nl)." },
      { kind: "new", tool: "Licence gap", text: "The result explains what you are looking at and what to do about it: why the gap exists (an All-users baseline — the recommended practice — sweeps in disabled accounts, stale synced users, service accounts and shared mailboxes the blade never shows, and the tenant’s own disabled-user count is named), and the ways to close it with their trade-offs — clean up and exclude before buying, map admin accounts to their owners (the counts are identities; Microsoft’s FAQ licenses people), narrow the targeting only as a deliberate decision because everyone outside a licensed-users group goes unprotected, Security defaults for small tenants (cannot coexist with CA), and buying what remains." },
      { kind: "new", tool: "Licence gap", text: "The numbers refuse to overstate their own precision: an unreadable or over-cap group, or an unreadable role, marks the count ≈ approximate instead of exact; a failed SKU read is “not read”, never zero seats; an unactivated directory role’s 404 counts as its true zero. Report-only policies count (they evaluate everyone in scope), disabled policies do not — but a disabled risk-based policy is named as the P2 obligation it becomes the day it is switched on. Guests are deliberately not counted; guest licensing is a different conversation. Reads only, covered entirely by the two baseline scopes — no extra consent, and it works in demo mode." },
    ],
  },
  {
    build: 25134, date: "2026-08-17", title: "Roadmap R04 was describing a tenant nobody has had since production 254",
    items: [
      { kind: "fixed", tool: "Roadmap", text: "R04\u2019s \"Still to do\" list had gone stale item by item and ended on a flat untruth: \"Production keeps creating role-assignable groups until this lands there.\" Production dropped the role-assignable checkbox in build 254, and the last panels describing it went in 284 \u2014 so the card was telling a reader that the thing it exists to retire was still being created for them. The rest of the list was no better: the bundled group templates and both baseline catalogs stopped asking for the flag, the MS Learn and CIS checks and the documentation exports never mention it, Group Analyzer only REPORTS it on a group it finds (which is the point of a group analyzer, not a leftover expectation), and \ud83d\udce5 Import already files the groups it creates into their persona vault." },
      { kind: "improved", tool: "Roadmap", text: "What is actually left is now what the card says: a group the import REUSES is left exactly as it is \u2014 the preflight added in build 285 says what it inherits, but filing it into its vault and disabling its nesting are still separate steps in \ud83d\udd12 Protect exclusions and \u2467 Disable nesting \u2014 and the flag only truly leaves a tenant once \u2466 Migrate has been run there, because nothing retires a group this app did not create. Roadmap prose is documentation, so it is not queued for promotion: it travels with the next port of index.html." },
    ],
  },
  {
    build: 25133, date: "2026-08-17", title: "Items 59 and 60 reached production (285)",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 59 (\ud83d\udce5 Import finds the role-assignable groups a file would build on, and spells out what a reused group inherits \u2014 R04) and 60 (\u2466 Migrate survives navigating away and verifies the old group is gone, \ud83e\uddf9 Archived groups gains a safe select all, and five delete flows keep the scroll position) are live in production build 285. Removed from the queue; the numbers are retired rather than reused. Roadmap card R04 records the Import preflight as beta 25128 \u00b7 production 285, \ud83d\udc65 CA groups is v4.1 and \ud83d\udce5 Import v2.5 on both channels. Only the two beta-only tools remain queued, and neither can move without its tool." },
    ],
  },
  {
    build: 25132, date: "2026-08-17", title: "Migrate removes the old group from every policy, and proves it",
    items: [
      { kind: "fixed", tool: "CA groups", text: "\u2466 Migrate repointed policies using the reference list from the SCAN, so a policy edited since — by somebody else, or by an earlier group in the same run — was missed. That is not cosmetic: the old group stays assigned, and when the archive is tidied up later the policy is left naming an object id the directory no longer has. That is exactly what a dangling reference in \u2460 Check is, and how a tidy-up turns into a policy pointing at nothing. References are now re-read from the live policies at the moment of the repoint, and any found beyond what the scan knew about are reported." },
      { kind: "new", tool: "CA groups", text: "The removal is then VERIFIED by reading the policies back. Entra keeps a group id in a policy after the group is gone, so a removal that quietly did not take is invisible until the archive is deleted. If the old group is still referenced the run names the policies and warns not to delete the archived group yet; if the verification itself fails it says so rather than reporting a clean migration. Nothing here is reported as done unless it was checked." },
    ],
  },
  {
    build: 25131, date: "2026-08-17", title: "Select all in Archived groups, and it will not tick the dangerous ones",
    items: [
      { kind: "new", tool: "CA groups", text: "\ud83e\uddf9 Archived groups gains select all / deselect all. A tenant that has been through a few recreates can hold ninety of them, and ticking those one at a time is not a review, it is an endurance test." },
      { kind: "improved", tool: "CA groups", text: "Select all ticks only what is SAFE to delete: a group still referenced by a policy is never included, because one careless click across a list that long is exactly how a policy ends up pointing at nothing. Those rows stay individually tickable on purpose, and the button says how many it will take — \"Select all 91 safe\" — rather than implying it takes everything. Deselect all does clear everything, including a referenced row ticked by hand, because \"clear it\" should mean what it says. A live count shows how many of the total are ticked and how many are being deliberately left out." },
      { kind: "improved", tool: "CA groups", text: "The toolbar updates without rebuilding the table. A full re-render on every tick would have thrown away the scroll position inside the modal — the same annoyance fixed for the delete lists one build earlier, and it would have been introduced here in the act of fixing it there. The typed DELETE confirmation and the tick count now gate the button from one place, so a bulk toggle can no longer leave it stale." },
    ],
  },
  {
    build: 25130, date: "2026-08-17", title: "A migration you navigate away from is still visible, and deleting keeps your place",
    items: [
      { kind: "fixed", tool: "CA groups", text: "\u2466 Migrate's progress log and bar were bound to the panel's two elements once, at the start of the run. Leaving the tool and coming back re-renders that panel, which throws those elements away \u2014 so the migration carried on writing into nodes no longer on the page, and you returned to an empty panel with no way to tell whether anything was still happening. That matters more here than in most places: the recreate renames the original group ASIDE before building its replacement, so a run that stopped halfway leaves groups sitting under an archive name. Progress now lives with the run and every write re-finds its element, so the panel can be destroyed and rebuilt as often as it likes." },
      { kind: "new", tool: "All tools", text: "A badge in the corner shows \"\u2466 Migrating 3/12\" from any screen while a migration is in flight, with a progress bar, and takes you back to the panel in one click. Closing the tab mid-run asks for confirmation \u2014 it can leave a group renamed aside with its replacement half-built \u2014 and \u27f3 Rescan now refuses while a run is going rather than quietly discarding it." },
      { kind: "fixed", tool: "All tools", text: "Deleting from a list no longer jumps back to the top. Named locations, authentication contexts, authentication strengths, terms of use and administrative units all re-render the whole panel after a delete, which reset the scroll \u2014 so clearing several meant scrolling back down after every one. The position is kept across the re-render, and the browser clamps it when the list got shorter, which is the right answer for deleting the last row." },
    ],
  },
  {
    build: 25129, date: "2026-08-17", title: "Importing into a tenant that partly has the groups says what it inherits",
    items: [
      { kind: "new", tool: "Import", text: "A tenant that already has some of a file's groups is the normal case, and the two halves are treated very differently. Groups that exist are REUSED \u2014 policies bind to them, nothing is duplicated, nothing about them changes \u2014 while groups that are created get nesting disabled and get filed into their persona vault. Placement deliberately skips an existing group, because it may hold members and sit somewhere on purpose. All defensible; all previously invisible, because a reused group appeared in the report as a bare name. Its nesting, its protection and whether it even matched the shape the file expects were unstated, and silence there reads as \"fine\"." },
      { kind: "new", tool: "Import", text: "The preflight now lists every group that will be reused with what is actually inherited: nesting disabled, allowed, or NOT REPORTED by this tenant (which is not the same as allowed \u2014 a plain read does not return the property); already in a restricted unit, or unprotected with the note that the import will not file an existing group into a vault; and a Microsoft 365 group, which can never go in one." },
      { kind: "new", tool: "Import", text: "It also catches a SHAPE MISMATCH nothing checked before: the file expects a dynamic group with a membership rule and the tenant has an assigned group of that name, so the rule is never applied and the group keeps whatever members it has \u2014 or the reverse, where the file expects assigned and the tenant's dynamic rule goes on deciding the membership. Both would have imported cleanly and quietly. No extra requests for any of it: the same batch that finds role-assignable groups now selects the other fields, and protection comes from one tenant-wide read." },
    ],
  },
  {
    build: 25128, date: "2026-08-17", title: "Import finds the role-assignable groups a file would build on (R04)",
    items: [
      { kind: "new", tool: "Import", text: "R04 \u2014 a baseline exported from a tenant that still used the role-assignable flag brings those groups with it, and importing on top of them is not neutral. The flag is immutable, it forbids controlling nesting, and it cannot be combined with a restricted management administrative unit \u2014 a group carrying both has nobody who can change its members. So the policies would import cleanly, land on groups the baseline has deliberately moved away from, and the \ud83d\udee1 protection step would silently skip exactly those. The preflight now reads the groups THIS FILE brings, one batch, and names any that already exist here as role-assignable." },
      { kind: "improved", tool: "Import", text: "It does not do the conversion itself, and says why. Converting means recreating the group \u2014 rename the original aside, create a plain security group with nesting disabled, copy the members, repoint every referencing policy, then place it in the restricted unit \u2014 which already exists in \u2466 Migrate behind a typed confirmation, with its own report and the archived original as the rollback. A second copy of a destructive operation is how the two drift apart, so this hands over instead. Importing now and converting later stays a choice; the report lists them as unprotected." },
      { kind: "improved", tool: "Import", text: "A failed read is reported as \"could not check\", never as clean \u2014 the same rule the restricted-AU preflight follows. Finding none renders nothing rather than an empty panel, and the panel sits ABOVE \ud83d\udee1 PROTECTION because it decides whether protection can work at all." },
    ],
  },
  {
    build: 25127, date: "2026-08-17", title: "Promoting is four steps, and the queue now says so",
    items: [
      { kind: "improved", tool: "All tools", text: "The eight cards that drifted in 25126 drifted because the routine was written down as one step \u2014 remove the row, bump the production build \u2014 when it is four. The promotion queue's header rules and the rendered \ud83d\udea6 Waiting for production section now both spell them out: remove the row and bump productionBuild; set the roadmap card on MAIN to live \u00b7 build NNN; set the SAME card on beta to live \u00b7 beta NNNNN \u00b7 production NNN; add the changelog entry on both channels." },
      { kind: "improved", tool: "All tools", text: "It also records WHICH step gets missed and why, because that is the part a rule cannot enforce: the third, since the port is finished and working by then, and each channel carries its own index.html so promoting only ever touches main's roadmap. And it states how to read the symptom \u2014 a shipped card saying \"live \u00b7 beta NNNNN\" with no production clause is either a tool that genuinely has not been promoted, or that step being skipped." },
    ],
  },
  {
    build: 25126, date: "2026-08-17", title: "Eight roadmap cards still called themselves beta-only after reaching production",
    items: [
      { kind: "fixed", tool: "Roadmap", text: "R27 read \"live \u00b7 beta 25115\" on the beta channel while being in production since build 283 \u2014 so the roadmap said beta-only and the promotion queue, correctly, showed no gap. The two disagreed because each channel carries its own roadmap: promoting an item updates main's copy of the card, and nothing updated beta's. R07, R08, R09, R10, R29, R30 and R31 had drifted the same way. All eight now name the production build they reached, in the form R11 and R14 already used." },
      { kind: "improved", tool: "Roadmap", text: "The wording is consistent too: four of them said \"live \u00b7 build 250xx\", using \"build\" for a five-digit beta number, which reads like a production release to anybody who does not know the two series apart. Every shipped card now reads \"live \u00b7 beta NNNNN \u00b7 production NNN\", or beta alone when the tool genuinely has not been promoted \u2014 R05, whose tool is still beta-only, correctly says beta alone." },
    ],
  },
  {
    build: 25125, date: "2026-08-17", title: "Roadmap R35 and R36 — the baseline gets a new name and a second one gets equal standing",
    items: [
      { kind: "new", tool: "Roadmap", text: "R35 \u2014 the bundled baseline is renamed from Limon-IT baseline \u2014 R26.6 (v3.x) to CloudFellows baseline \u2014 R26.6 (v3.x). The card records that a rename is not one string: it appears in the tool header, the catalog label and line, the Help section, and the documentation and Markdown exports that stamp which baseline a tenant was measured against. It also records the two things it must NOT touch \u2014 the catalog id, which saved state and Drift watch snapshots key on, and the CAB-SEC / CAD-SEC group names, which are the tenant's objects and not ours to rename. Display name everywhere, identifiers nowhere." },
      { kind: "new", tool: "Roadmap", text: "R36 \u2014 the Joey Verlinden baseline becomes a first-class baseline instead of comparison-only. Group checks, group creation, persona checks and restricted-AU creation all stop at the bundled catalog today; the plan is that picking a baseline changes what every downstream tool works against. Plus fetching the latest release from his repository rather than shipping a transcription \u2014 the catalog here is a hand-checked snapshot pinned at commit 38469a4, accurate the day it was written and stale the day he pushes." },
      { kind: "new", tool: "Roadmap", text: "R36 names the three things that make it more than plumbing, so it is not picked up as a small job. His exclusion groups are named after the policy rather than by CA number, and every routing decision in Protect, Bulk add and the RMAU baseline reads a CA number out of a group name \u2014 the same gap R28 opens for a tenant's own groups. His personas differ and do not map onto our CA ranges at all, so the persona vaults are per-baseline rather than a rename of ours. And a live fetch is a trust boundary: unauthenticated GitHub is rate-limited and a release can be malformed, so the bundled snapshot stays as the fallback and the tool has to say which of the two it used rather than failing quietly to the old one." },
    ],
  },
  {
    build: 25124, date: "2026-08-17", title: "Items 56-58 reached production (284)",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 56 (policy ID on the expanded card), 57 (every create path disables group nesting, and says whether it took) and 58 (the create panels describe what they actually create) are live in production build 284. Removed from the queue; the numbers are retired rather than reused. Only the two beta-only tools remain queued, and neither can move without its tool." },
    ],
  },
  {
    build: 25123, date: "2026-08-17", title: "The create panels stopped describing a group they no longer make",
    items: [
      { kind: "fixed", tool: "CA groups", text: "Four places still told you that groups are created as role-assignable security groups, that membership can then only be changed by a Privileged Role Administrator, and that creation requires that role — none of which has been true since build 25026, when role-assignable creation was retired. The Assign wizard footnote, the batch-create panel, its per-row label and the scope table now describe what actually happens: a plain security group with nesting disabled, protected by a restricted administrative unit if you want membership out of reach, with 🔒 Protect as the route." },
      { kind: "fixed", tool: "CA groups", text: "The Help entry still described ↻ Recreate role-assignable, an action removed in 3.3, and framed a non-role-assignable group as the problem. It is the other way round: the flag is retired, so a plain group is correct and a role-assignable one is what gets flagged, with ⑦ Migrate as the way out. Documentation that describes a button nobody can find is worse than none — it sends somebody looking." },
    ],
  },
  {
    build: 25122, date: "2026-08-17", title: "Say that nesting was disabled, and say what \"assigned\" meant",
    items: [
      { kind: "fixed", tool: "CA groups", text: "25121 made every create disable group nesting, and then said nothing about it — so a security setting that WAS applied looked identical to one that was not, and a create where it failed looked like a clean success. The ② Create result line and the ① Create missing groups list now report the outcome per group: 🚫 nesting disabled, or ⚠ nesting could NOT be disabled with the reason and a pointer to ⑧ Disable nesting. The panel also says up front that a group is created with nesting disabled, and names the extra consent, so it is expected rather than discovered." },
      { kind: "fixed", tool: "CA groups", text: "\"✓ created testGroupsMM — assigned\" read as assigned TO something. It was the membership type — the radio button above — so it now says \"assigned membership (you add the members)\" or \"dynamic membership\". A reused group says \"reused, and left as it is\", including its nesting setting: an existing group is not silently reconfigured." },
    ],
  },
  {
    build: 25121, date: "2026-08-17", title: "Every group this tool creates has nesting disabled",
    items: [
      { kind: "fixed", tool: "CA groups", text: "disableNesting was set by exactly two of the ten create paths — ⑦ Migrate and the nesting recreate. ① Create missing groups, 👥 Assign groups or roles, 📥 Import, create-by-name and the Restricted AUs baseline all created groups with nesting ALLOWED, and none of the 100 group templates set it either. So the one moment the property reliably takes — creation — was the moment every ordinary create skipped, and fixing it afterwards meant the destructive recreate: archiving a group that policies already reference. Every create path now asks for it." },
      { kind: "improved", tool: "CA groups", text: "It is requested twice and then verified. The property goes in the create body AND is confirmed by a PATCH afterwards, because the field reports say it only takes at creation while Microsoft documents it as patchable with Group-NestingSupport.ReadWrite.All — doing both means whichever is true in this tenant, the group ends up right. A plain GET never returns the property, so it is read back by name; \"absent\" is ambiguous and is not read as success." },
      { kind: "improved", tool: "CA groups", text: "Nothing here is allowed to cost you the group. A tenant that rejects the property on create has the create retried without it — but only when the error actually names that field, so an unrelated validation error still fails loudly instead of being swallowed. A group whose nesting could not be set comes back marked nesting still allowed, with the reason, rather than reported as done; the ⑧ Disable nesting step can then finish it. Dynamic groups (members are rule-driven, and only users and devices may be members) and role-assignable ones (Entra already refuses group-in-group) are skipped as redundant." },
    ],
  },
  {
    build: 25120, date: "2026-08-17", title: "The policy ID survives opening the card",
    items: [
      { kind: "fixed", tool: "List Policies", text: "The compact card showed the policy ID and the expanded one did not, so opening a policy to look at it properly took away the one string that identifies it — on the card that gets exported, screenshotted and pasted into a ticket. Two policies can share a name, a version and a persona; the portal is reached by id. It now sits in the footer of both, on the exported card as well, and one click selects the whole GUID because the reason to read an id is to paste it somewhere." },
      { kind: "fixed", tool: "List Policies", text: "While adding it: five attributes were built from the policy id without escaping it — data-card, data-png, data-open and two checkboxes. A policy id is a GUID from Graph, so this was defence in depth rather than a live hole, but an attribute built from data is either escaped or it is not, and \"it happens to be a GUID today\" is not a rule. Found by the test written for the new footer, not by reading." },
    ],
  },
  {
    build: 25119, date: "2026-08-17", title: "Reconcile production 283",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 53 (restricted-unit documentation pages), 54 (persona group suggestions carry the protection check) and 55 (the baseline report stops answering a question it never asked) are live in production build 283 — verified against main file by file, not taken from the commit message. Removed from the queue and productionBuild moved to v1.0.283; the numbers are retired rather than reused. Only the two beta-only tools remain queued, and neither can move without its tool. A queue that still lists what has shipped is worse than no queue, because promoting from it re-applies live changes." },
    ],
  },
  {
    build: 25118, date: "2026-08-17", title: "A column that was never read, and a link that went nowhere",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "The persona baseline report printed a Scoped admin column it never populated. Scoped administrators were only known for units the tool created in that same run; for a unit that already existed there was no record, so the cell printed an em dash — and the footnote about a vault nobody can open turned that silence into a finding. A tenant with four Groups Administrators scoped to its break-glass unit was documented as having none. The report never called scopedRoleMembers at all. The column is gone rather than half-filled, and the report now states what it covers: whether each persona's unit exists and is restricted, nothing more. A grant made while creating a unit is still reported, on the row it belongs to." },
      { kind: "improved", tool: "Restricted AUs", text: "The same report now says outright that a restricted unit outside the persona baseline is not listed. It checks the baseline names against the tenant, so a unit the tenant has under any other name could never appear — which is how a unit holding a frozen group stayed invisible in a report that looked complete. For scoped administrators, protected groups and policy dependencies it points at 🛡 Restricted AUs and at 📄 Create documentation, both of which read the tenant rather than a name list." },
      { kind: "fixed", tool: "All tools", text: "📖 Read the setup manual on roadmap card R14 did nothing when clicked, and the 🔒 Security & risk links shared the fault. Each was bound once at script load, but the roadmap cards these links sit on are moved into 🗄 Shipped as they age, so the binding did not reliably reach the anchor the reader clicks. The handler is now delegated on the document, and every one of these anchors carries a real file path instead of href=\"#\" — so even with the script broken the link reaches the document rather than jumping to the top of the page." },
    ],
  },
  {
    build: 25117, date: "2026-08-17", title: "A group that cannot go in says so, instead of being offered",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "The persona chips were built from the group NAMES the baseline knows about, so they offered two things they should not: groups this tenant does not have, and groups it has that cannot be protected. Clicking a role-assignable one produced exactly the frozen group — editable by nobody — that this tool exists to prevent. The chips are now backed by the same bounded scan ＋ Bulk add runs: what can be added is a click, and what cannot is listed with the reason." },
      { kind: "improved", tool: "Restricted AUs", text: "There is now ONE verdict function behind both the bulk panel and the chips. It was duplicated logic in two places, which would have disagreed the first time either was corrected — and the reasons are ordered deliberately: already a member, then Microsoft 365 group, mail-enabled security, distribution, role-assignable, then already in another restricted unit. A role-assignable candidate carries a route to ⑦ Migrate rather than only a diagnosis, and a group already in a DIFFERENT unit explains that adding it here widens who can reach it rather than narrowing it." },
      { kind: "improved", tool: "Restricted AUs", text: "The type-ahead under the chips carries the same verdicts on its options, so the manual route cannot offer what the chips just refused. The scan is cached per persona and starts when the unit is opened; until it lands the row says it is checking, and if it fails it says so and leaves the manual box working rather than pretending the tenant has nothing." },
    ],
  },
  {
    build: 25116, date: "2026-08-17", title: "Device reality and short audit windows reach production 282",
    items: [
      { kind: "improved", tool: "Device reality check", text: "Promotion item 35 reached production build 282. Device reality check is now v1.0 and out of BETA, carrying NEW on both channels: per CA policy and platform it joins the Conditional Access device grant to its Intune compliance or app-protection assignment, reads the tenant default first, names OR alternatives and exports the evidence as Markdown." },
      { kind: "fixed", tool: "Device reality check", text: "Incomplete evidence can no longer become a confident verdict. If an Intune policy's assignments cannot be re-read, a relevant membership cannot be read, or a membership hits the read cap, the result is not proven — never “assigned to nothing,” covered from a truncated list, or uncovered from a failed read. Direct assignments and complete transitive membership overlap still prove coverage." },
      { kind: "improved", tool: "Change audit", text: "Promotion item 52 reached production build 282. The 1-, 4- and 24-hour incident windows, their human-readable screen/export labels, and the matching Drift watch guidance are now the same on beta and production." },
      { kind: "improved", tool: "Roadmap", text: "R11 now records production build 282. R27 remains the next independent promotable change — item 53 — and its optional, fail-soft restricted-unit pages stay on beta until that number is selected." },
      { kind: "improved", tool: "All tools", text: "The beta promotion queue now compares against production v1.0.282 and removes exactly rows 35 and 52. The remaining numbered gap is 53 (R27), 34 (CIS Help, inseparable from the beta-only CIS tool) and 24 (Baseline guide)." },
    ],
  },
  {
    build: 25115, date: "2026-08-17", title: "Restricted-unit pages belong in the document (R27)",
    items: [
      { kind: "new", tool: "Create documentation", text: "R27 is now the thing its roadmap card asked for: restricted administrative units are optional pages inside the same Word, PDF, Markdown or PNG-bundle documentation as the Conditional Access policies, not a second Markdown report in the Restricted AUs tool. The appendix opens with a review summary and gives every restricted unit its own page: persona and CA range, the objects it protects, every policy that includes or excludes each protected group, the people scoped to the unit, and whether the actual directory role definition contains a group-membership update action." },
      { kind: "new", tool: "Create documentation", text: "The questions an auditor arrives with lead the output: who could widen an exclusion and what would happen if they did. A unit with nobody scoped, an empty unit and a role-assignable group frozen inside a restricted unit are findings rather than footnotes. Failed reads remain unknown — never silently re-labelled empty or safe — and policy impact is calculated from all tenant policies even when the exported policy-page selection is narrower." },
      { kind: "improved", tool: "Create documentation", text: "The restricted-unit integration is optional and deliberately fail-soft. Create documentation reads the unit list, members, scoped roles and role definitions for itself; it does not depend on the Restricted AUs screen having run or on state another tool left behind. A missing permission, unavailable endpoint, unreadable unit or supplemental-page render failure is recorded or skipped locally while the core policy document continues to export. The existing Restricted AUs Export MD stays the raw inventory it has always been." },
      { kind: "fixed", tool: "Roadmap", text: "R14 — the single-tenant app registration — said available now while still sitting inside Next. It shipped in beta build 25014 and reached production in 273, so it now lives in the shipped timeline where the roadmap's own rule says it belongs. R27 moves from Next to Now with this build." },
      { kind: "improved", tool: "Roadmap", text: "R32 and R34 now say the integration rule explicitly. Connections between tools are welcome shortcuts and enrichments, but never prerequisites: the core owns its reads and result, integrations sit behind optional adapters, and tests cover them absent and throwing. If another tool is unavailable or broken, convenience may disappear; the main tool may not break with it." },
      { kind: "fixed", tool: "Device reality check", text: "Help ended by saying coverage was judged only from assignment targets and that memberships were not expanded, directly contradicting the membership pass added in build 25110. It now describes the actual ladder: direct assignments first, transitive user-overlap matching when names cannot prove coverage, and not proven when a scope cannot be read safely. The Permissions overview now names Device reality check beside both Intune read scopes it asks for." },
      { kind: "improved", tool: "Change audit", text: "The home tile and both rendered headers now carry UPDATED for the new short incident windows. Updated and new tools are always kept in view on the collapsed home page; an untagged change is an invisible change." },
    ],
  },
  {
    build: 25114, date: "2026-08-17", title: "Change audit can zoom in to the last hour",
    items: [
      { kind: "improved", tool: "Change audit", text: "The audit window now goes down to the last 1 hour, 4 hours or 24 hours, alongside 7, 30 and 90 days. A fresh policy rollout or active incident no longer means reading and paging through a week of unrelated directory changes just to answer who touched it. The filter is applied in the Graph query, so a shorter choice also means less data read; changing the range after a result immediately re-reads that window." },
      { kind: "improved", tool: "Change audit", text: "Short windows stay human everywhere: the result heading, Markdown report and a loaded snapshot say “1 hour”, “4 hours” or “24 hours”, never a fractional number of days. Help now explains the incident-versus-review ranges and tells Drift watch users to choose an audit window that reaches back before the suspected drift if they want actor attribution." },
    ],
  },
  {
    build: 25113, date: "2026-08-14", title: "This site had been announcing the wrong version for 13 builds",
    items: [
      { kind: "fixed", tool: "All tools", text: "The sign-in screen and footer read v1.0.251-beta.12. They should have read v1.0.250-beta.112. The version label derived its cycle by dividing the build number by 100, which works right up until a cycle passes its 99th iteration — and this one did, at build 25100, thirteen builds ago. Everything after that rolled over into the next hundred, so the site announced itself as a beta of production build 251: a release that had already shipped thirty builds earlier. The cycle is now stated outright rather than derived, which makes the iteration count unbounded (beta.100, beta.112, beta.250 — as far as a cycle runs) and the rollover impossible to repeat. Nothing about the build numbers themselves changes." },
      { kind: "fixed", tool: "All tools", text: "The same page disagreed with itself: 🚚 Waiting for production printed “this site is v1.0.250-beta.112” from a hand-maintained field while the footer computed v1.0.251-beta.12 from the build. That field is gone — the header now reads the app's own label, because a version is not a judgement call. Only the production build stays hand-maintained there, since a static site genuinely cannot know what the other channel is running." },
      { kind: "improved", tool: "All tools", text: "A note left in the code for whoever cuts the next cycle: the cycle number was originally read as “the production build this beta cycle will become”, and that stopped being true once work began graduating one queue number at a time — production walked 250 to 281 while this cycle stayed 250. It is a cycle name, not a promise, and it is now documented as one." },
    ],
  },
  {
    build: 25112, date: "2026-08-14", title: "Roadmap: tools as independent, numbered, portable modules",
    items: [
      { kind: "improved", tool: "Roadmap", text: "Three new items that are one architectural direction. R32 — every tool must be able to run on its own, with nothing but a signed-in session: whatever it needs it reads itself, instead of rendering from state another tool happened to leave behind; the newest tools already live this way, the older ones grew up sharing and need untangling one at a time. R33 — permanent T-numbers for the tools themselves, assigned in the order each tool entered ENCA and never reused, the same discipline the roadmap's R-references already follow — so “T07 misbehaves” means one thing across both channels, every build, and any future language. R34 — every tool easy to port to other applications: logic as a pure module with a documented contract, wiring thin enough to rewrite in an afternoon, the way the newer tools are already built. R32 is the precondition for R34, and R34 is the honest test of R32: a module you can lift into a different application is one that was actually decoupled." },
    ],
  },
  {
    build: 25111, date: "2026-08-14", title: "The verdicts explain themselves, and “assigned to nothing” must be earned",
    items: [
      { kind: "improved", tool: "Device reality check", text: "The four verdicts are now defined where they are read, not just used: a legend on the summary card and a full explanation in Help. ✅ covered — proof was found (All-devices / All-users assignment, the include group assigned directly, or every member matched by the membership pass); it says the check has someone to answer for, not that the compliance policy is strict. ⚠️ not proven — Intune policies exist but coverage could not be proven: an unenumerable CA scope (All users, guests, roles), a partial member match, a device-group assignment that cannot be matched to users, or an empty include group — not necessarily broken, but “nobody can show you this works”, which for an audit is usually the same problem. ❌ uncovered — a proven gap: no Intune policy for the platform, or none of the scope's members in any assigned group; the tenant default decides whether that means silent passes or blocked users. 🚫 n/a — the control cannot exist on the platform at all." },
      { kind: "fixed", tool: "Device reality check", text: "Policies showed as “assigned to nothing” that are assigned. The list-level $expand=assignments is not reliable — on real tenants it comes back empty for whole families (app protections notoriously, some compliance policies too), and an empty answer is indistinguishable from a genuinely unassigned policy. Any policy the expand returns without assignments now gets its assignments re-read individually before the analysis sees it, so “assigned to nothing” is a finding again rather than an artefact — and the membership pass matches against the real groups instead of judging a false empty." },
    ],
  },
  {
    build: 25110, date: "2026-08-14", title: "The verdict names the groups — and matches the members",
    items: [
      { kind: "improved", tool: "Device reality check", text: "A “not proven” verdict said only group-assigned (3 policies) and listed the policy names — which told you there was a gap without telling you who is in it. WHICH groups those policies are assigned to is exactly what decides who falls through to the tenant default, so every Intune policy on a verdict now carries its assignment inline: policy → the groups it is assigned to, with its exclusion groups named too, because an exclusion is how coverage leaks just as quietly. Shown as a sub-list on the card and in the Markdown report." },
      { kind: "improved", tool: "Device reality check", text: "A different group name does not mean a user is not covered. The first release judged coverage by assignment names alone, so a CA policy including CAB-SEC-U-Persona-Externals read as uncovered even when every member of that group also sits in the “MAM — All BYOD” group Intune actually assigns. Where assignment names cannot prove coverage, the tool now expands the memberships (transitive, so nesting counts) of the CA include groups and the Intune-assigned groups and matches the USERS: all matched → covered by membership, some → “n of m members covered”, none → uncovered. Per-policy Intune exclusions count against that policy only — a user excluded from one compliance policy can still be covered by another. The honest edges stay honest: All-users / guest / role scopes cannot be enumerated and stay “not proven”; an Intune policy assigned a DEVICE group is named as unmatchable to users rather than counted as a gap; an unreadable group or one over the read cap falls back to assignment names instead of pretending to be empty. The pass only runs when something is flagged, and the summary says how many groups were matched." },
    ],
  },
  {
    build: 25109, date: "2026-08-14", title: "The other half of “require compliant device” (R11)",
    items: [
      { kind: "new", tool: "Device reality check", text: "🖥 Compliant-device reality check — roadmap item R11, beta-site only. A grant control demanding a compliant device is only worth what Intune's compliance policies are worth: the CA side names WHO must present a compliant device, the Intune side decides WHICH devices can ever be one, and neither portal checks that the two halves meet. The tool reads the compliance policies (settings catalog included — Linux only exists there) with their assignments and gives a verdict per CA policy and PER PLATFORM, because compliance is per-platform and “covered on Windows, wide open on macOS” is exactly the shape of the gap. What is read FIRST is the tenant default for devices with no compliance policy at all — Intune's “Mark devices with no compliance policy assigned as” toggle — because that single setting decides what every gap means: Compliant → an uncovered device passes the CA grant silently; Not compliant → the same gap surfaces as blocked users, loud but not silent. Coverage is proven from assignment targets (All devices / All users, or the CA include group directly assigned) and everything else is reported as “not proven” rather than assumed — memberships are not expanded and the tool says so. OR-alternatives are named per policy, since compliant-device-OR-MFA does not block an uncovered device, it just waves it through on MFA — a gap in what the policy name promises, not in availability. The same check runs for app protection behind “require approved client app”, flagged as unsatisfiable outside iOS and Android. Policy names open the policy card; Markdown report; demo mode. Reads only — DeviceManagementConfiguration.Read.All and DeviceManagementApps.Read.All, asked once on the click." },
    ],
  },
  {
    build: 25108, date: "2026-08-14", title: "Items 48-51 reached production (281)",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 48 (searchable bulk scoped-admin grant), 49 (flagged home tiles ranked by recency), 50 (the per-unit scoped-admin field really takes several people) and 51 (tool count on the home heading) are live in production build 281. Removed from the queue; the numbers are retired rather than reused. Only the two beta-only tools remain queued, and neither can move without its tool." },
    ],
  },
  {
    build: 25107, date: "2026-08-14", title: "Items 44 and 47 reached production (280)",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 44 (Gap analyse scans only named users or groups) and 47 (persona groups offered when adding to a restricted unit) are live in production build 280. Removed from the queue; the numbers are retired rather than reused." },
    ],
  },
  {
    build: 25106, date: "2026-08-14", title: "How many tools there are, next to the question",
    items: [
      { kind: "new", tool: "All tools", text: "\"What do you want to do?\" now says how many tools there are to do it with. The number is counted from the tiles on the page rather than written down, so it cannot drift from what is actually there — a hand-maintained count is wrong one release after it is typed. Help cards are excluded: they explain the tools rather than being them, and counting them would inflate the number by three. Hovering gives how many are new or in beta." },
    ],
  },
  {
    build: 25105, date: "2026-08-14", title: "The scoped-admin field really does take several people",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "Typing a second administrator after a ; found nobody. The type-ahead searched the WHOLE field, so the moment a separator was typed the search term became \"adm-irse@devcf.onmicrosoft.com;tula\" and matched nothing — the field looked broken exactly when it was being used the way it invites. It now searches the entry being typed, remembers what precedes it, and puts a pick from the list back after it: choosing from a datalist replaces the whole value, which would otherwise have eaten the names already entered." },
      { kind: "fixed", tool: "Restricted AUs", text: "And the grant itself only ever granted one. \"a@x.com;b@x.com\" was sent as a single UPN, so it failed as one unresolvable user rather than succeeding twice — the field has looked like a list for months without being one. Each person is now a separate grant with its own outcome, reported as a fraction with the failures named, consent asked once rather than per person, and the unit re-read once at the end." },
    ],
  },
  {
    build: 25104, date: "2026-08-14", title: "The tile that just changed comes first",
    items: [
      { kind: "fixed", tool: "All tools", text: "A collapsed home section has four slots and ✍️ Manage the tenant has five flagged tiles, so one is always buried — and page order decided which. 🛡 Restricted AUs, changed in the build before this one, lost its slot to a BETA badge that had been sitting there for weeks. Flagged tiles are now ranked by RECENCY, read from the changelog: the build number of the newest entry naming that tool. A tool the changelog has never named sorts last among the flagged rather than first, because no date is not a recent date." },
      { kind: "improved", tool: "All tools", text: "The newest is also leftmost rather than merely on screen, and the count on the button now says \"new, beta or updated\" — it always counted UPDATED tiles, and calling them \"new or beta\" made the number look wrong to anybody who checked it." },
    ],
  },
  {
    build: 25103, date: "2026-08-14", title: "Search for the people you are granting, in bulk too",
    items: [
      { kind: "improved", tool: "Restricted AUs", text: "👤 Grant scoped administrators across units took a comma-separated list of UPNs, which assumes you already know them — so the fastest route was to leave the tool and go look them up, which is the same complaint that made adding a group a picker. Search a person by name, pick, and they join the list as a chip you can take back off." },
      { kind: "improved", tool: "Restricted AUs", text: "Pasting a list still works, and both routes feed ONE list: the picker writes the same field the paste box holds rather than keeping its own array. Two sources of truth for who is being granted is how somebody ends up holding a role they had been removed from. The grant count under the units reads that same list, so it never disagrees with what is about to happen." },
    ],
  },
  {
    build: 25102, date: "2026-08-14", title: "Items 40-43 reached production (279)",
    items: [
      { kind: "improved", tool: "All tools", text: "Queue items 40 (local release time), 41 (external user types named on a policy card), 42 (What-If searches the tenant's apps) and 43 (filter the policies that did not apply) are live in production build 279. Removed from the promotion queue; the numbers are retired rather than reused." },
    ],
  },
  {
    build: 25101, date: "2026-08-14", title: "Adding a group works like granting a scoped administrator",
    items: [
      { kind: "improved", tool: "Restricted AUs", text: "Adding a member to a persona vault was a free-text box over every group in the tenant, which makes the right answer exactly as hard to reach as the wrong one. The unit already knows its persona, so the groups whose CA number maps to it are now offered by name, one click each — the same shape granting a scoped administrator already has, where what belongs here comes first and anything else is still possible. Nobody should have to remember that CAB-SEC-U-CA101-Exclusion is the Admins one." },
      { kind: "improved", tool: "Restricted AUs", text: "Groups already in the unit are not offered again, and when none are left the row says so instead of sitting there empty. Any other group is still typed in below — and while you type, the suggestion list puts this persona's groups first, labelled as belonging here, with the rest of the baseline after. Break-glass units match by intent rather than by CA number, as everywhere else." },
    ],
  },
  {
    build: 25100, date: "2026-08-14", title: "R27 and R28 reverted — the wrong reading of both",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "Builds 25098 (R28) and 25099 (R27) are reverted in full. R28 was built as a stored mapping in each unit's description, and R27 as a second Markdown document; neither is what was asked for. Queue items 45 and 46 are withdrawn and their numbers retired — a number is never reused, including when the work it named is taken back. Both roadmap cards return to Next as planned, with their references intact." },
    ],
  },
  {
    build: 25097, date: "2026-08-14", title: "Gap analyse can scan only who you asked about (R29)",
    items: [
      { kind: "new", tool: "Gap analyse", text: "R29 — Scope → \"Only these users or groups\" names principals before the scan and judges only those: the same policies, the same verdicts, a fraction of the reads. The matrix was always the right output; the scope was not. The question is usually narrow — is this contractor covered, what does the finance team bypass, did that exclusion group leave anybody exposed — and answering it should not mean reading every user in the tenant first." },
      { kind: "new", tool: "Gap analyse", text: "A named group is expanded to its members, nested groups included. The scan judges people, not groups: a group being in scope of one policy says nothing about a member another policy excludes, and a row per group would answer a question nobody asked." },
      { kind: "improved", tool: "Gap analyse", text: "The result says what it was scoped to, on screen above the counts and in the exported report. \"No risky bypasses\" over four named people and over the whole tenant are different answers that otherwise render identically — and the scoped one is the easier of the two to mistake for the other." },
    ],
  },
  {
    build: 25096, date: "2026-08-14", title: "Filter the policies that did not apply (R30)",
    items: [
      { kind: "new", tool: "What-If", text: "R30 — a run against a real tenant answers with two policies that apply and 107 that do not, each with its reason. That is the honest answer and it is unreadable as one block, because the question behind it is almost never \"show me everything\": it is a persona question — why did no Admins policy apply to this admin — or a number question, what happened to CA103. The list now filters by persona and by CA number, using the same CA ranges 🗂 List Policies groups by through the same helper, so the ranges stay one idea across the toolset rather than two implementations that drift." },
      { kind: "new", tool: "What-If", text: "A count per reason comes first — \"94 user out of scope · 8 platform not in scope · 5 user excluded\" — and each count is a filter. When a policy you expected is missing, the reason is what you are hunting for, so it should be the thing you can click. The counts travel into the Markdown export as well." },
      { kind: "improved", tool: "What-If", text: "\"Scenario does not say\" is its own reason rather than a kind of out-of-scope. A policy that scopes sign-in risk when the scenario left risk blank was not ruled out — the run simply could not evaluate it, and that is a prompt to fill a field in, not a finding about the policy. Grouping the two together made an incomplete scenario look like a clean result." },
    ],
  },
  {
    build: 25095, date: "2026-08-14", title: "What-If searches your apps, not their GUIDs (R31)",
    items: [
      { kind: "new", tool: "What-If", text: "R31 — Target resource → Other now searches the tenant's own applications by name and fills the id in, instead of asking for a raw GUID. Nobody knows their apps by GUID, so answering that meant leaving the tool, finding the enterprise application in the portal and copying the id back; and a mistyped GUID did not fail, it quietly described a sign-in to an app nobody has — the same class of mistake as a wrong country code, and the reason R08 exists." },
      { kind: "improved", tool: "What-If", text: "A pasted App ID keeps working and is resolved to a name underneath the box, so the choice is verifiable before the run. An id with no service principal in this tenant is reported — \"a policy can still name it, so the run will use it as typed\" — rather than refused: 📥 Import already has to handle exactly that, so an id ENCA cannot name is legitimate, not invalid. What is refused is a typed word that matches no application, because that is neither a name nor an id and would otherwise be evaluated as a resource nobody has." },
    ],
  },
  {
    build: 25094, date: "2026-08-14", title: "Which external users, not just \"external users\"",
    items: [
      { kind: "improved", tool: "List Policies", text: "A policy card showed − Guests & external users and stopped there, so the exclusion that decides whether a policy reaches your CSP partner's delegated admins read the same as one that does not. The selection is six independent types and the card now names them: \"Guests & external users: B2B collaboration guests · NOT service providers\". When all six are selected it says so — \"all types, incl. service providers\" — because the collapsed form still has to answer the question. A selection scoped to named tenants says how many, since an exclusion covering two partner tenants does not cover a third." },
      { kind: "improved", tool: "List Policies", text: "Include and exclude now read the same way. The include side already listed the types under a different label (\"Guests/external:\"); both use one formatter, so the two halves of a policy can be compared without translating between them." },
    ],
  },
  {
    build: 25093, date: "2026-08-14", title: "The release time was an hour in the future",
    items: [
      { kind: "fixed", tool: "All tools", text: "The sign-in stamp read 15:00 CEST at 13:52. The conversion was right and the recorded value was wrong: builds 25090-25092 (and production 277) carried a local Amsterdam time in a field documented as UTC, so every stamp was displayed two hours late — typing a local time into a field labelled UTC is the same mistake the local-time display was added to prevent, made one build after adding it. The field is now set from the clock rather than by hand, and says so." },
      { kind: "fixed", tool: "Roadmap", text: "R08 🌐 Type the country, get the code shipped in build 25065 and its card never left \"Next\" — the tool has had the ISO type-ahead for a week while the roadmap still called it planned. Moved to Now with the build it went live in. A roadmap that describes shipped work as planned is worse than no roadmap: it is the one page somebody checks before asking whether a thing exists." },
    ],
  },
  {
    build: 25092, date: "2026-08-14", title: "Service provider checks reached production",
    items: [
      { kind: "improved", tool: "MS Learn checks", text: "Queue item 39 — the five service provider (CSP / GDAP) exclusion checks — is live in production build 277. Removed from the promotion queue; the number is retired rather than reused." },
    ],
  },
  {
    build: 25091, date: "2026-08-14", title: "The release time reads in your own timezone",
    items: [
      { kind: "improved", tool: "All tools", text: "The build stamp on the sign-in screen shows the release time where you are — 2026-08-14 14:05 GMT+2 in Amsterdam rather than 12:05Z. The value is still recorded once in UTC, because a build is cut at one instant; but \"when was this last updated?\" is asked by somebody sitting in a timezone, and an ISO Z stamp made every one of them do the arithmetic. Hovering gives the UTC original and names the timezone it was converted to, so a screenshot taken in another country still reconciles with a note in a ticket." },
    ],
  },
  {
    build: 25090, date: "2026-08-14", title: "Which exclusions a service provider needs",
    items: [
      { kind: "new", tool: "MS Learn checks", text: "Five checks for the partner who administers this tenant on your behalf. A CSP or GDAP delegated admin is matched by the Service provider users external user type and by nothing else — they hold no account, no group membership and no device here, so the break-glass exclusion and the persona groups never reach them. The checks find: an external-user exclusion listing the other five types but not this one; a Block policy their sign-in falls into (the documented cause of a partner losing admin-on-behalf-of); a compliant or hybrid-joined device requirement they cannot satisfy without cross-tenant device trust (AADSTS530004); grant controls documented as unsupported for external users — approved client app, app protection policy, password change; and a guest MFA policy that omits the one external identity holding admin roles here. Exclusions scoped to named tenants are read as named: an exclusion covering two partner tenants does not cover a third." },
      { kind: "new", tool: "MS Learn checks", text: "The checks are judged against the tenant rather than in the abstract. Cross-tenant access settings are read once for partners flagged isServiceProvider and their inbound trust: a partner whose compliant-device claims you already accept raises no device finding, and a tenant with no service provider partner has all five checks skipped rather than answered — the summary says which and why. When the settings cannot be read the checks still run and state that the trust configuration was not verified, because that is a different sentence from there being no partner." },
      { kind: "improved", tool: "MS Learn checks", text: "Two of the five build a fix: adding Service provider users to an existing include or exclude selection is mechanical. The other three need a decision — trust the partner's device claims, or exclude them — and decline rather than guess. 17 checks became 22." },
    ],
  },
  {
    build: 25089, date: "2026-08-14", title: "Best-practice checks move to Compare against a baseline",
    items: [
      { kind: "improved", tool: "All tools", text: "🛡 Best-practice & bypass checks moves from 🔍 Analyse & simulate into 🧬 Compare against a baseline. It measures the tenant against a reference standard, which is exactly what that section is for; it sat with the simulators because that is where it was written, not because that is where somebody would look for it. No behaviour changes and no version bump — the tool is untouched, only its home." },
    ],
  },
  {
    build: 25088, date: "2026-08-14", title: "Item 38 reached production",
    items: [
      { kind: "improved", tool: "All tools", text: "Production is build 275: the shared sign-in window between 🚦 Sign-in failures and 🎚 Report-only impact, the actual sign-ins shown behind a would-deny verdict, and the six per-tool versions that had not moved for changes already shipped. The gap is 24 and 34 — both Help or tool work waiting on a beta-only tool, so neither can travel on its own." },
    ],
  },
  {
    build: 25087, date: "2026-08-14", title: "Report-only impact shows the sign-ins, not just the count",
    items: [
      { kind: "new", tool: "Report-only impact", text: "🚦 Sign-in failures shows a failed sign-in in full — which policies failed and on which controls, the failure reason and error code, the client and device. Report-only impact gave a count and a derived explanation, which is thinner than the record that produced it. A would-deny row now carries up to three of the ACTUAL sign-ins behind it, in the same shape: the controls the policy demanded, then the client, OS, location and device state. Capped at three deliberately — this is evidence for a reader, not a log, and keeping all of them would hold the window in memory twice over." },
      { kind: "improved", tool: "Report-only impact", text: "Where the sign-in ALSO failed for an enforced reason, the failure reason and error code appear as they do in Sign-in failures — “Device authentication is required. (50097)”. Where it did not, the row says so outright: the sign-in itself succeeded and this policy only recorded what it would have done. That absence is the whole meaning of report-only, and leaving it blank would read as missing data instead." },
    ],
  },
  {
    build: 25086, date: "2026-08-14", title: "One sign-in window, two tools — and the versions that were never bumped",
    items: [
      { kind: "fixed", tool: "Sign-in failures", text: "In report-only mode this tool and 🎚 Report-only impact issue the byte-for-byte SAME Graph read — the entire window, unfiltered, because report-only verdicts cannot be filtered server-side. Switching between them read it twice: on a real tenant, ten thousand records and minutes of waiting, twice, for one answer. Whichever runs second now reuses what the first read and says so, with the age of the data. ⟳ Rescan always re-reads the tenant, and the truncation flag travels with the records — a window that was cut short is a different fact from a complete one, and inheriting the rows without inheriting that would overstate what the second tool knows." },
      { kind: "improved", tool: "Sign-in failures", text: "Enforced-failure mode deliberately keeps its own read: it adds conditionalAccessStatus eq 'failure' server-side, so serving it from the shared window would mean filtering ten thousand records in the browser to answer a question Graph answers cheaply. Shared only where the query is identical." },
      { kind: "fixed", tool: "All tools", text: "Six tools changed today without their per-tool version moving — What-If, Report-only impact, Sign-in failures, Named locations, Conditional Access groups and Restricted AUs — so tiles carried the UPDATED chip while still showing the version they shipped with, which tells a reviewer nothing changed. That is the one thing the number exists to say. All six are bumped, and the rule now sits in capitals where the versions are edited: if a changelog entry names a tool, that tool's version moves, in the same commit." },
    ],
  },
  {
    build: 25085, date: "2026-08-14", title: "Items 35, 36 and 37 reached production",
    items: [
      { kind: "improved", tool: "All tools", text: "Production is build 274: the findable bulk scoped-admin grant (35), why Report-only impact would deny a user (36), and What-If naming its blockers while no longer counting report-only policies as blocking (37). Item 34 stayed behind on purpose — it is the Help section for 📐 CIS Benchmark, and that tool is beta-only; a Help entry for a tile nobody has would be a lie, so it travels with the tool. The gap is 24 and 34, both waiting on beta-only tools." },
    ],
  },
  {
    build: 25084, date: "2026-08-14", title: "The What-If report names the blocker too",
    items: [
      { kind: "improved", tool: "What-If", text: "The Markdown export said “access would be BLOCKED” and left the reader to find which of ten policies did it — the same fault the screen had, in the artefact that actually gets pasted into a ticket. It now names the blocking policies in the result line, marks them in the policy list, and states separately when a report-only policy would block once enforced (including the case where today's answer is that the sign-in succeeds)." },
    ],
  },
  {
    build: 25083, date: "2026-08-14", title: "Which policy would block this sign-in",
    items: [
      { kind: "fixed", tool: "What-If", text: "The verdict counted REPORT-ONLY policies as blocking. A report-only policy records what it would have done and changes nothing, so a scenario whose only Block policy was staged came back as “Access would be blocked” for a sign-in that in fact succeeds today — the opposite of the answer being asked for. The verdict now comes from the enforced policies alone, and a report-only block is reported separately as “would block once enforced”. Grant controls are split the same way: what you must satisfy comes from the enforced policies, with the report-only ones listed as what would additionally be required." },
      { kind: "improved", tool: "What-If", text: "“Access would be blocked” with ten applying policies left you to work out which one did it. The blockers are now named in the verdict and clickable straight through to the policy, and marked in the list below — ⛔ this is the block, or “would block once enforced” for a staged one. The verdict states its cause rather than making the reader hunt for it." },
    ],
  },
  {
    build: 25082, date: "2026-08-14", title: "Why the policy would say no",
    items: [
      { kind: "new", tool: "Report-only impact", text: "A user's “why” explained why the policy was IN SCOPE — member of an included group, no exclude caught them — which is not the question a go-live turns on. A row reading “59 would be denied” under a policy called Windows-Compliant leaves you guessing that the device was not compliant. It now says so: “needs a compliant device — device NOT compliant, Azure AD joined, Windows”. The facts were in the sign-in record; the tool was reading only the applied-policy verdict." },
      { kind: "improved", tool: "Report-only impact", text: "Written as evidence, not as a diagnosis, because Graph returns no per-control verdict — it gives what the policy enforced and what the sign-in carried, and the honest form is to state both. A device with NO compliance state on the record is reported as unregistered rather than as non-compliant: a different problem with a different fix, and guessing between them would be the tool inventing a cause. An MFA control that the sign-in did satisfy says another control in the same policy is the one that failed, rather than contradicting the record." },
      { kind: "improved", tool: "Report-only impact", text: "Only a denial gets an explanation. An interruption was satisfied by doing the extra step, so describing it as a refusal would be wrong — and a Block policy is reported as blocking outright rather than as “needing” something, since nothing the user does would help." },
    ],
  },
  {
    build: 25081, date: "2026-08-13", title: "The bulk grant was there and nobody could find it",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "R07 shipped in build 25068 and was effectively invisible: its entry point was one line of small print at the FOOT of the baseline checklist, below eleven rows of units. It rendered, it worked, and it was in a place nobody scrolls to — which for a feature is the same as not shipping it. It is now its own panel with a heading, above the unit cards, and there is a 👤 Scoped admins across units button in the toolbar next to ⟳ Refresh and ＋ New restricted AU, where actions live." },
      { kind: "fixed", tool: "Restricted AUs", text: "The panel no longer hangs off the baseline checklist at all, so it exists on a tenant whose units are not the baseline's — before this, no baseline meant no bulk grant, for no reason anybody chose. It hides itself when there is only one restricted unit, since a grid over one row is a form with extra steps." },
      { kind: "improved", tool: "Restricted AUs", text: "The closed panel counts the units it has read that have NOBODY scoped to them — the state where a unit's members cannot be changed by anyone — because that is the reason to open it." },
      { kind: "fixed", tool: "Restricted AUs", text: "The new toolbar button first did nothing: the toolbar sits outside the panel body whose click handler I attached it to. Third time that shape of mistake has appeared in this tool; it is wired directly now, through the same code path rather than a copy." },
    ],
  },
  {
    build: 25080, date: "2026-08-13", title: "A release stamp you can trust",
    items: [
      { kind: "new", tool: "All tools", text: "The sign-in screen shows the version AND the time the build was cut, in UTC. The date alone cannot separate two releases on the same day, which is precisely when somebody needs to know whether what they pushed is live — that is a question about minutes. UTC on purpose: a shared answer beats a local one when the person asking and the person who pushed are in different places." },
      { kind: "improved", tool: "All tools", text: "Items 6, 32 and 33 reached production as build 273 — your own single-tenant app registration, the 1.0 tool versions, and the Help sections for the four production tools that had none. 📐 CIS Benchmark's Help section stays here as item 34: the tool is beta-only, and a Help entry for a tile nobody has would be a lie." },
    ],
  },
  {
    build: 25079, date: "2026-08-13", title: "The five tools with no Help section",
    items: [
      { kind: "fixed", tool: "All tools", text: "🎫 Authentication contexts, 💪 Authentication strengths, 📜 Terms of use, ♻ Recycle bin and 📐 CIS Benchmark had no Help section at all — and since the Help contents list is built from those headings, they were absent from Help entirely rather than merely thin. Every tile now has one. The check added in build 25077 compares the tool tiles against the Help headings, which is how these were found; before that, a tool could ship, graduate out of BETA and never acquire documentation with nothing to notice." },
      { kind: "improved", tool: "Authentication contexts", text: "The new section leads with the thing that bites: the id is the contract. c1 is what applications request and what the ACRS claim carries, so a context can be renamed freely and never renumbered — and delete follows Graph's own rules, which are stated before you try rather than arriving as a raw 403 or 400." },
      { kind: "improved", tool: "Authentication strengths", text: "Documents that a strength is classified by its WEAKEST combination — it is only as strong as the easiest way to satisfy it, which is the number worth reading rather than the name somebody gave it — and that changing the combinations is its own Graph action rather than part of an edit." },
      { kind: "improved", tool: "Recycle bin", text: "States the one thing that matters on a restore: a policy comes back IN THE STATE IT WAS DELETED IN. One that was On enforces again the moment it is restored — not after a review — which is why that restore demands a typed confirmation and shows the stored state first. Restoring a trusted named location is called out too: every policy using All trusted locations follows it again immediately, so the blast radius is wider than the one object." },
      { kind: "improved", tool: "CIS Benchmark", text: "Documents the four outcomes rather than pass/fail — a policy that meets every criterion while Off has done the work but cannot be scored as a pass, because the benchmark's audit requires it enabled — and what the tool cannot judge: the benchmark also asks that exclusions are documented and reviewed annually, which is manual and is carried as such rather than assumed." },
    ],
  },
  {
    build: 25078, date: "2026-08-13", title: "A tool in production is at least 1.0",
    items: [
      { kind: "improved", tool: "All tools", text: "🛡 Restricted AUs (0.8), 📉 Drift watch (0.3), 💪 Authentication strengths (0.2) and 📜 Terms of use (0.2) were all shipping to customers while numbered as though they were experiments. Something a customer can open is not a 0.x thing, whatever it accumulated on the beta channel — and it is the BETA chip, not the version number, that says “still proving itself”. All four are 1.0. Only 📐 CIS Benchmark and 📖 Baseline guide stay below, because those really are beta-channel-only, and the rule is now written where the versions are edited so the next graduation does not forget it." },
    ],
  },
  {
    build: 25077, date: "2026-08-13", title: "Report-only impact had no Help section",
    items: [
      { kind: "fixed", tool: "Report-only impact", text: "The tool has never had a Help section — it graduated out of BETA without one, and the Help contents list is built from those headings, so it was simply absent from Help. Added: per policy versus per user and why both exist, the new why-a-user-was-interrupted explanation, and the point that matters most about a forecast — a verdict is only as good as its window, and a policy with no evidence is called out rather than counted as safe, because “nobody was affected” and “nobody signed in” look identical in a summary and only one is a reason to go live. This is the second tool found missing its Help section in two days; the check now compares the tool tiles against the Help headings instead of trusting that a new tool arrived with one." },
    ],
  },
  {
    build: 25076, date: "2026-08-13", title: "Why that user would be interrupted",
    items: [
      { kind: "new", tool: "Report-only impact", text: "A policy named LowMediumUserRisk reporting “3 interrupted” invites exactly one question — low, or medium? — and the answer was in the sign-in records all along and being discarded. The drill-down now reads “user risk low ×2, user risk medium ×1”, in both the per-user and the per-policy views. Counted per level rather than summarised, because two lows and one medium is a different go-live decision from three mediums." },
      { kind: "improved", tool: "Report-only impact", text: "User risk and sign-in risk are kept separate and labelled, since a policy can key off either and merging them into one number would be right about half the time. A tenant without Entra ID P2 gets “hidden” from Graph, and that is reported as hidden rather than quietly as no risk — the difference between “no risk was involved” and “you cannot see whether it was” is the whole value of the verdict. A sign-in that passed adds no explanation, because there is nothing to explain." },
    ],
  },
  {
    build: 25075, date: "2026-08-13", title: "Roadmap: search apps by name in What-If",
    items: [
      { kind: "improved", tool: "Roadmap", text: "Added R31 🧪 What-If — search the tenant's apps, not their GUIDs. “Other — enter an App ID” asks for a raw GUID, so answering it means leaving the tool, finding the enterprise application in the portal and copying the id back; and a mistyped GUID does not fail, it quietly describes a sign-in to an app nobody has — the same class of mistake as a wrong country code. The card records a type-ahead over the tenant's service principals, and the constraint that a pasted GUID must keep working: a policy can reference an application with no service principal here, which 📥 Import already has to handle, so an id ENCA cannot name is still legitimate and should be marked “not found in this tenant” rather than rejected." },
    ],
  },
  {
    build: 25074, date: "2026-08-13", title: "Roadmap: filter What-If's non-matches",
    items: [
      { kind: "improved", tool: "Roadmap", text: "Added R30 🧪 What-If — filter the policies that did not apply. A run against a real tenant answers with two policies that apply and 107 that do not, each with its reason: honest, and unreadable. The question behind that list is a persona question (why did none of the Admins policies apply to this admin) or a number question (what happened to CA103), so the card records filtering by persona and CA number using the same ranges 🗂 List Policies already groups by — one idea across the toolset rather than two. It also records a count per reason, since when an expected policy is missing the reason is what you are hunting for; the per-policy reasons stay either way, because a summary replacing them would answer a different question." },
    ],
  },
  {
    build: 25073, date: "2026-08-13", title: "Help had two of everything",
    items: [
      { kind: "fixed", tool: "All tools", text: "The Help page carried a SECOND copy of its own opening — heading, contents container and the List Policies section — giving the document two elements with id=\"screen-help\" and two with id=\"helpToc\", and List Policies twice in the contents. I introduced it in build 25070: a port copied a block out of the production file using an end marker that matched further down than intended, so the roadmap change dragged a slice of the Help page along with it. Removed, and the check now looks for duplicate element ids across the whole document rather than only for balanced tags — a duplicate id is valid-looking HTML that quietly breaks getElementById." },
      { kind: "fixed", tool: "All tools", text: "The 🚚 Waiting for production panel was putting two entries into the Help contents — its own title and “Staying on this channel”, the second of which is a subsection rather than a section. The contents list is of TOOLS; the queue is a beta-channel note about the gap between builds, and it is now excluded outright rather than depending on whether it happened to be injected before the list was built." },
    ],
  },
  {
    build: 25072, date: "2026-08-13", title: "Roadmap: scope Gap analyse to who you asked about",
    items: [
      { kind: "improved", tool: "Roadmap", text: "Added R29 🔍 Gap analyse — scan only who you asked about. It builds a users × policies matrix for every user it can read, which on any real tenant is a long read producing a wide answer when the question was narrow: is this contractor covered, what does the finance team bypass. The matrix is the right output; the scope is not. The card records the two things a scoped scan has to get right — a group must mean its MEMBERS including nested ones, or the answer is about a group rather than about people, and the report must state what was scoped as prominently as what it found, because a clean matrix over eleven users looks exactly like a clean matrix over the tenant and only one of those is reassuring." },
    ],
  },
  {
    build: 25071, date: "2026-08-13", title: "Roadmap: custom groups in the persona vaults",
    items: [
      { kind: "improved", tool: "Roadmap", text: "Added R28 🏷 Custom groups in the persona vaults. Everything that routes a group to a vault reads the CA number in its name, which works for the baseline and nothing else — a tenant's own exclusion group matches no persona, so ⑥ Protect skips it without a fallback chosen by hand, ＋ Bulk add never offers it, and break-glass had to be special-cased by name to work at all. Most tenants have groups that predate the baseline, and telling them their naming is wrong is not a feature. The card records a per-tenant mapping, kept with the tenant rather than in the code, and the two things it must not do: guess, and hide the unmapped." },
    ],
  },
  {
    build: 25070, date: "2026-08-13", title: "The roadmap retires what it delivered",
    items: [
      { kind: "new", tool: "Roadmap", text: "A SHIPPED BEFORE section at the foot of the page, outside the timeline. An item moves there on its own once it is more than 15 builds old, so “Now” stays what is actually current rather than everything ever delivered. Nothing is deleted — a roadmap that forgets what it delivered is only a wish list, and a retired reference still has to resolve for older notes about it to mean anything." },
      { kind: "improved", tool: "Roadmap", text: "The ageing is computed rather than maintained: each shipped card carries the build it went live in, and the page already knows which build it is running. Hand-moving them would make the roadmap only as current as the last time somebody remembered. The two channels count differently — production 271, beta 25070 — and the same file travels between them, so a card is aged only when its build and the running build are from the SAME series; otherwise it stays put, which is the honest answer to “I cannot tell”." },
    ],
  },
  {
    build: 25069, date: "2026-08-13", title: "The restricted-unit export names names",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "📄 Export MD printed whatever happened to be cached, so a document produced without opening every card was a list of unit names and GUIDs — the two facts that matter least about a vault. It now reads each unit's members and scoped administrators first, showing progress on the button, and one unreadable unit is recorded as unreadable rather than costing the whole document." },
      { kind: "improved", tool: "Restricted AUs", text: "Names lead and the object id is demoted to a footnote — it is real information for a support case and the least interesting fact in a review. The two failure states are now stated outright rather than left as an absence: a unit with no members says it shields nothing yet, and a unit with no scoped role says “nobody — its members cannot be changed by anyone”, which is the single most important sentence such a document can contain. A frozen member is marked as frozen with the reason." },
      { kind: "improved", tool: "Roadmap", text: "Added R27 📄 Documentation for the restricted units — the same treatment 📄 Create documentation gives the policies: what each unit protects, which policies depend on those groups, who is scoped to it, and the two questions an auditor actually asks — who could widen an exclusion, and what would happen if they did." },
    ],
  },
  {
    build: 25069, date: "2026-08-13", title: "The policy gap names the policies",
    items: [
      { kind: "fixed", tool: "Baseline guide", text: "When the readiness check says, for example, 93 of 99 catalog policies are present, the list underneath now names the six missing policies by their full CA number and policy name. It previously showed only per-persona totals, which still left the operator to find the actual gaps elsewhere." },
      { kind: "improved", tool: "Baseline guide", text: "Policy readiness now uses the same policy-by-policy CA-number and name-corroboration matcher as Baseline Policies. An unrelated numbered policy in the same persona can no longer fill the count, and a CA-number clash is named as a clash rather than treated as coverage." },
    ],
  },
  {
    build: 25068, date: "2026-08-13", title: "Grant scoped administrators across units",
    items: [
      { kind: "new", tool: "Restricted AUs", text: "R07 — 👤 Grant scoped administrators across units. Name the people once, tick the units once, and the grid is applied. A restricted unit with no scoped administrator is one whose members NOBODY can change, so these grants are not paperwork; and granted one person on one unit at a time, four people across eleven baseline units is 44 separate acts where the risk is not the tedium but the omission — miss one and that persona is unmanageable, which nothing announces. Units that currently have nobody scoped are flagged in the list for exactly that reason." },
      { kind: "improved", tool: "Restricted AUs", text: "Deliberately a grid rather than an “apply to all”: who may reach the Admins exclusions is not automatically who may reach the Externals ones, and a button that assumed otherwise would quietly undo the per-persona split the units exist to create. Every unit × administrator pair is its own outcome — a run where one unit refuses reports 2 of 4 rather than rounding to done, and names which unit and why." },
      { kind: "improved", tool: "Restricted AUs", text: "The directory role is activated once and each administrator resolved once, not once per grant: eleven units by four people is 44 grants but four lookups. Each unit's cached scoped-role list is dropped afterwards so the card cannot show a stale answer." },
    ],
  },
  {
    build: 25067, date: "2026-08-13", title: "The actions come to the group",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "R10 — click a group in ① Check and the overlay now lists what you can do with THAT group, each button carrying it across: ③ read its members, ④ assign it to policies, ⑥ protect it, ⑦ convert it, or ② create it if it does not exist. All of this was reachable before by opening the right tab and finding the row a second time — three steps of re-finding something already selected, with a tab strip that gave no clue which of the seven applied." },
      { kind: "improved", tool: "Conditional Access groups", text: "Only what makes sense is offered, which is most of the value: a group that does not exist yet cannot have its members read, a ROLE-ASSIGNABLE group is offered ⑦ Migrate rather than ⑥ Protect (a restricted unit would leave nobody able to edit it), and a group already in a vault is not offered protection a second time. A group that is both role-assignable and already in a unit is told it is frozen and that the unit must be left first — the order matters and getting it wrong is how the deadlock is entered rather than escaped." },
      { kind: "improved", tool: "Conditional Access groups", text: "⑤ Import members is offered as a destination but pre-selects nothing, because that step takes a whole CSV rather than one group. Promising a carry-over that cannot happen would be worse than not offering the button." },
    ],
  },
  {
    build: 25066, date: "2026-08-13", title: "Items 21 and 23 reached production",
    items: [
      { kind: "improved", tool: "All tools", text: "Production is now build 268: break-glass groups matched by local naming with the CA number winning over a name match (21), and flagged tiles sorting first in a collapsed section with the expanded choice scoped to the build (23). The gap is down to 6, 24, 25 and 26." },
    ],
  },
  {
    build: 25065, date: "2026-08-13", title: "Type the country, get the code",
    items: [
      { kind: "new", tool: "Named locations", text: "R08 — a country named location is built by typing the COUNTRY, not the code. The picker suggests from the ISO 3166-1 list and adds the match as a chip showing both the code and the name, because a wrong code is still a VALID code: the policy saves, looks right in the portal, and covers the wrong country until somebody is blocked or, worse, is not. Ireland is IE; IR is Iran. Austria is AT, Australia AU. Sweden is SE, Switzerland CH." },
      { kind: "improved", tool: "Named locations", text: "Pasting still works and is normalised in place — names, aliases and codes all become codes, so “NL, BE, Germany, UK, ie” becomes NL, BE, DE, GB, IE. Anything not recognised is NAMED and reported rather than dropped, including after the field has been rewritten: a code silently discarded is a country silently not covered, which is the same failure from the other direction. UK and EU are rejected outright — neither is an ISO 3166-1 code, and the United Kingdom is GB." },
      { kind: "improved", tool: "Named locations", text: "The 249 codes are not typed from memory, which would be exactly the mistake this prevents. They come from the ISO 3166-1 register and were then confirmed against the ICU database, which knows all 249 and 31 more — AC, AN, EU, UK, XK and the rest are exceptionally reserved, deprecated or user-assigned rather than officially assigned, and are deliberately absent." },
      { kind: "improved", tool: "All tools", text: "📖 Baseline guide and 📉 Drift watch move to 🗂 Explore & document. Both are read-only — one answers “what should be here and in what order”, the other “is it still what we signed off” — so neither belonged among the tools that write, where the guide in particular read as something that would go and do the deployment for you." },
      { kind: "fixed", tool: "Baseline guide", text: "R05 shipped without a Help section. Every other tool has one and the Help contents list is built from those headings, so the newest tool was the only one absent from Help entirely. Added: why the order is what it is, why Terms of use sits on its own (it has no Graph create API), and where the guide hands over to 🎚 Report-only impact." },
    ],
  },
  {
    build: 25063, date: "2026-08-13", title: "The baseline guide reads your tenant (R05)",
    items: [
      { kind: "new", tool: "Baseline guide", text: "📖 Baseline usage guide — roadmap item R05, beta-site only. The deployment knowledge that lived in whoever has done it before, written down as six steps that each carry the REASON they sit where they do: the persona model and its CA ranges first (read live from the catalog), groups and their restricted-AU vaults before the policies that make them worth attacking, named locations / authentication strengths / contexts before the policies that reference them by id, Terms of use before import — the one dependency with no create API — then policies imported Off on purpose, then Off → report-only → 🎚 forecast → enforced, Global last, break-glass excluded from every single one first. 🔎 Read the tenant turns each step into a readiness check that names what is missing BEFORE the step is run: n of m baseline groups and restricted units by name, the trusted-location flag, published contexts, agreements (Agreement.Read.All asked on the click; declined reads as “not read”, never as an empty tenant), per-persona coverage against the 99-policy catalog, and the Off / report-only / enforced tally. Every step links the tool that does the work. Reads only, Markdown readiness report, demo mode." },
    ],
  },
  {
    build: 25062, date: "2026-08-13", title: "An expanded section no longer outlives the release",
    items: [
      { kind: "fixed", tool: "All tools", text: "Manage the tenant opened expanded even on a fresh visit. Nothing was broken — the section was expanded because it had been expanded, once, and the choice was remembered forever. That was wrong in two ways. A release that adds or changes tools has changed what the section CONTAINS, so “show me all eleven”, decided against a different eleven, is no longer an answer to the question being asked; and an expanded section has no top, which silently defeats R09 putting what changed at the top of a collapsed one. The choice is now remembered within a build and reset by the next one." },
      { kind: "improved", tool: "All tools", text: "The old stored format was a bare list of section names. It is read once and discarded rather than migrated: it carries no build, so there is no honest way to decide whether it still applies, and one collapsed visit costs a single click." },
    ],
  },
  {
    build: 25061, date: "2026-08-13", title: "The queue lists changes, not descriptions of changes",
    items: [
      { kind: "fixed", tool: "All tools", text: "🚚 Waiting for production had grown five rows that were roadmap cards and one that was this table's own styling — documentation about the work rather than the work — and they buried the three rows anybody actually has to decide about. Roadmap cards, changelog entries and the queue itself are no longer listed at all: they describe changes rather than being them, and they travel with whatever promotion happens next, which is why a port copies the roadmap and Help along with the code. The gap is now 6, 21 and 23, which is what it always really was." },
    ],
  },
  {
    build: 25060, date: "2026-08-13", title: "The roadmap keeps what it delivered",
    items: [
      { kind: "fixed", tool: "Roadmap", text: "An item that shipped was being DELETED from the roadmap. It should move from “Next — being worked toward” into “Now”, keeping its reference: a roadmap that forgets what it delivered is only a wish list, and the reference is what lets an older note about R02 still resolve to something. 📉 Drift watch (R02), ⌨️ the command palette (R03) and flagged tiles first (R09) are restored into Now, each carrying the build it went live in. The rule is now stated in the roadmap intro so it is not left to whoever ships the next one." },
    ],
  },
  {
    build: 25059, date: "2026-08-13", title: "What changed comes first, and the queue shows only the gap",
    items: [
      { kind: "improved", tool: "All tools", text: "R09 — in a COLLAPSED home section the NEW / BETA / UPDATED tiles now sort to the front. They already claimed one of the four visible slots, but kept their position in page order, so a flagged tile sitting ninth was on screen and still read as an afterthought. Done with CSS order rather than by moving anything: nothing is reparented, expanding restores the authored order exactly, and the grid's grouping — which is meaningful — survives untouched." },
      { kind: "fixed", tool: "All tools", text: "🚚 Waiting for production listed 📉 Drift watch and ⌨️ the command palette under “staying on this channel”, describing them as having graduated. Something that has shipped is not a difference between the channels and belongs in neither list — it made a table whose entire job is “what is here and not there” read as a history. Removed, and the section now says outright that it is the gap and only the gap, with the “staying” list restricted to things that exist here and are deliberately not going." },
    ],
  },
  {
    build: 25058, date: "2026-08-13", title: "R02 and R03 went live",
    items: [
      { kind: "improved", tool: "All tools", text: "📉 Drift watch (R02) and the ⌨️ command palette (R03) are out of BETA and in production as build 267 — Drift watch taking the administrative-unit snapshot area with it. Their roadmap cards leave “Next”, and their references retire with them: R02 and R03 are not reused, so the remaining numbers keep their gaps rather than shuffling up. A reference that moved would make every older note about it wrong." },
    ],
  },
  {
    build: 25057, date: "2026-08-13", title: "Roadmap items have references now",
    items: [
      { kind: "improved", tool: "Roadmap", text: "Every roadmap item carries a reference — R01 to R26 — so one can be pointed at without quoting its title, the same way the promotion queue is worked by number. A reference belongs to its item permanently: it is never reused once the item ships, because a number that gets recycled makes every older note about it wrong. The numbers are deliberately NOT a priority order; the eras above them are what says when, and the intro says so rather than leaving it to be assumed from the sequence." },
    ],
  },
  {
    build: 25056, date: "2026-08-13", title: "Roadmap: somewhere to keep things, if you host it yourself",
    items: [
      { kind: "improved", tool: "Roadmap", text: "🐳 Self-hosting with Docker gains the reason it is worth more than a different URL. Nothing survives the tab closing today, by design — there is no server to keep it on, so a drift snapshot is a file you download and a report is a file you save. A self-hosted instance could offer an optional SQLite store holding snapshots, reports and per-tenant preferences, so a baseline signed off in March can be compared against in November without anyone having had to keep track of a JSON file. Written as opt-in and self-hosted only: the hosted site keeps storing nothing, because “nothing is kept anywhere” is worth more than the convenience — and tokens stay out of it either way, since they belong in the browser session and nowhere else." },
    ],
  },
  {
    build: 25055, date: "2026-08-13", title: "One queue number per change",
    items: [
      { kind: "fixed", tool: "All tools", text: "The promotion queue had three unrelated roadmap cards filed under a single number, which defeats the point of numbering them: “push 17” has to mean one decision, not three that happened to be written on the same day, and bundling them made it impossible to promote one without the others. Split into 17 (bulk grant scoped administrators), 19 (baseline usage guide) and 20 (self-hosting with Docker), with the break-glass naming work as 21. The rule is now written into the header of js/promote.js so the next entry cannot quietly repeat it: one item per change, and only work that must ship together shares a number." },
    ],
  },
  {
    build: 25054, date: "2026-08-13", title: "Break-glass groups by whatever they are called",
    items: [
      { kind: "improved", tool: "Restricted AUs", text: "＋ Bulk add on the break-glass unit now finds groups named the way tenants actually name them — Emergency_Access1, Emergency_Access2, EmergencyAccess, Break-Glass, BG-… — rather than only the baseline's own CAB-SEC-U-BreakGlass. Two changes were needed: the name rule matches on intent, and the group query looks under those prefixes too, since a group called Emergency_Access1 was not being READ at all, only unmatched. Anything holding the accounts that bypass every policy belongs in the same vault whatever it has been called." },
      { kind: "fixed", tool: "Protect exclusions", text: "The CA NUMBER now wins over a name match, in every tool that routes. CAB-SEC-U-CA101-EmergencyAccess is an Admins exclusion group that somebody filed deliberately, and a coincidence of wording should not send it to the break-glass vault — the break-glass and frontline name rules are the fallback for groups carrying no number at all. “Emergency Response Team” is still not offered: it is neither." },
      { kind: "improved", tool: "Restricted AUs", text: "Help now says plainly that bulk add offers GROUPS, and warns against adding the break-glass user accounts themselves — a Global Administrator inside a restricted unit cannot have their password reset by anybody, which is precisely what has to work during the incident those accounts exist for." },
    ],
  },
  {
    build: 25053, date: "2026-08-13", title: "Roadmap: a baseline guide, and self-hosting",
    items: [
      { kind: "improved", tool: "Roadmap", text: "Added 📖 Baseline usage guide. The toolset can build the baseline but cannot say what it IS or what order to do it in, so that knowledge lives in whoever has done it before — the least durable place to keep it. The card records an in-app guide that reads the tenant while it explains: what each persona covers and its CA range, the dependency order with the reason for each step rather than just the sequence, and a readiness check per step that says what is missing BEFORE you run it." },
      { kind: "improved", tool: "Roadmap", text: "Added 🐳 Self-hosting with Docker. ENCA is static files and a browser, so it is trivially self-hostable — and a tool that reads Conditional Access is exactly what an organisation will want served from its own infrastructure whatever the code does. A published nginx image plus a compose example, pairing with the single-tenant app registration already available. The card leads with the one step that cannot be automated: every host must be registered as a SPA redirect URI, which is the omission that produces the confusing sign-in error." },
    ],
  },
  {
    build: 25052, date: "2026-08-13", title: "Drift watch sees the vaults",
    items: [
      { kind: "new", tool: "Drift watch", text: "Administrative units are now a snapshot area. They live nowhere near the Conditional Access blade, but a restricted unit is what stops a tenant-wide Groups Administrator adding somebody to an exclusion group — so a group quietly leaving one widens the bypass surface exactly as much as editing the policy would, and until now nothing in the toolset would have noticed it happen. Members and scoped role grants are captured with the units; the read is a ladder, so a tenant that rejects the $expand still gets the units themselves, which is enough to catch the worst case of one being deleted." },
      { kind: "new", tool: "Drift watch", text: "Ranked to match what the change means rather than how big it looks. A MEMBER REMOVED from a restricted unit is Critical — from that moment any tenant-wide Groups Administrator can add themselves to that exclusion group. A SCOPED ADMINISTRATOR ADDED is High: somebody new can now edit the protected groups, and an over-scoped unit is the failure worth shouting about, where one that lost an administrator is a management problem. A unit DELETED is Critical. The isMemberManagementRestricted flag is immutable, so if it ever appears to have moved, the object is not the one you snapshotted — also Critical." },
      { kind: "improved", tool: "Drift watch", text: "The GUID→name map now includes the administrative units, so a change reads as “a member left CAB-SEC-RMAU-ADM-Exclusions” rather than as two GUIDs. AdministrativeUnit.Read.All is asked for on the click like every other on-demand scope; declining it never blocks the snapshot — the area is reported as not captured, which is the one thing this tool must never round to “no drift”." },
    ],
  },
  {
    build: 25051, date: "2026-08-13", title: "Restricted AUs is out of BETA",
    items: [
      { kind: "improved", tool: "Restricted AUs", text: "The BETA chip comes off the tile, the tool header, the Help heading and the baseline panel. It shipped to production in build 253 and has since gained the per-persona baseline, bulk add, frozen-group detection and routing that the rest of the toolset now depends on — a tool other tools rely on should not still be labelled provisional." },
      { kind: "fixed", tool: "Restricted AUs", text: "The beta tile also carried an “only here” chip claiming the tool runs on the beta channel and not in production. That stopped being true at build 253, twelve production releases ago; the chip was simply never removed. Only 📐 CIS Benchmark and 📉 Drift watch carry it now, and for both of them it is accurate." },
      { kind: "improved", tool: "Roadmap", text: "Restricted AUs moves out of “Next — being worked toward” and into “Now”, where it belongs." },
    ],
  },
  {
    build: 25050, date: "2026-08-13", title: "Roadmap: bulk grant scoped administrators",
    items: [
      { kind: "improved", tool: "Roadmap", text: "Added 👤 Bulk grant scoped administrators. Members can be bulk-added to a persona vault since build 25047, but the people who may manage them still cannot: a scoped role is granted one administrator, on one unit, at a time — four people across eleven units is 44 separate grants. The risk is not the tedium but the gap, because a restricted unit with no scoped administrator is one whose members NOBODY can change. The card also records that the tool should show current grants across all units together, since “who can manage the Externals exclusions?” currently means opening eleven cards." },
    ],
  },
  {
    build: 25049, date: "2026-08-13", title: "Three items reached production",
    items: [
      { kind: "improved", tool: "All tools", text: "Production is now build 265: the Import protection preflight and group placement (item 11), the roadmap card for country-name to ISO-code lookup (15), and the persona work — Factory workers at CA1200, the workload-identity vault, and ＋ Bulk add (16). Item 13's roadmap card went with them: it had been cleared from this queue back at build 261 without ever being ported, which is exactly what the header of js/promote.js warns about, so the roadmap was diffed against production rather than taken on the queue's word. Only item 6 is left waiting." },
    ],
  },
  {
    build: 25048, date: "2026-08-13", title: "Demo import placement read the wrong field",
    items: [
      { kind: "fixed", tool: "Import", text: "The simulated placement shown in demo mode still read a group's vault from info.persona, which build 25046 stopped setting when routing moved to the CA number in the group's own name — so every group in the demo report came back “no persona could be read”, describing a failure that a real run would not have. Reads info.code now. Only demo output was affected; a real import placed groups correctly throughout." },
    ],
  },
  {
    build: 25047, date: "2026-08-13", title: "Fill a persona vault in one go",
    items: [
      { kind: "new", tool: "Restricted AUs", text: "A baseline persona unit gains ＋ Bulk add — it finds this tenant's security groups whose CA number falls in that persona's range and adds the ticked ones in one run, matched by the same rule ⑥ Protect routes by so the two cannot disagree. Adding twenty groups one at a time through the type-ahead is the same decision twenty times, and the failure mode is not noticing you stopped at nineteen. A unit that is not one of the baseline personas offers nothing, because there would be no persona to gather." },
      { kind: "improved", tool: "Restricted AUs", text: "What CANNOT be added is listed as prominently as what can, each with its reason, because those rows need a different action rather than another attempt: a role-assignable group (it would be frozen — convert it with ⑦ Migrate first), a Microsoft 365, mail-enabled security or distribution group (only cloud security groups may be members of a restricted unit), one already in this unit, and one already in ANOTHER restricted unit — that last is not a duplicate but a widening, since a scoped administrator on any unit an object belongs to can manage it." },
      { kind: "fixed", tool: "Restricted AUs", text: "Added Rmau.codeForAu. Working out which persona an administrative unit belongs to was briefly attempted with the group-name rule, which reads a CA number — and an administrative unit's name has none, so every unit looked like “not a persona unit”. Caught before shipping: the panel appeared for nothing at all." },
    ],
  },
  {
    build: 25046, date: "2026-08-13", title: "Two personas the numbering knew about and the baseline did not",
    items: [
      { kind: "fixed", tool: "List Policies", text: "CA1200–CA1299 is the FACTORY WORKERS persona, but the persona table stopped at CA1100, so those policies grouped under a heading that read “CA1200+” — a range with no name, which is how a persona becomes invisible in a review. Named now, and the FW vault gains its CA range: it was matched only by group name before, so a CA1250 exclusion group routed nowhere." },
      { kind: "new", tool: "Restricted AUs", text: "CAB-SEC-RMAU-WLI-Exclusions joins the baseline for workload identities (CA900–CA999), which had no vault at all — eleven units now, still comfortable against the 100-unit tenant limit. It will often be empty and that is correct rather than a mistake: those policies target SERVICE PRINCIPALS, and a service principal cannot be a member of an administrative unit — only users, groups and devices can. The unit holds whatever exclusion GROUPS the range uses, which is worth separating because they gate the automation that runs with nobody behind it." },
      { kind: "improved", tool: "Import", text: "Import now decides a group's vault with the same single rule ⑥ Protect uses — the CA number in the group's own name — instead of inferring it from the personas of the policies that reference it. Inference could not answer for the break-glass group (every persona excludes it) and had no answer at all when the referencing policies were not part of the selection. Persona inference survives only as the fallback for a name carrying no CA number." },
      { kind: "fixed", tool: "Restricted AUs", text: "A scoped role member could show a raw GUID where the role name belongs. The id→name map is read once per session from /directoryRoles, which lists only ACTIVATED roles — so a role activated after that read, by this very tool granting an administrator on a unit created minutes earlier, was missing from it and the card printed the id. Unknown ids are now looked up individually; if even that fails the id is still shown, because a wrong name would be worse than an ugly one." },
    ],
  },
  {
    build: 25045, date: "2026-08-13", title: "Where a group actually lives, without hunting for it",
    items: [
      { kind: "fixed", tool: "Protect exclusions", text: "A baseline exclusion group that no policy currently references was not listed at all, so its protection state was unreachable — CAB-SEC-U-CA001-Exclusion could be sitting frozen inside the Global unit and nothing anywhere in the app would say so. The candidate list now also includes groups the baseline expects and that are named like exclusion groups, marked “not referenced”. They are never pre-selected and select-all skips them: they are there to be seen, not acted on by default." },
      { kind: "new", tool: "Conditional Access groups", text: "① Check gains a PROTECTION column — 🔒 the unit the group is in, “not in a unit”, or 🧊 frozen when it is role-assignable and restricted at once. Answering “where does this group live?” previously meant knowing to open ⑥ Protect and run a scan there, which is not a thing anyone should have to know." },
      { kind: "improved", tool: "Protect exclusions", text: "Administrative-unit membership is read in ONE call for the whole tenant ($expand=members on /administrativeUnits) instead of one call per candidate group. The old shape would have made the scan cost grow with the baseline now that unreferenced groups are included. A failed read shows “unknown” rather than “unprotected” — the reassuring answer is the one that must never be a guess — and it cannot cost you the group scan." },
      { kind: "fixed", tool: "Restricted AUs", text: "On an administrative-unit card the ✕ remove button dropped onto a line of its own as soon as a member carried two chips (group + frozen), reading as a stray button attached to nothing. It now sits at the right of its row whatever the chip count." },
    ],
  },
  {
    build: 25044, date: "2026-08-13", title: "The Protect search box actually searches",
    items: [
      { kind: "fixed", tool: "Protect exclusions", text: "The search box did nothing while you typed. Its handler was attached to the CHANGE event rather than INPUT, and a text field fires change only when it loses focus — so the list stayed exactly as it was, however much you typed, until you clicked elsewhere. The type-ahead suggestions worked throughout, which made it look alive while the list underneath ignored every keystroke. Also shipped to production as build 262." },
      { kind: "fixed", tool: "Protect exclusions", text: "The test meant to cover this set the search term in memory and re-rendered, so it exercised the filter but never the event that reaches it. It now types into the real field and dispatches a real input event — and fails against the previous build, which is the only way to know a regression test tests anything." },
    ],
  },
  {
    build: 25043, date: "2026-08-13", title: "Roadmap: type the country, get the code",
    items: [
      { kind: "improved", tool: "Roadmap", text: "Added 🌐 Type the country, get the code. A country named location takes two-letter ISO 3166-1 codes typed by hand, and a wrong code is still a VALID code — the policy saves, looks right, and covers the wrong country until somebody is blocked or, worse, is not. Ireland is IE; IR is Iran. The plan is a type-ahead over the full ISO list that matches on country name and fills the code in, rejecting anything that is not a real code at entry rather than after the fact." },
    ],
  },
  {
    build: 25042, date: "2026-08-13", title: "Two more items reached production",
    items: [
      { kind: "improved", tool: "All tools", text: "Production is now build 261. Item 14 (per-persona routing in ⑥ Protect, the search box, and frozen-group detection) and item 13 (the roadmap card) have shipped, so the queue is down to item 11 — the Import protection preflight — and item 6, your own single-tenant app registration. The per-channel release-note fix went out separately as build 260." },
    ],
  },
  {
    build: 25041, date: "2026-08-13", title: "Release notes stopped appearing in production",
    items: [
      { kind: "fixed", tool: "All tools", text: "The What's-new popup had gone permanently silent in production on any browser that had also opened the beta site. Both channels wrote the “last seen build” to one localStorage key while their build numbers come from two incompatible series — production counts 259, beta counts 25040 — so the check “have you already seen this?” compared 25040 against 259, decided yes, and returned. Not for one release: for every future one, because a production build number can never overtake a beta number. The marker is now per channel, and a value from the wrong series reads as “not seen”, so a browser already stuck heals itself on the next visit rather than needing its storage cleared. Beta additionally adopts the old value when it was a beta number, so nobody is shown a release note twice." },
    ],
  },
  {
    build: 25040, date: "2026-08-13", title: "Every exclusion group to its own vault",
    items: [
      { kind: "fixed", tool: "Protect exclusions", text: "⑥ Protect filed every selected group into ONE administrative unit chosen from a dropdown, which quietly undid the point of having a unit per persona. Protect CA001 and CA101 in the same run and the Admins exclusion group landed in the Global vault, handing the Global vault's scoped administrators control of policies they have nothing to do with. Each group is now routed by the CA number in its name — CA001 to GLO, CA101 to ADM, CA1001 to DevOps — and the destination is shown per row before anything is written. The four-digit numbers were checked: CA1001 resolves to DevOps, not to CA001." },
      { kind: "improved", tool: "Protect exclusions", text: "Nothing is filed by proximity. A group whose persona unit does not exist yet, or whose name carries no CA number the baseline recognises, is SKIPPED and named rather than placed in whichever unit was nearest — and the summary separates the two reasons, because they need different fixes. The fallback unit is now unset by default: it used to default to the first restricted unit in the list, which is Global on most tenants, so an unrecognised group could be filed into the Global vault by nothing more than list order." },
      { kind: "improved", tool: "Protect exclusions", text: "Scoped administrators are granted on EVERY unit the run wrote to rather than one of them — with the groups now spread across several persona units, an administrator scoped to only the first would be unable to manage most of what they had just been named for. Each grant is a separate line in the log and the report. The change report gains a per-unit breakdown and an administrative-unit column." },
      { kind: "new", tool: "Protect exclusions", text: "A search box above the list, with type-ahead over the group names. It narrows what the scan already found — no directory lookup — and select-all now applies to what is visible rather than to the whole list hiding behind the filter." },
      { kind: "new", tool: "Restricted AUs", text: "🧊 FROZEN groups are now detected. A group that is role-assignable AND sits in a restricted unit can have its members changed by nobody: only Global Administrator and Privileged Role Administrator may edit a role-assignable group's membership, and a restricted unit blocks exactly those two. ENCA has refused to create that state since build 254, but it can be inherited from a tenant configured earlier or from the portal — and nothing looked at what was already inside a unit. The administrative-unit member read now asks for isAssignableToRole (it never did, which is the only reason this was invisible), and the deadlock is called out on the AU card, in ⑥ Protect's protection column, and on the ⑦ Check row. Both flags are immutable, so the way out is to remove the group from the unit — which restores Global / Privileged Role Administrator — and then convert it with ⑦ Migrate." },
    ],
  },
  {
    build: 25039, date: "2026-08-13", title: "Roadmap: flagged tiles first",
    items: [
      { kind: "improved", tool: "Roadmap", text: "Added 🔝 Flagged tiles first in a collapsed section. Today a flagged tile claims one of the four visible slots but keeps its position in page order, so it can be on screen and still read as an afterthought — and a section with five flagged tools loses one below the fold. The plan is to lift them to the top of the collapsed view, newest first, and restore normal order on expand." },
    ],
  },
  {
    build: 25038, date: "2026-08-13", title: "Break-glass gets a vault of its own",
    items: [
      { kind: "new", tool: "Restricted AUs", text: "A tenth unit joins the baseline: CAB-SEC-RMAU-BreakGlass. CAB-SEC-U-BreakGlass is excluded from very nearly every policy in the baseline, so it belongs to no single persona — and that is precisely the argument for giving it its own unit rather than filing it under Global. Whoever can edit that group can walk through every policy at once, so it deserves a shorter list of scoped administrators than anything else. The name deliberately carries no -Exclusions suffix, because the unit holds the emergency access group itself rather than a persona's exclusions." },
      { kind: "improved", tool: "Import", text: "The break-glass group is now placed by NAME rather than by inferring a persona from the policies that reference it. Inference could only ever call it ambiguous — correctly, since every persona excludes it — which meant the one group most worth protecting was the one guaranteed to be left unplaced. The preflight also offers the break-glass unit whenever the backup contains that group, even though no policy name mentions a break-glass persona." },
      { kind: "improved", tool: "Restricted AUs", text: "Help now warns against adding the break-glass USER ACCOUNTS to a restricted unit. A Global Administrator inside one cannot have their password reset by anybody, because no role that can reset a Global Administrator's password can be assigned at administrative-unit scope — recovery means removing the account from the unit first, which is the opposite of what you want during an incident. Protect the group's membership; leave the accounts out." },
    ],
  },
  {
    build: 25037, date: "2026-08-13", title: "Three more items reached production",
    items: [
      { kind: "improved", tool: "All tools", text: "Production is now build 258. Items 8 (pickers above their lists on an administrative unit card) and 10 (one restricted administrative unit per persona, with the derived-check fix from build 25036) have shipped, and item 9 turned out to have gone to production back in build 256 without the queue being told — the exact failure this list warns about in its own header, so the numbers were reconciled against what main actually contains rather than against what the queue claimed. Item 11 (the Import protection preflight) now stands alone, since its dependency is live." },
    ],
  },
  {
    build: 25036, date: "2026-08-13", title: "The baseline check no longer offers to create what is already there",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "After creating the nine units the panel could still read “0 present · 9 missing” and offer to create them again, while the cards immediately below it showed all nine sitting in the tenant. The check was computed once and cached on the panel's state, so ⟳ Refresh — and any other re-render — updated the list of units without updating the verdict about them. The check is now derived on every render from the units currently loaded, so the panel and the cards can no longer disagree." },
      { kind: "improved", tool: "Restricted AUs", text: "Units created in this session are held as present even if a subsequent read does not show them yet. Directory writes are not read-your-writes consistent, so a re-read seconds after a create can legitimately come back without them — and a panel that offers to create what it has just created is worse than one running a few seconds behind the tenant. Ticks you made are kept across the refresh, minus anything that is no longer missing." },
    ],
  },
  {
    build: 25035, date: "2026-08-13", title: "Import checks the vaults before it fills them",
    items: [
      { kind: "new", tool: "Import", text: "A protection preflight sits above the policy list. It checks that a restricted administrative unit exists for each persona your selection actually touches — usually two or three, not all nine — and offers to create the missing ones, restricted, with you scoped as Groups Administrator. Creating them is a separate click from Import on purpose: creating administrative units and granting yourself a role is a different kind of act from restoring policies and should not ride along inside a button labelled Import. It never blocks the import either — skip it and everything still lands, just unprotected, and the report names each group." },
      { kind: "new", tool: "Import", text: "Every group the import CREATES is added to its persona's restricted unit, so a tenant-wide Groups Administrator cannot afterwards widen a Conditional Access exclusion. A group that already existed is left alone — it may be where it is on purpose, and that is not the import's decision. A group used by TWO personas is not placed either: an object can sit in several restricted units and a scoped administrator on any one of them can manage it, so filing a shared group under one persona would hand that persona's administrator control of the other's exclusions, and filing it under both would hand it to either. The report names every unplaced group and says which of the two reasons applies." },
      { kind: "fixed", tool: "Import", text: "The import report claimed every group it created was “(assigned, role-assignable)”. That stopped being true in build 254, when the baseline moved off role-assignable groups — a role-assignable group's members can only be changed by Global Administrator or Privileged Role Administrator, neither of which can be assigned at administrative-unit scope, so such a group inside a restricted unit has nobody who can edit it. The groups were already being created correctly; only the report was wrong, and it is the sort of line that gets quoted into a design document." },
      { kind: "improved", tool: "Import", text: "A failed placement is reported, never swallowed: the group exists and the policies will use it either way, so nothing about the tenant would reveal the gap. Each one is listed as “the group exists and is in use, but is not protected”. If the administrative units cannot be read at all, the panel says it could not check rather than reporting everything present." },
    ],
  },
  {
    build: 25034, date: "2026-08-13", title: "Help catches up with the baseline panel",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "The Help section still described the tool as it was before build 25033 — it said nothing about the persona baseline check, so the first thing the tool now shows was the one thing the documentation did not mention. Help now covers why there is one unit per persona rather than one shared vault, that creating a unit also grants you Groups Administrator scoped to it and why that second half is not optional, and what to do about a name already taken by a non-restricted unit. The permissions footnote also notes that directory writes are not read-your-writes consistent, so a unit that has just been created may lag the list below it." },
    ],
  },
  {
    build: 25033, date: "2026-08-13", title: "One restricted administrative unit per persona",
    items: [
      { kind: "new", tool: "Restricted AUs", text: "The tool now opens with a BASELINE panel that checks the tenant for the nine administrative units the baseline expects — CAB-SEC-RMAU-GLO / ADM / INT / EXT / GUESTUSERS / GUESTAdmins / SA / DevOps / FW-Exclusions — and offers to create the missing ones. One unit per persona is the point: a scoped administrator for the Admins exclusions should not be able to touch the Externals exclusions, and a single shared unit gives exactly that. Each unit is created with isMemberManagementRestricted, and the account running it is granted Groups Administrator scoped to the unit in the same step — an administrative unit with no scoped administrator is a vault nobody can open, because the restricted flag is precisely what blocks the tenant-wide roles. Select all, tick individually, or produce a Markdown report of the current state." },
      { kind: "new", tool: "Restricted AUs", text: "A name clash is called out rather than silently skipped. If an administrative unit already exists under an expected name but WITHOUT the restricted flag, it is shown as “name taken — not restricted” and is not offered for creation: the flag is set at creation and is immutable, so that unit cannot be upgraded. The fix is to rename it and create a restricted replacement, or to adopt a different name for the persona — and the report says so in as many words." },
      { kind: "improved", tool: "Restricted AUs", text: "The creation log survives the re-read that follows it. Each unit reports its two outcomes separately — created, and scoped administrator granted — because a unit that exists but has no administrator is a real half-outcome, not a failure, and it is the case most worth reading. Directory writes are not read-your-writes consistent, so the summary is carried over from what actually happened rather than inferred from the list that is re-fetched afterwards." },
    ],
  },
  {
    build: 25032, date: "2026-08-12", title: "Sections collapse again",
    items: [
      { kind: "fixed", tool: "All tools", text: "Manage the tenant and Analyse & simulate started EXPANDED. Cause: flagged tiles (NEW / BETA / UPDATED) were exempt from the collapse and sat on top of the four-tile budget rather than inside it — and with six flagged tools in one section that meant ten of eleven tiles showing, which is the opposite of collapsing. Flagged tiles now claim the four slots FIRST, in page order, but do not add to them, so both sections start collapsed as intended. Anything flagged that still does not fit is counted on the button — “Show 7 more · 2 new or beta” — so it is announced rather than silently buried. Tile order never changes; only visibility does." },
    ],
  },
  {
    build: 25031, date: "2026-08-12", title: "The picker comes before the list",
    items: [
      { kind: "improved", tool: "Restricted AUs", text: "On an administrative-unit card, the add-member box and the grant-a-scoped-administrator row now sit ABOVE their lists instead of below them. A protected AU can hold dozens of groups, and with the list first the input you opened the card to use was pushed off the bottom — you scrolled past everything to reach the one control that does something. Both sections read heading → picker → list now, and the empty scoped-role message says “grant one above” to match." },
    ],
  },
  {
    build: 25030, date: "2026-08-12", title: "Six items reached production",
    items: [
      { kind: "improved", tool: "All tools", text: "Production is now v1.0.254. Items 1, 2, 3, 4, 5 and 7 have been re-landed there and are removed from 🚚 Waiting for production: no longer creating role-assignable groups, ⑥ Protect refusing them (with select-all and ⟳ Re-check), the ⑦ Migrate wizard, the new ② Create model with an optional restricted AU, the ③ Members add bar, and the two roadmap cards. What remains on this channel: item 6, your own single-tenant app registration — plus the CIS Benchmark and this queue itself, both beta-only by design and now listed as such rather than left to look forgotten." },
    ],
  },
  {
    build: 25029, date: "2026-08-12", title: "Re-check protection without starting over",
    items: [
      { kind: "improved", tool: "Protect exclusions", text: "\u27f3 Re-check protection sits next to the Protect button. The protection column is a point-in-time read \u2014 somebody may have protected a group from the portal, \u2466 Migrate may have replaced one, or an earlier run may have half-succeeded \u2014 and until now the only way to refresh it was to leave the tab and rescan, losing the selection you had built. It re-reads each candidate\u2019s administrative-unit membership and the list of restricted AUs (one may have been created since), keeps your selection, and drops any group that is protected now, whose checkbox goes disabled in the same pass. A group whose re-read fails keeps its previous answer rather than being reported as unprotected." },
    ],
  },
  {
    build: 25028, date: "2026-08-12", title: "Picking a suggestion sticks",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "Choosing a name from the scoped-administrator suggestions filled the field and then immediately reopened the dropdown over it, so the choice looked as though it had not taken. Cause: selecting from a <datalist> fires the same input event as typing does, so the pick re-ran the directory query, rewrote the options, and the browser reopened the list. A query is now skipped when the field exactly matches an option already offered \u2014 which means the value came from the list rather than the keyboard. Typing something new still searches, so nothing is lost." },
      { kind: "fixed", tool: "Conditional Access groups", text: "The same fix on the \u2462 Members \u002b Add bar (user and group) and on the Restricted AUs add-member box \u2014 all four type-ahead fields in the tool behaved this way, so all four are guarded rather than only the one that was reported." },
    ],
  },
  {
    build: 25027, date: "2026-08-12", title: "A list of what is waiting for production",
    items: [
      { kind: "new", tool: "All tools", text: "Help gains 🚚 Waiting for production, visible ONLY on the beta channel — the same non-production host test the BETA ribbon uses, so nobody on enca.limon-it.nl sees a list of things they do not have. It shows both build numbers and every promotable change as a NUMBERED row with what it is, why it matters, the beta builds it spans, the files it touches, and a risk rating: high means a real problem in production until it lands, medium a missing capability with nothing broken, low convenience or documentation. The numbers are stable and hand-assigned so a change can be named out loud — \u201cpush number 3 to main\u201d. A second list records what is deliberately NOT promoted (today the CIS Benchmark) so the absence reads as a decision rather than an oversight. It is hand-maintained in js/promote.js, because the app is static files in a browser and cannot read git or diff two branches \u2014 the section says so itself, and tells you to trust the changelog and the build numbers over the table if they ever disagree." },
    ],
  },
  {
    build: 25026, date: "2026-08-12", title: "Stop creating role-assignable groups",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "The baseline no longer creates role-assignable groups. The default changed at the source: Assign.createGroup used to make every ASSIGNED group role-assignable unless told otherwise, which is why the whole estate ended up that way \u2014 it now creates an ordinary security group, and only an explicit roleAssignable:true still asks for one. The \u2461 Create builder drops the checkbox and gains a PROTECTION section instead: assigned or dynamic, with an optional placement in a restricted management administrative unit (existing one, or create the default). The order trap is stated rather than discovered \u2014 once a group is in the AU only an AU-scoped role can add members, so for an assigned group you add members first and protect afterwards, while a dynamic group fills itself from its rule and is safe to protect at creation." },
      { kind: "improved", tool: "Conditional Access groups", text: "\u21bb Recreate role-assignable is removed, and its modal with it rather than left dead in the file where it would be one wire away from creating them again. The \u2460 Check drift flag is INVERTED: a plain assigned group used to be reported as drift for not being role-assignable, which is now backwards \u2014 a role-assignable group is the one with somewhere to go, and its row carries a button into \u2466 Migrate. MS Learn\u2019s create-the-missing-group fix also stops asking for role-assignable." },
      { kind: "improved", tool: "All tools", text: "New on the roadmap: \ud83e\uddf9 Retire role-assignable groups everywhere, marked started \u2014 with what is done and what is not. Still carrying the old shape: the bundled group templates and the baseline catalog, the MS Learn and CIS checks, Group Analyzer and the documentation exports, and the persona import path, which should create protected groups directly instead of leaving protection as a later step. Production keeps creating role-assignable groups until this reaches it." },
    ],
  },
  {
    build: 25025, date: "2026-08-12", title: "Roadmap: group actions where you are already looking",
    items: [
      { kind: "improved", tool: "All tools", text: "New on the roadmap: \ud83c\udf9b Group actions where you are already looking. Clicking a group in \u2460 Check opens a card that only READS \u2014 object id, type, the policies that include or exclude it, its members. Everything you might then want to DO lives on a different numbered tab, so you close the card, find the right step, and hunt for the group again. List Policies already solves this: every policy card carries its own Documentation, Backup, Assign and Policy-state buttons. The plan is the same treatment for a group \u2014 create (\u2461), members (\u2462), assign (\u2463), import members (\u2464), protect (\u2465), migrate (\u2466), disable nesting, and open it in \ud83d\udd17 Group Analyzer \u2014 with each action offered only when it actually applies, so a role-assignable group is not offered \u2465 Protect and one already in a restricted AU is not offered it twice." },
    ],
  },
  {
    build: 25024, date: "2026-08-12", title: "The add bar fills in the obvious answer",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "\u2462 Members: when only one group\u2019s members are loaded, the add bar fills that group in \u2014 there is only one possible answer, so making you pick it was busywork \u2014 and the hint says so. With several groups loaded it keeps whatever you used last, but only if that group is still loaded; otherwise it clears the field rather than leaving a stale name behind, because guessing among several groups is how a member lands in the wrong exclusion." },
    ],
  },
  {
    build: 25023, date: "2026-08-12", title: "Select all in Protect, and honest wording about role-assignable groups",
    items: [
      { kind: "improved", tool: "Protect exclusions", text: "Select-all / deselect-all above the exclusion-group list. \u201cAll\u201d means all SELECTABLE: a role-assignable group or one already inside a restricted AU has a disabled checkbox, so they are neither counted nor toggled \u2014 an \u2018all\u2019 that includes rows you cannot tick is a lie, and the counter says how many cannot be added." },
      { kind: "fixed", tool: "Protect exclusions", text: "The list header still read \u201crole-assignable groups are already modifiable only by privileged roles\u201d, which implied adding them was merely unnecessary. It is not: a restricted AU blocks Global Administrator and Privileged Role Administrator, the only roles that can edit a role-assignable group\u2019s members, so a group carrying both protections has nobody who can change them. The header now says they cannot be added and points at \u2466 Migrate to convert them first." },
    ],
  },
  {
    build: 25022, date: "2026-08-12", title: "Add a member without leaving the matrix",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "\u2462 Members gains an \u002b Add bar. Type two letters and the directory suggests users by display name or UPN; the group side offers the groups whose members are already loaded, so the matrix can show the result immediately instead of asking you to re-read. The new member appears straight away and the group is then re-read to confirm it \u2014 directory writes are not read-your-writes consistent, so the optimistic row stands if the read has not caught up. Adding someone already in the group says so rather than failing, and an unknown group or an empty field is refused before any write." },
      { kind: "improved", tool: "Conditional Access groups", text: "\u2466 Migrate keeps the restricted-AU choice, the nesting toggle, the acknowledgement and the Migrate button pinned to the bottom of the panel while you scroll the group list. Picking the last of forty groups no longer means scrolling back down to find the button." },
    ],
  },
  {
    build: 25021, date: "2026-08-12", title: "Migrate asks before it scans, and looks like the rest of the tool",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "\u2466 Migrate scanned the moment you opened the tab, which is the wrong manners for the most expensive read in the tool \u2014 it checks every role-assignable group for directory-role assignments and restricted-AU membership, and counts each one\u2019s members. A \u25b6 Scan button now starts it, exactly like \u2465 Protect: a scan in flight survives navigating away, the result stays until an explicit rescan, and the gate says what will be read and that nothing is written." },
      { kind: "improved", tool: "Conditional Access groups", text: "The wizard is laid out like the rest of Conditional Access groups \u2014 .cg-panel sections with the same uppercase headings and the same scrolling pick list \u2014 instead of borrowing Drift watch\u2019s card styling, which made step \u2466 look like a different tool bolted on. A failed scan now offers \u25b6 Try again in the same panel style rather than a bare error line." },
    ],
  },
  {
    build: 25020, date: "2026-08-12", title: "Say how many members are about to move",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "\u2466 Migrate\u2019s step 3 read \u201cCopy the members across\u201d with no number, because the group scan does not load members \u2014 so the one figure worth checking before migrating a break-glass group was missing. The scan now counts them, and counts them the SAME WAY THE COPY READS THEM: direct members of every type, via /groups/{id}/members. The \u2462 Members tab deliberately counts something else (transitiveMembers of type user), and quoting that number here would have promised a total the copy does not move. The step also now says the archived group keeps its own copy \u2014 the migration copies rather than moves, which is exactly what makes the archived original a working rollback. Where the count cannot be read the step says so instead of silently omitting it." },
    ],
  },
  {
    build: 25019, date: "2026-08-12", title: "Migrate in stages if you want to",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "\u2466 Migrate gains a select-all / deselect-all control above the list, with a live \u201cN of M selected\u201d count that follows the individual checkboxes rather than drifting from them." },
      { kind: "improved", tool: "Conditional Access groups", text: "Placing the new groups in a restricted AU is now optional. Untick it and the migration converts the groups \u2014 recreated as plain, members carried, policies repointed \u2014 and stops there, so you can verify the membership before restricting who may manage it. The step list, the acknowledgement text and the Markdown report all follow the choice instead of promising something that will not happen, and the wizard is explicit that a converted-but-unplaced group is an ordinary group any tenant-wide Groups Administrator can edit. Finishing later needs nothing new: they are plain groups now, so \u2465 Protect picks them up like any other \u2014 the results screen carries a button straight to it." },
    ],
  },
  {
    build: 25018, date: "2026-08-12", title: "Migrate the baseline off role-assignable groups",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "\u2466 Migrate (BETA) moves the baseline from role-assignable groups to a restricted management administrative unit. Role-assignable was only ever used here for a side effect \u2014 membership reachable only by Global Administrator or Privileged Role Administrator \u2014 and a restricted AU does that better, because it lets you NAME who may manage the groups. It also sheds the role-assignable costs: the 500-per-tenant cap, no dynamic membership, no control over nesting. The two cannot be combined, which is what forces a migration rather than simply protecting in place. isAssignableToRole is immutable, so each group is RECREATED, and the order is the safety property: rename the current group aside as \u201c(migrated YYYY-MM-DD)\u201d, create a plain group under the original name with nesting disabled by default, COPY THE MEMBERS, add the new group to every policy, remove the old one, and only then place the new group in the restricted AU. Members move before the AU placement because afterwards only an AU-scoped role could add them; the new group joins each policy before the old one leaves, so no exclusion ever briefly disappears. Skipped with the reason shown: a group that holds a directory role (a plain group cannot carry one), one already inside a restricted AU, one missing from the tenant, one already plain \u2014 and one whose role check failed, which is skipped rather than risked. Typed acknowledgement, live per-group progress, Markdown report, and the archived originals keep their members as your rollback until you delete them from \ud83e\uddf9 Archived groups." },
      { kind: "improved", tool: "Conditional Access groups", text: "\ud83e\uddf9 Archived groups now also finds the \u201c(migrated \u2026)\u201d leftovers the new wizard creates, so the housekeeping that deletes them is the same one you already use for (legacy \u2026), (nesting \u2026) and -static-\u2026 archives." },
    ],
  },
  {
    build: 25017, date: "2026-08-12", title: "Two protections that cancel each other out",
    items: [
      { kind: "fixed", tool: "Protect exclusions", text: "The tool would let you put a ROLE-ASSIGNABLE group into a restricted management administrative unit. Do that and nobody can change its members again: a role-assignable group admits only Global Administrator or Privileged Role Administrator (owners aside), a restricted AU blocks exactly those two, and neither role can be assigned at AU scope. For a break-glass exclusion group, discovering that during an incident would be the worst possible moment. Such groups were already left unticked, but the reason given was wrong \u2014 \u201calready modifiable only by privileged roles; adding it is optional\u201d \u2014 and nothing stopped you ticking one. Now the checkbox is disabled, the row says plainly what would happen, and the write filters them out as well, because a selection can survive a rescan. It is recoverable if you already did it: Global Administrator and Privileged Role Administrator can still manage the AU itself, so remove the group from the restricted AU and its membership becomes editable again (allow up to 30 minutes for protections to lift)." },
      { kind: "improved", tool: "Conditional Access groups", text: "The \u2465 Protect help and the Restricted AUs help both state the mutual exclusion, and which to choose: for a CA exclusion group a restricted AU is usually the better of the two, because it lets you name who may manage the members instead of leaving it to whoever holds Privileged Role Administrator." },
    ],
  },
  {
    build: 25016, date: "2026-08-12", title: "Where to host your own copy",
    items: [
      { kind: "improved", tool: "All tools", text: "SINGLE-TENANT.md gains a \u201cWhere to host it\u201d section, because the obvious answer has a trap in it: a PRIVATE GitHub repository still gives you a PUBLIC website. Publishing Pages from a private repo needs Pro, Team or Enterprise Cloud, and restricting who may VIEW the site is Enterprise Cloud only \u2014 so on Pro or Team you get private source and a public site. The section says plainly what a public site does and does not expose: the client ID is not a secret (a SPA is a public client by design, which is why there is no client secret), no tenant data is ever written to the files, and with -RequireAssignment an unassigned visitor cannot get past sign-in anyway \u2014 but your OWN changes are visible, including the CA exclusion group names in js/groupTemplates.js, which is the reason to pick a gated host if that matters to you. Also the two things that bite on Pages: delete the upstream CNAME or your fork fights enca.limon-it.nl for the domain, and a project page serves from a subpath (https://org.github.io/enca/) which must be registered as the redirect URI exactly, trailing slash included \u2014 the app computes its own redirect URI from origin + pathname, so it asks for precisely that. A comparison table covers Azure Static Web Apps, Storage + Front Door and an internal server for anyone who needs the site itself private." },
    ],
  },
  {
    build: 25015, date: "2026-08-12", title: "Lock the app to yourself first, widen later",
    items: [
      { kind: "new", tool: "All tools", text: "New-EncaAppRegistration.ps1 gains -RequireAssignment. It sets \u201cAssignment required\u201d on the enterprise application (servicePrincipal.appRoleAssignmentRequired) and assigns the account running the script, so from that moment only you can open the tool \u2014 everyone else is refused at sign-in with AADSTS50105 until you widen it. Add others in the same run with -AssignTo, by UPN or group display name, or later from Entra ID > Enterprise applications > Users and groups. Order matters and the script enforces it: the requirement is switched on only AFTER at least one principal is successfully assigned, and you are always the first tried \u2014 flipping it first would seal the app shut with nobody able to open it, including the person who just created it. If nothing could be assigned it says so and leaves the requirement off. Documented in SINGLE-TENANT.md with the caveats that bite: Entra ignores NESTED groups for app assignment (direct membership only, and it fails silently), guests need assigning too, and this gates who may OPEN the tool rather than what they can do inside \u2014 an assigned Global Administrator is still a Global Administrator. It is a front door, not a permission model." },
    ],
  },
  {
    build: 25014, date: "2026-08-12", title: "Run ENCA on your own app registration",
    items: [
      { kind: "new", tool: "All tools", text: "\ud83c\udfe2 Your own single-tenant app registration is no longer a roadmap item — it is a supported route with a manual. ./New-EncaAppRegistration.ps1 -SingleTenant creates an AzureADMyOrg registration inside your tenant (SPA platform, PKCE, no secret, implicit grant off), points it at your own redirect URIs, and prints the client ID and authority to paste. Those go in a new js/authConfig.local.js, which the app merges over its defaults — so your tenant-specific values never touch a file upstream also edits, and pulling a later release stays a clean merge instead of a conflict on every version bump. SINGLE-TENANT.md is the walkthrough: prerequisites, five steps, how to verify it worked, the errors you will hit (AADSTS50011 is a redirect-URI mismatch, AADSTS700016 is the wrong client ID), and the part people skip — a pinned copy stops receiving fixes the moment you pin it, so the guide shows how to diff against upstream and read the What's-new entries in between. Readable inside the app from the roadmap card. The sign-in mechanism does not change; what changes is who owns the registration, and so who can review, audit and revoke it." },
      { kind: "improved", tool: "All tools", text: "A tool that is NEW, BETA or UPDATED is now exempt from the home-page collapse entirely, rather than merely counted on the \u25bc Show more button. Announcing a release and then hiding it behind a toggle was the opposite of a release. Flagged tools are shown on top of the four-tile budget, not out of it, so the everyday tools stay visible too, and the button counts only what is genuinely hidden (and disappears when nothing is). New \u2018UPDATED\u2019 chip for a tool that changed in the current release, alongside NEW and BETA \u2014 carried this cycle by List Policies, Conditional Access groups and Protect exclusions. The convention, including clearing UPDATED at the start of the next cycle, is written next to the tiles in index.html, because a stale flag quietly defeats the collapse." },
    ],
  },
  {
    build: 25013, date: "2026-08-12", title: "Where beta and production stand",
    items: [
      { kind: "improved", tool: "All tools", text: "PRODUCTION PARITY, as of production build 253. Everything on this channel has now been carried to enca.limon-it.nl except the CIS Benchmark. Landed in 253: 🛡 Restricted AUs and ⌨️ the command palette (both keeping their BETA tag), the ⑥ Protect 400 'conflicting object' fix, the missing CAB-SEC-U-CA1009-Exclusion group template, the representative demo group sample, the 🎯 CA result card in the per-policy What-If, and thirteen roadmap entries. Landed earlier, in 252: 📉 Drift watch (BETA) and the collapsed home-page sections; in 251: Report-only impact out of BETA and the NEW badge off Sign-in failures." },
      { kind: "improved", tool: "All tools", text: "STILL BETA-ONLY: 📐 CIS Benchmark (v0.5) — the tenant's CA policies scored against CIS Microsoft 365 Foundations Benchmark v7.0.0 section 5.2.2. It stays here until it has been run against enough real tenants to trust its verdicts in production. Everything else on this site also exists on production; where a tool differs, this channel is the newer one." },
      { kind: "improved", tool: "All tools", text: "HOW TO READ THIS: builds here are five digits (NNNII — 25013 renders as v1.0.250-beta.13), production builds are plain integers (253). The two series never collide, and each is monotone on its own site, so the What's-new overlay behaves the same on either. A change lands here first, then as its own production build — the two branches are not merged, so a feature exists twice in the history under two numbers." },
    ],
  },
  {
    build: 25012, date: "2026-08-12", title: "A removed member actually leaves the card",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "Removing a member (or a scoped role grant) left the row on the card. The tool was already discarding its cache and re-reading after the write — the problem is that Entra directory writes are not read-your-writes consistent: the DELETE returns 204 and the very next GET of the same collection still lists the object, so the honest re-read faithfully restored the row that had just been deleted. Changes now apply to the card immediately and are then confirmed against the directory with backoff (three tries over about four seconds). If the directory has not caught up by then the card keeps showing what you did rather than resurrecting a deleted row, and a second toast says the directory is still catching up. Adding a member has the same lag in the other direction and gets the same treatment, and both boxes clear once the entry is on the list." },
    ],
  },
  {
    build: 25011, date: "2026-08-12", title: "Granting a scoped administrator stops fighting the directory role",
    items: [
      { kind: "fixed", tool: "Restricted AUs", text: "Granting a scoped administrator could fail with 400 \"A conflicting object with one or more of the specified property values is present in the directory\". Cause: GET /directoryRoles only returns roles that are ACTIVATED in the tenant, so a role that exists but is not returned by the lookup looks absent — and the obvious next step, activating it, conflicts with the role that was there all along. Resolution is now a ladder: the documented alternate-key GET /directoryRoles(roleTemplateId='…'), then $filter, then activation, and if activation conflicts, an unfiltered list matched client-side (case-insensitively) that no declined filter can defeat. A conflict is read as evidence the role exists, not as a failure. A genuine 403 still surfaces, and if the role really is absent the message says so rather than silently grabbing the wrong role." },
      { kind: "fixed", tool: "Restricted AUs", text: "Granting someone who already holds that role on that administrative unit now says exactly that — \"already holds that role on this administrative unit, nothing to change\" — and refreshes the card, instead of relaying Graph's conflict wording as though something had broken." },
      { kind: "fixed", tool: "Protect exclusions", text: "The ⑥ Protect flow's scoped-administrator grant activated the Groups Administrator role the same fragile way and could fail identically. Both now share the one resilient resolver." },
    ],
  },
  {
    build: 25010, date: "2026-08-12", title: "The baseline reconciles; demo stops lying about it",
    items: [
      { kind: "fixed", tool: "Conditional Access groups", text: "The baseline catalog referenced CAB-SEC-U-CA1009-Exclusion — the exclusion for CA1009, which blocks non-DevOps personas from Azure DevOps — but no group template defined it. The Check tab therefore expected a group it could never offer to create, and the ✎ Create action had no template to build from. The template is added, and catalog and templates now reconcile exactly: every one of the 98 group names the baseline references has a template, and no template is orphaned." },
      { kind: "fixed", tool: "Conditional Access groups", text: "Demo mode showed the first 24 group templates in file order, which happened to be BreakGlass plus twenty-odd consecutive numbered exclusions — so the persona groups and the Emergency_Access pair never appeared, and demo mode read as though the baseline had forgotten them. It now shows a representative sample: every named group (personas, break-glass, Teams shared devices, deployment groups, Emergency_Access1 and 2) followed by one exclusion per persona band, so the numbering scheme is visible instead of twenty neighbours from the same range." },
      { kind: "fixed", tool: "Restricted AUs", text: "👤 Scoped admins did nothing when the card was already expanded — it re-opened an open card and scrolled to the button you had just pressed. It now lands on the grant box, focuses it and flashes it briefly, so it gives feedback whether the card was open or closed." },
    ],
  },
  {
    build: 25009, date: "2026-08-12", title: "The home page stops being a wall",
    items: [
      { kind: "improved", tool: "All tools", text: "Each section on the home page now shows its first four tools, with the rest behind a ▼ Show N more toggle — Analyse & simulate had grown to ten tiles and Manage the tenant to eleven, which is a lot to scroll past to reach the section you wanted. Sections of four or fewer are untouched, so no button appears where there is nothing to hide. Your choice per section is remembered between visits. Two things kept honest: a tool that just shipped cannot vanish silently, so the button counts the hidden NEW and BETA tiles (\"Show 7 more · 4 new or beta\"), and hidden tiles stay fully reachable — the tab bar, the + menu, roadmap links and Ctrl+K all open them exactly as before, because collapsing the grid must not amputate navigation. Sections are keyed by their heading, not their position, so adding a section later does not re-collapse a different one." },
    ],
  },
  {
    build: 25008, date: "2026-08-12", title: "Drift watch says which side failed",
    items: [
      { kind: "fixed", tool: "Drift watch", text: "A snapshot taken before build 25005 recorded Authentication strengths as unreadable (the $expand 400 fixed in that build), and every later comparison against that file kept reporting it — in red, as though the tenant were refusing the read right now. The area now says which side failed. A snapshot that lacks an area is marked 'stale snapshot' in muted type and tells you the fix: take a fresh snapshot and it is covered from then on. A failure in the current run stays red, because that one is real. When both sides failed, both reasons are given — before, only the snapshot's was, which hid a live problem behind an old one. The summary line makes the same split instead of counting them together." },
    ],
  },
  {
    build: 25007, date: "2026-08-12", title: "Restricted AUs stop making you type from memory",
    items: [
      { kind: "improved", tool: "Restricted AUs", text: "Both boxes on an AU card now suggest. Add member is pre-seeded with your baseline group names before you type a character — those are the groups the administrative unit exists to protect, so the common case is now a pick rather than a recall — and folds in live directory results for any other group or user as you type. The scoped-administrator box suggests users from Entra by display name or UPN, the same type-ahead the Protect flow has always had. Restricted AUs also gains a help section covering the parts that surprise people: roles are not granted in the Edit dialog, the restricted flag is immutable, and a 403 on a member change is the shield working." },
      { kind: "new", tool: "All tools", text: "Roadmap: 🍴 Fork detection and update-from-upstream. A tenant that forks, reviews and pins its own copy — which the security document recommends for high-assurance environments — stops hearing about fixes the moment it does. The plan is for a forked deployment to notice it is one, say how many builds behind it is, show the What's-new entries between its pinned build and upstream, and give the commands to pull main in and re-review the diff. Deliberately not auto-updating: that would defeat the reason for forking." },
    ],
  },
  {
    build: 25006, date: "2026-08-12", title: "Ctrl+K, and two tools grow up",
    items: [
      { kind: "new", tool: "All tools", text: "⌨️ Command palette (BETA): Ctrl+K — ⌘+K on a Mac — anywhere in the app opens a search box. Type a few letters and Enter lands you in the tool; type a CA number or part of a policy name and it opens that policy card directly, without going through List Policies first. Matching takes initials as well as substrings, so 'gap' finds Gap analyse and 'bpbc' finds Best-practice & bypass checks. Arrows move, Enter opens, Esc or Ctrl+K closes, clicking outside closes. Tools are searchable before sign-in, and the footer says how many policies are searchable rather than promising some that are not loaded yet. Straight off the roadmap: past twenty-odd tools a tile grid stops being the fastest way in." },
      { kind: "improved", tool: "Restricted AUs", text: "Granting a scoped administrator was only reachable by clicking a card header — so people looked under ✎ Edit, which is a PATCH of the AU's own name and description and says nothing about roles. Each card now carries a 👤 Scoped admins button, with the current count, that opens the panel where roles are granted and revoked; the Edit dialog points at it instead of leaving the question hanging." },
      { kind: "improved", tool: "Report-only impact", text: "Out of BETA. The go-live forecast has held up: per-policy would-be-denied / interrupted / unchanged read from the sign-in log, per-user worst case, verdict chips including the staged policy with no traffic at all, 1-hour to 30-day windows and a Markdown export." },
      { kind: "improved", tool: "Sign-in failures", text: "The NEW badge is retired — it has been in production long enough that the label had stopped meaning anything." },
    ],
  },
  {
    build: 25005, date: "2026-08-12", title: "Drift watch: readable cards, and strengths that actually read",
    items: [
      { kind: "fixed", tool: "Drift watch", text: "The result cards had no padding — text sat flush against the card border and the longest lines ran into it. Cause: the shared .list-card sets overflow:hidden and deliberately leaves spacing to whatever it wraps, which for every other tool is a table carrying its own cell padding. Drift watch wraps plain prose, so it needed its own. Long Graph error text now wraps instead of widening the card." },
      { kind: "fixed", tool: "Drift watch", text: "Authentication strengths came back as 'not captured' in tenants that reject $expand: /policies/authenticationStrengthPolicies?$expand=combinationConfigurations returns 400 'Query option Expand is not allowed' in some directories. The read now falls back to the plain shape — the same retry the Authentication strengths tool has always had — so the area is captured instead of skipped. And if one snapshot used the rich shape while the other fell back, the area says so, because fields missing from one side are an artefact of the read, not drift anybody caused." },
    ],
  },
  {
    build: 25004, date: "2026-08-12", title: "Drift watch — does the tenant still look like we left it?",
    items: [
      { kind: "new", tool: "Drift watch", text: "New beta-only tool answering the question Change audit cannot: does the Conditional Access configuration still look like it did when we signed it off? Take a snapshot — policies, named locations, authentication strengths and authentication contexts, downloaded as one JSON file you keep — then load it back days, months or a year later and the tenant is re-read and compared object by object. No server, nothing uploaded, and no 30-day limit, because the history is your file rather than Microsoft's audit log (which keeps ~30 days on P1/P2 and 7 otherwise). Findings are ranked the way the risk actually runs: a policy switched Off or down to report-only, an exclusion widened, a named location turned trusted are Critical; a rename is Low. GUIDs resolve to group and location names, and fields that move on their own (modifiedDateTime) are ignored, so a policy nobody touched reads as unchanged instead of as noise. An area that failed to read is reported as 'not captured' — never as 'no drift', because a clean bill of health nobody verified is worse than no answer. Run 🕓 Change audit first and each drifted object also names who changed it, for changes still inside audit retention; older drift is shown without attribution rather than with a guess. Markdown report for the review file. The field-level diff engine is the audit tool's, reused rather than reimplemented, so a change reads the same in both places." },
      { kind: "improved", tool: "All tools", text: "The roadmap grew by twelve: 📉 Drift watch (in beta today), 🖥 Compliant-device reality check and ↩️ Undo for writes join Next; 🏢 Several tenants at once, 🌐 Named locations vs. the sign-in log, 🤝 Cross-tenant access settings, 🎫 CAE and token protection coverage and 📋 Change plan export join Later; 🚀 Go-live checklist, 📏 Naming-convention linter, 🇳🇱 Dutch interface and ⌨️ Command palette sit on the horizon. Two are worth calling out as blind spots rather than features: a grant control demanding a compliant device is only worth what Intune's compliance policies are worth, and nothing checks that half today; and trusted IP ranges routinely outlive the offices they describe. Build 25004 (v1.0.250-beta.4)." },
    ],
  },
  {
    build: 25003, date: "2026-08-12", onlyBrand: "pvm", title: "The house look follows the account",
    items: [
      { kind: "improved", tool: "All tools", text: "Signing in with an account on the demo audience's second UPN domain now applies its look automatically, exactly as the first domain already did — no need for the branded front door. (This entry is visible only on branded sessions; the audience's identifying details were scrubbed from this record in build 25200, after the demo retired.)" },
    ],
  },
  {
    build: 25002, date: "2026-08-12", title: "Bring your own app registration — on the map",
    items: [
      { kind: "improved", tool: "All tools", text: "The roadmap's Next era gains 🏢 Your own single-tenant app registration. Today every tenant consents to one multi-tenant application owned by Limon-IT; the plan is to let a tenant register ENCA as a single-tenant SPA (AzureADMyOrg) of its own — own client ID, own consent record, own redirect URIs, own audit trail — so no application outside the directory holds a delegated grant. The sign-in platform is unchanged either way (SPA, authorization code + PKCE, no client secret); what moves is ownership of the registration. Security & risk has recommended this for high-assurance tenants all along — the work is making it a supported path (a -SingleTenant switch on the registration script, a client ID read from configuration, and a guide to the trade-off) instead of a manual fork-and-edit. The card links straight into the security document. Build 25002 (v1.0.250-beta.2)." },
    ],
  },
  {
    build: 25001, date: "2026-08-11", title: "Baseline tenants say so",
    items: [
      { kind: "improved", tool: "All tools", text: "Signing in from a baseline tenant now shows a 🧪 badge next to the tenant name: this session has more options than a regular tenant — the Gap and MS Learn checks review the persona baseline including policies deployed Off, and MS Learn's Apply-fixes can write here. The behaviour existed; now it announces itself instead of being a hidden mode. (Production took 249 for its own change, so this cycle targets 250 — build 25001, v1.0.250-beta.1.)" },
    ],
  },
  {
    build: 24901, date: "2026-08-11", title: "Restricted AUs joins the roadmap",
    items: [
      { kind: "improved", tool: "All tools", text: "The roadmap's Next era now names 🛡 Restricted AUs alongside the CIS Benchmark — in beta today, clickable straight into the tool here (and to the beta site when read from production). Production took release 248 for its side of this change, so the beta cycle now targets 249 — this build is 24901 (v1.0.249-beta.1)." },
    ],
  },
  {
    build: 24801, date: "2026-08-11", title: "Restricted AUs: the vaults get a face",
    items: [
      { kind: "new", tool: "Restricted AUs", text: "New beta-only tool managing restricted management administrative units — the vaults the ⑥ Protect flow creates around CA exclusion groups. Every AU listed (restricted first, standard for context), each expandable to its members — group members carry badges showing which CA policies include or exclude them — and its scoped role grants. Add a member by group name or user UPN, remove one, grant or revoke a scoped administrator (Groups, User, Helpdesk or License Administrator), edit name and description, create new (the restricted flag is set at creation and immutable — the tool says so instead of letting you find out), delete with typed confirmation and the honest warning that members merely lose their shield. A 403 on member changes is explained for what it is: the protection working. Markdown export for the review file. Note the version: production overtook the old cycle number, so beta now targets release 248 — this build is 24801 (v1.0.248-beta.1)." },
      { kind: "improved", tool: "All tools", text: "The roadmap's 🔓 Revoke-permissions-when-done idea is marked partially done: the Permissions panel's How-to-revoke guide (three routes, ready-to-run PowerShell, honest consequences) shipped as the first step — the one-click version remains on the map, with the design constraint documented in the guide itself." },
    ],
  },
  {
    build: 23018, date: "2026-08-11", title: "The inline bar centres like everything else",
    items: [
      { kind: "fixed", tool: "All tools", text: "The inline progress bar (RMAU scan, CSV import, CA groups scan) hugged the left edge while the spinner and status text sat centred — it now centres with them." },
    ],
  },
  {
    build: 23017, date: "2026-08-11", title: "Gap analyse gets the full busy panel",
    items: [
      { kind: "improved", tool: "Gap analyse", text: "The matrix build showed only a status sentence with a small inline bar — easy to miss and visibly not the same component every other long read uses. It now shows the full shared busy panel in place of the results: spinner, wide brand-coloured bar driven by the counted phases (group expansion, role resolution), and the current phase with elapsed time. The one-line status next to the Run button stays for a glance." },
    ],
  },
  {
    build: 23016, date: "2026-08-11", title: "Assign groups works again",
    items: [
      { kind: "fixed", tool: "List Policies", text: "The Assign groups or roles wizard opened to an empty dialog — just Cancel and Next. Cause: a duplicate element id. The Authentication strengths tool (added in build 227) reused the wizard's asBody id for its own screen, and the browser hands back whichever comes first in the document — so the wizard had been writing its steps into a hidden screen ever since. The strengths screen's element is renamed and every step renders in the dialog again. Lesson absorbed: new tools get prefix-checked against existing ids." },
    ],
  },
  {
    build: 23015, date: "2026-08-11", title: "Roadmap mentions are doors",
    items: [
      { kind: "improved", tool: "All tools", text: "Tool names on the roadmap timeline are now clickable — 🎚 Report-only impact, 💪 Authentication strengths and 📋 What's new open the tool itself, and 📐 CIS Benchmark opens where it lives: the tool here on the beta site, the beta site itself when read from production." },
    ],
  },
  {
    build: 23014, date: "2026-08-11", title: "Consent, and the way back out",
    items: [
      { kind: "new", tool: "All tools", text: "The Permissions panel gains a 🔒 How to revoke button: an expandable guide to taking consent away again — self-service via myaccount.microsoft.com, the Enterprise-applications route for admins, and the surgical Graph PowerShell (with this deployment's real client ID, copy button included) that strips the write scopes while keeping the read base. With the consequences stated honestly: nothing breaks (tools simply re-prompt on the click, the same model that granted them), it is not instant (issued tokens live ~1 hour — pair with Revoke-MgUserSignInSession), an AllPrincipals grant re-prompts every user while a Principal grant hits one account, and the deletion lands in the audit log. Doing this from inside the app would need DelegatedPermissionGrant.ReadWrite.All — a bigger permission than the ones being cleaned up — which is exactly why it is a documented procedure here and a careful roadmap item, not a button that writes." },
    ],
  },
  {
    build: 23013, date: "2026-08-11", title: "Beta exclusives say so",
    items: [
      { kind: "improved", tool: "All tools", text: "Tools that run only on the beta site now carry an 'only here' chip on their home tile (today: 📐 CIS Benchmark) — and the production site grew a matching card pointing at the beta site, so on either channel it is visible which tools are beta-exclusive and where to find them." },
    ],
  },
  {
    build: 23012, date: "2026-08-11", title: "The roadmap becomes a timeline",
    items: [
      { kind: "improved", tool: "All tools", text: "The roadmap now reads as a timeline running from Now into the future: what shipped recently anchors the top, then Next (📐 CIS Benchmark alignment — in beta today, graduating once proven against enough real tenants — 🔐 improving security, 🔓 revoking permissions when done), Later (✏️ editable policies) and On the horizon (🏗 the policy builder, which builds on editing). The line literally fades toward the future, because that part is steered by what users ask for." },
    ],
  },
  {
    build: 23011, date: "2026-08-11", title: "The roadmap, in the open",
    items: [
      { kind: "new", tool: "All tools", text: "A 🗺 Roadmap card sits next to What's new and Help: where ENCA is heading, stated in the open — 🔐 implementing the security documentation's own hardening advice as defaults, ✏️ editing a policy's conditions and controls from its card with a field-level diff before the PATCH, 🏗 a guided policy builder that preflights in What-If and creates in report-only by default, and 🔓 one click to drop the consented write scopes when the work is done, so sessions end least-privileged. Order and scope follow real-tenant feedback." },
    ],
  },
  {
    build: 23010, date: "2026-08-11", title: "The security document reads like a document",
    items: [
      { kind: "fixed", tool: "All tools", text: "The in-app security documentation rendered every hard-wrapped source line as its own paragraph — huge gaps, broken bold, numbered lists as loose sentences — and used barely half the screen. Wrapped lines are now joined back into their paragraphs and list items before rendering, the Markdown viewer learned ordered lists, and the report viewer grew to use the whole canvas (up to 94% of the viewport, taller reading area) — which benefits every tool report, not just this document. And the dimmed backdrop behind every dialog was hardcoded to the neutral brand's deep green — on a branded tenant, opening any dialog tinted the page the wrong colour; it now derives from the active brand's own deep tone." },
    ],
  },
  {
    build: 23009, date: "2026-08-11", title: "Read the security story before you sign in",
    items: [
      { kind: "improved", tool: "All tools", text: "The security & risk documentation (SECURITY.md) is now one click away inside the app: a link on the sign-in screen — readable BEFORE trusting the tool with a session — and a 🔒 Security link in the footer of every signed-in screen. It fetches the document that deploys with the site and renders it in the report viewer, so what you read is exactly the revision you are running." },
    ],
  },
  {
    build: 23008, date: "2026-08-11", title: "The security story, written down",
    items: [
      { kind: "new", tool: "All tools", text: "SECURITY.md ships with the repository: how ENCA is built (static, no backend, nothing stored anywhere), the delegated-only permission model and why it cannot exceed the signed-in admin, what leaves the browser (Graph calls and anonymous counts — the complete list), the in-app hardening, and an honest reckoning of residual risks for tenants and for the operator — delegated-write blast radius, supply chain, extensions, lookalikes, local exports — each with its mitigation, plus recommendations for security teams (consent policies, PIM just-in-time, fork-review-pin) and a private vulnerability-reporting channel. Linked from the README's Security section." },
    ],
  },
  {
    build: 23007, date: "2026-08-11", title: "The progress bar reaches every counted loop",
    items: [
      { kind: "improved", tool: "All tools", text: "The shared count-up bar now also runs wherever a tool walks a counted list: the Exclusion analyzer's group expansion ('Expanding group 4/112' now moves a bar, not just a sentence), the Conditional Access groups scan (group lookups and member reads), the CSV import's user resolution and member reads, the RMAU protection scan, and the Group Analyzer's source-by-source sweep. One visual, same brand colours, everywhere something is fetched at length." },
    ],
  },
  {
    build: 23006, date: "2026-08-11", title: "One progress visual for every long read; impact says who a policy aims at",
    items: [
      { kind: "improved", tool: "Report-only impact", text: "A 🔴 verdict said WHO gets hit but not WHY they are in scope. Each policy card now shows the assignment it targets — include and exclude entries by name, straight from the policy in memory, with a link to the full policy card — and every affected user gets a why? button that resolves their directory membership against the policy's includes: 'member of included group X', 'holds included role Y', 'targeted directly', or 'the policy targets All users' (plus the reminder that no exclude entry caught them — that is why the sign-in applied)." },
      { kind: "improved", tool: "All tools", text: "The count-up progress bar the Report-only impact tool introduced is now the one busy visual for everything that reads at length: Sign-in failures (both modes) and the Change audit show the same bar, running count, page number and elapsed time — and Gap analyse drives it through its group-expansion and role-resolution loops, inline next to the status text. Each tool owns its own instance, so two reads running in background tabs never write into each other's panel, and every read survives switching tabs. The audit read is now also capped at 10,000 entries (with a notice when the window truncates) instead of unbounded." },
    ],
  },
  {
    build: 23005, date: "2026-08-11", title: "The progress bar wears the brand",
    items: [
      { kind: "fixed", tool: "Report-only impact", text: "The busy-state progress bar now fills in the brand's own dark colours — its gradient ended in a colour the brand overrides never touched, so on a branded tenant a stray green leaked into the bar. It now runs deep-to-primary of whatever brand is active (navy under a navy brand, green on the neutral look). Production also picks up the width fix the bar already had in beta — there it could still collapse to a sliver." },
    ],
  },
  {
    build: 23004, date: "2026-08-11", title: "Strengths grow their advanced options; three tools graduate",
    items: [
      { kind: "new", tool: "Authentication strengths", text: "Advanced options, as in the portal: restrict Passkeys (FIDO2) to specific AAGUIDs — with one-click presets for Microsoft Authenticator (Android + iOS) and Windows Hello (hardware, VBS, software), or any custom AAGUID — and restrict certificate-based authentication to specific issuer SKIs and policy OIDs (max 5 each, per Graph). Existing restrictions load with the strength ($expand), show on the cards and in the Markdown report, and edits apply only the difference: create, update or remove per configuration. A new strength carries its restrictions in the create call itself." },
      { kind: "fixed", tool: "All tools", text: "With many tabs open, the tab bar could not be scrolled back to its start — the home button and first tabs were unreachable. A centred flex strip that overflows hides its left side from scrolling entirely (a CSS classic); the strip is now centred with auto-margins instead, which scrolls normally, and switching tools keeps the active tab in view. Tall dialogs (like the grown strength editor) now scroll internally instead of pushing Save off screen." },
      { kind: "improved", tool: "All tools", text: "Out of BETA: 🎫 Authentication contexts, ♻ Recycle bin and 🔗 Group Analyzer — all three at v1.0 after tenant-side use." },
    ],
  },
  {
    build: 23003, date: "2026-08-11", title: "Shorter windows for fresh questions",
    items: [
      { kind: "improved", tool: "Report-only impact", text: "1-hour and 4-hour ranges join 1/7/30 days — flip a policy to report-only, drive some traffic, and check the impact of the last hour without paging in a whole day of a large tenant's log." },
      { kind: "improved", tool: "Sign-in failures", text: "The same 1-hour and 4-hour ranges — when the helpdesk phone rings, the failure is minutes old, not days." },
    ],
  },
  {
    build: 23002, date: "2026-08-11", title: "The long read shows its work",
    items: [
      { kind: "improved", tool: "Report-only impact", text: "Reading the sign-in window can take minutes in a large tenant — report-only verdicts cannot be server-filtered, so every page is fetched. The busy state now narrates: a running sign-in count, the page number and elapsed time, plus a progress bar toward the record cap, updated as each page lands. Switch tabs and back and it picks up mid-flight instead of showing a mute spinner." },
    ],
  },
  {
    build: 23001, date: "2026-08-11", title: "Report-only impact: the go-live forecast",
    items: [
      { kind: "new", tool: "Report-only impact", text: "New tool (BETA): what happens the day a report-only policy goes live, answered from the sign-in log. Where Sign-in failures keeps only the failures, this keeps every report-only verdict — so each staged policy gets a denominator and a verdict: 🔴 would block users (who, on which app, how often), 🟡 prompts only (interrupted for MFA or another control they can satisfy), 🟢 no change, or ⚪ no evidence — a staged policy with zero traffic is listed too, because 'no data' is the answer that should stop a go-live. The per-user view flips the question: for this person, the combined effect of everything in report-only at once, worst case first. Distribution bar per policy, per-user drill-down with apps and last-seen, policy names open the policy card, 1/7/30-day window, Markdown export for the change advisory board. Production released 229 (the usage counting that was beta 22905), so the beta cycle now targets release 230 — this build is 23001 (v1.0.230-beta.1)." },
    ],
  },
  {
    build: 22905, date: "2026-08-11", title: "Counting visits, not visitors",
    items: [
      { kind: "new", tool: "All tools", text: "ENCA now measures its own use — and only that. GoatCounter (a privacy-first, cookie-less counter) records page views and one event per tool-screen open: the tool's name and the channel (production or beta), nothing else. No identifiers, no tenant names, nothing from the Graph session; a blocked script changes nothing about how ENCA works. The README's privacy paragraph says exactly this. It answers one question the roadmap needs answered: which of these tools do people actually use." },
    ],
  },
  {
    build: 22904, date: "2026-08-11", title: "Recreate carries everyone, and says so",
    items: [
      { kind: "fixed", tool: "Conditional Access groups", text: "Recreate as role-assignable: the member move (added in build 219) only carried USER members — service principals and devices were left behind silently, which for a service-account persona group means an empty include. All member types now come across; the one thing that cannot is a nested group, because Entra forbids groups as members of a role-assignable group — those are named in the change report instead of failing quietly. And the confirm dialog no longer claims the new group starts empty (a leftover from before the member move existed): copying the members is now step ③ of the plan it shows." },
    ],
  },
  {
    build: 22903, date: "2026-08-11", title: "CIS: staged policies get their own tier",
    items: [
      { kind: "improved", tool: "CIS Benchmark", text: "Catalog r4, after reviewing the engine in Jhope188's CA Policy Analyzer. Disabled policies are now evaluated too: a policy that meets every criterion while Off lands in its own ⏸ Configured (Off) tier — own chip, own count, one state switch from passing — instead of disappearing into fail. It is deliberately NOT scored as pass: the benchmark's audit requires state = enabled, and the control says so (their analyzer shows such matches green with a state tag; an auditor would not). Staged-rollout baselines finally look like what they are." },
      { kind: "improved", tool: "CIS Benchmark", text: "5.2.2.5 tells you when you are close: a strength that carries the phishing-resistant methods but also allows extras — the classic PR + TAP onboarding strength — now reads 'close: includes the PR methods but also allows temporaryAccessPass…; remove the extras or document the deviation' instead of a flat combination miss. Their analyzer passes ANY admin auth-strength policy with a verify-yourself note; that reports compliance the benchmark letter does not support, so it was reviewed and deliberately not adopted." },
    ],
  },
  {
    build: 22902, date: "2026-08-11", title: "The what-if flow says how it ends",
    items: [
      { kind: "improved", tool: "List Policies", text: "The per-policy what-if flow now closes with a 🎯 CA result card: the actual sign-in verdict — denied, succeeds only after which controls (one-of or all-of, with the session shaping), or succeeds unconditionally — plus the tenant reality on a second line: Enforced (On, this is the real outcome today), Report-only (recorded but not enforced), or Off (becomes the outcome the moment the policy is switched On). The flow above stays the policy's logic; the result card is what the user at the door actually experiences." },
    ],
  },
  {
    build: 22901, date: "2026-08-11", title: "Beta catches up with production",
    items: [
      { kind: "new", tool: "All tools", text: "Production's builds 227 and 228 merged into the beta channel: the four new manage tools (\ud83c\udfab Authentication contexts, \ud83d\udcaa Authentication strengths, \ud83d\udcdc Terms of use, \u267b Recycle bin), the dependency-popup Manage-in-tool jump, and the terms-of-use PDF fixes now run here too \u2014 alongside the beta-only CIS Benchmark tool. This cycle now targets release 229, so this build is 22901 (v1.0.229-beta.1)." },
    ],
  },
  {
    build: 228, date: "2026-08-11", title: "Terms of use: the PDFs arrive",
    items: [
      { kind: "fixed", tool: "Terms of use", text: "PDFs and languages were invisible and uploads failed — three bugs, one release after shipping. The Graph LIST endpoint never returns the agreement files' content, so every agreement is now fetched individually with $expand=files: languages and the ⭳ PDF download appear on the cards, and the edit dialog lists the current PDFs per language (with the default marker and a view/download button). Creating an agreement failed because the POST included update-only properties — it now sends exactly what the create API accepts (name, view-before-accepting, the PDF) and applies per-device acceptance and the re-accept schedule in a follow-up PATCH. And Save awaits the file reader, so saving immediately after picking a PDF can no longer race the upload." },
    ],
  },
  {
    build: 227, date: "2026-08-10", title: "Two new tools: contexts and strengths",
    items: [
      { kind: "new", tool: "Authentication contexts", text: "A new manage tool (BETA): the Conditional Access authentication contexts — the step-up requirements apps, Protected Actions and sensitivity labels can ask for (c1-c99). Every defined context is a card with its publish state and the policies that enforce it (a published context no policy enforces is called out: callers requesting it get no step-up). Create in a free slot, rename, publish or unpublish with one click, and delete exactly where Graph allows it — unpublished and unreferenced only, behind a typed confirmation. The id is treated as what it is: the contract apps request and the ACRS claim carries, never changeable." },
      { kind: "improved", tool: "List Policies", text: "The dependency popup is now a junction into the manage tools: open an authentication strength, terms-of-use agreement, named location or authentication context from any policy card and a Manage-in-tool button takes you straight to the matching tool, pre-filtered to that item. See it on a policy, fix it in its tool, one click apart." },
      { kind: "new", tool: "Terms of use", text: "A new manage tool (BETA): the terms-of-use agreements Conditional Access can require. Every agreement as a card with its behaviour (view-before-accepting, per-device acceptance, re-accept schedule, expiration), its PDFs per language with direct download, and the policies requiring it. Create an agreement with a PDF upload, edit the behaviour settings, and check acceptances on demand — accepted and declined counts with the latest record, requesting AgreementAcceptance.Read.All only at that moment. Deleting is blocked while any policy still requires the agreement, because that delete would leave the policy with a dangling terms-of-use grant. Replacing a PDF or adding languages stays in the portal for now — the tool says so rather than pretending." },
      { kind: "new", tool: "Recycle bin", text: "A new manage tool (BETA): the Conditional Access recycle bin. Deleted policies and named locations stay restorable for 30 days — this tool lists everything still inside the window with what it did, its state at deletion, when it went and how many days it has left (expiring-soon filter included), and restores with the right guard rails: a policy that was On at deletion enforces again the moment it comes back, so that restore demands a typed confirmation; a name now taken again is flagged before you create a duplicate; a trusted location warns that every All-trusted policy follows it again immediately. After a policy restore the live policy set reloads, so every other tool sees it. (Yes — the delete flows used to say Conditional Access has no recycle bin. It does now, and so does ENCA.)" },
      { kind: "new", tool: "Authentication strengths", text: "A new manage tool (BETA): the Conditional Access authentication strengths. The three built-in strengths appear read-only with their full combination lists; custom strengths can be created, renamed, re-combined and — when no policy grants them — deleted behind a typed confirmation. Each strength is classified by its weakest allowed combination (phishing-resistant / MFA / allows single-factor), each card shows the policies granting it, and the combination picker groups the catalog by class — with the live catalog read from Graph so new methods appear without a code change. Edits use Graph's split model correctly: PATCH for name and description, the dedicated updateAllowedCombinations action for the combinations." },
    ],
  },
  {
    build: 226, date: "2026-08-10", title: "Tabs keep your place",
    items: [
      { kind: "fixed", tool: "All tools", text: "Switching tool tabs no longer jumps to the top of the page \u2014 each screen's scroll position is remembered and restored when you come back. And reopening List Policies (or Create documentation) keeps the cards / list / matrix view you last chose instead of resetting to cards; only Gap analyse still resets, since it shares the screen with a different view. (Production hotfix \u2014 builds 222\u2013225 are on the beta channel.)" },
    ],
  },
  {
    build: 22701, date: "2026-08-10", title: "Beta gets its own numbers",
    items: [
      { kind: "improved", tool: "All tools", text: "The beta channel now has its own build series: five-digit numbers NNNII, where NNN is the production build this beta cycle will become and II the iteration — this build is 22701, shown as v1.0.227-beta.1. Production stays on plain integers (build 226 is the tabs-keep-your-place hotfix). No more shared number line between the channels: a beta build can never collide with a production build, and the label says at a glance which channel you are looking at. On release, the cycle's beta entries are consolidated into one production changelog entry." },
    ],
  },
  {
    build: 225, date: "2026-08-10", title: "Pilot groups count, and tabs keep your place",
    items: [
      { kind: "fixed", tool: "All tools", text: "Switching tool tabs no longer jumps to the top of the page — each screen's scroll position is remembered and restored when you come back. And reopening List Policies keeps the cards / list / matrix view you last chose instead of resetting to cards. (This fix is app-wide and safe for production ahead of the CIS beta.)" },
      { kind: "improved", tool: "CIS Benchmark", text: "Catalog r3 — the deployment model's pilot phase now counts: a policy whose user include is entirely CAD- deployment groups is treated as All users (the include-group names are resolved via Graph for this), with a note that the benchmark's audit reads includeUsers = All, so switch the policy to All users when the pilot completes or document the pilot scope. This is why a Global persona policy mid-rollout no longer fails every users: All criterion." },
      { kind: "improved", tool: "CIS Benchmark", text: "Sharper misses: the token-protection resource criterion (5.2.2.16) now names exactly which of Exchange Online / SharePoint Online / Teams Services is absent — 'missing only: Microsoft Teams Services' is a one-line fix that the generic label hid. Sign-in-frequency misses (5.2.2.4, 5.2.2.13) show the interval actually found ('found 14 days — the benchmark requires 7 days or less'), and a phishing-resistant-strength miss (5.2.2.5) says whether the strength was unresolvable or which non-phishing-resistant combinations it allows." },
    ],
  },
  {
    build: 224, date: "2026-08-10", title: "CIS learns the persona model",
    items: [
      { kind: "fixed", tool: "CIS Benchmark", text: "The tool now sits in the tool tab bar — it was missing from the tab list, so it could not be opened from the ＋ menu or pinned as a tab." },
      { kind: "improved", tool: "CIS Benchmark", text: "The three administrator-scoped controls (5.2.2.1 MFA for admins, 5.2.2.4 sign-in frequency + non-persistent browser, 5.2.2.5 phishing-resistant strength) scored 0/15 admin roles against baselines that scope admin policies through a persona group — an Admins / E-Admins group include — instead of directory roles, because the benchmark's Graph audit only reads includeRoles. Admin persona groups now satisfy the admin-scope criterion, recognised by the Admins token in the policy name plus a group include. A control passed this way carries a note: the audit letter expects includeRoles, so document the group as the tenant's administrator scope and verify every admin-role holder is actually in it." },
      { kind: "fixed", tool: "CIS Benchmark", text: "Catalog r2, two criteria corrected to match the benchmark's own leniency notes: a sign-in frequency of Every time satisfies 5.2.2.13 (stricter than any 7-day interval), and a policy granting a single control satisfies the OR-operator criterion on 5.2.2.9/.10 — with one control selected, the stored operator makes no functional difference." },
    ],
  },
  {
    build: 223, date: "2026-08-10", title: "CIS on its own track",
    items: [
      { kind: "improved", tool: "CIS Benchmark", text: "The tool header now carries its version (v0.2, hover for the release notes) like every other tool — it was the one head missing the stamp. And the CIS content is now managed on its own release track: the benchmark catalog (the 17 controls and their assessment criteria in cisdata.js) has a revision stamp of its own, shown in the header and in the Markdown report. A new benchmark version, an added control or a corrected criterion bumps the catalog revision — independent of the app build and of the other beta tools — so a reviewer can always tell which catalog produced a given assessment." },
    ],
  },
  {
    build: 222, date: "2026-08-10", title: "Scored against CIS",
    items: [
      { kind: "new", tool: "CIS Benchmark", text: "A new tool: the tenant's Conditional Access policies assessed against the CIS Microsoft 365 Foundations Benchmark v7.0.0 — all 17 automated recommendations of section 5.2.2 Conditional Access. Per control: pass, report-only (a policy meets every criterion but isn't enforced) or fail, with the benchmark's Graph audit criteria spelled out and — for every failing control — the nearest policies and exactly which criteria they miss, so the result doubles as the remediation map. Level 1 / Level 2 profile filter, licence-awareness (the three Identity Protection controls read 'not licensed' instead of 'fail' when the tenant has no Entra ID P2), an overall and per-level compliance score, and a Markdown compliance report. It's a CA compliance slice of the benchmark, not a full M365 scan — and it says so. Recommendation numbers and titles referenced from the CIS Benchmark, © Center for Internet Security; the full benchmark text is not reproduced." },
    ],
  },
  {
    build: 221, date: "2026-08-10", title: "Stop reporting what you already fixed",
    items: [
      { kind: "fixed", tool: "MS Learn checks", text: "A policy that already excluded the shared-device group was still reported as breaking Teams devices. Every one of these checks remediates by adding that exclusion — but the detection never looked at whether it was already there, so CA004 showed the device-code finding while plainly excluding CAB-SEC-U-TeamsSharedDevices on the card above it. A finding whose entire remediation is already in place is not a lesser problem, it is not a problem: those are now suppressed rather than downgraded, and the summary says how many were handled that way so nothing goes quietly missing." },
      { kind: "fixed", tool: "MS Learn checks", text: "The convention groups (break-glass, shared devices) are resolved before the checks run rather than after. They were looked up only to build the fixes, which is why the checks could not tell an existing exclusion from a missing one. It costs one directory lookup before the first paint — a fair trade for not reporting problems that were solved months ago." },
    ],
  },
  {
    build: 220, date: "2026-08-10", title: "The shared-devices group it already had",
    items: [
      { kind: "fixed", tool: "MS Learn checks", text: "The shared-devices fixes asked for a group ENCA already ships. CAB-SEC-U-TeamsSharedDevices is the displayName in the bundled group templates and the name every exclusion in the R26.6 catalog actually uses — CA000, CA004, CA007, CA008, CA014, CA015, CA016 — but it was missing from the list of names these fixes accept, so a tenant that had done exactly the right thing was told six findings needed a group that did not exist. It is now the canonical name; the four older spellings stay as aliases." },
      { kind: "fixed", tool: "MS Learn checks", text: "Create now builds from the bundled template when there is one. It always made a bare, empty role-assignable group — but the shared-devices template is dynamic, with a membership rule that picks up the Teams Rooms resource accounts by their service plans, so it fills itself. The old path left an empty group to populate by hand and named it something the baseline never references. (Role-assignable and dynamic are mutually exclusive in Entra, so the template has to win.)" },
    ],
  },
  {
    build: 219, date: "2026-08-10", title: "Recreates: bring the members, then clean up after",
    items: [
      { kind: "fixed", tool: "Conditional Access groups", text: "Disable nesting is no longer offered on a role-assignable group. Entra already refuses to put a group inside one — “Group nesting isn't supported. A group can't be added as a member of a role-assignable group” — so the property would have changed nothing, and the recreate it may have led to would have been a new object id for no gain at all. The row says why instead." },
      { kind: "fixed", tool: "Conditional Access groups", text: "Recreating a group as role-assignable now carries its members across. It never did: it renamed the original, created the replacement, moved every policy — and left the new group empty, so an include group applied to nobody and an exclude group excluded nobody until someone noticed and copied the members by hand. Both recreate paths use the same move now, and both ask for RoleManagement.ReadWrite.Directory alongside Group.ReadWrite.All, because Microsoft is explicit that Group.ReadWrite.All alone cannot manage the membership of a role-assignable group." },
      { kind: "new", tool: "Conditional Access groups", text: "🧹 Archived groups, in ① Check: the leftovers every recreate deliberately leaves behind — “X (legacy 2026-08-04)”, “X (nesting …)”, “X-static-…” — found, listed and deletable. Each row shows what replaced it, how many members it still has and which policies still reference it. Anything a policy still points at is left unticked, because deleting it would leave that policy targeting nothing; anything still holding members is flagged, because that means its members were never carried across. Typed confirmation, a Markdown record of what was removed, and a reminder that a deleted group is restorable for 30 days — and that Group Analyzer, linked from the dialog, is what tells you whether Intune, licensing or Azure RBAC still point at the old id." },
    ],
  },
  {
    build: 218, date: "2026-08-10", title: "It assigns roles too, so it says so",
    items: [
      { kind: "improved", tool: "List Policies", text: "The action is called Assign groups or roles now — on the selection bar, on the per-policy card, in the help and at the top of the change report. It has been able to set directory roles since build 211, but the label still promised only groups, which is a good way to keep a capability hidden from the people who would use it. The wizard title follows what you are doing: “Assign groups or roles” while you are still choosing, then the specific one." },
    ],
  },
  {
    build: 217, date: "2026-08-10", title: "Legacy auth: the block and the noise — and a scorecard you can click",
    items: [
      { kind: "fixed", tool: "Best-practice & bypass checks", text: "Twelve HIGH findings next to a 100-point legacy signal was both too loud and too quiet. The per-policy 'legacy targeted but not blocked' finding now correlates with the tenant's dedicated block, the way the DRS and platform checks already do: with an enabled tenant-wide legacy block, a grant policy that merely lists legacy client types drops to LOW ('covered by the tenant-wide block' — CA applies the union, the block wins), with the reminder that the block's own exclusions are the only legacy path left. A block that is enabled but narrower than All users downgrades them to MEDIUM instead; no block at all stays HIGH. The scorecard mirrors it: 100 only when the block covers everyone, 70 for a narrower block, 50 report-only, 0 none." },
      { kind: "improved", tool: "Best-practice & bypass checks", text: "The Zero Trust scorecard now filters the findings: click a pillar or a signal and the list below narrows to the finding categories that signal is derived from — 'Legacy authentication blocked' shows only the Legacy Authentication findings, 'Break-glass identified' only Break-Glass Coverage, a pillar shows everything its signals draw on. A dismissable chip in the filter bar names the active categories, the severity chips count only what is on screen, and clicking the same signal again — or All — clears it." },
    ],
  },
  {
    build: 216, date: "2026-08-10", title: "Select all shown, in the role picker",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "The directory-role picker gains Select all shown, which takes whatever the list is currently displaying — so it follows both the “administrator roles only” tickbox and the search box. Search for Teams and it selects every Teams role; untick the filter and it selects every built-in template. It adds to the selection rather than replacing it, so several searches can be combined into one assignment." },
    ],
  },
  {
    build: 215, date: "2026-08-10", title: "The beta banner, front and centre",
    items: [
      { kind: "improved", tool: "All tools", text: "The BETA \u2014 not production marker moved from the top-right corner to the middle of the top bar: a bold red banner centred over the header, unmissable in screenshots and demos alike." },
    ],
  },
  {
    build: 214, date: "2026-08-10", title: "Credit where the block is",
    items: [
      { kind: "fixed", tool: "Best-practice & bypass checks", text: "The scorecard's 'Legacy authentication blocked' signal scored 0 when ANY legacy-auth finding existed — so an unrelated policy that lists legacy client types without blocking them erased the credit for a real, enabled legacy-auth block (e.g. CA002-BLOCK-…-LegacyAuthentication). The signal is now measured from the policies directly: 100 for an enabled block targeting legacy client types, 50 when the block only exists in report-only, 0 when there is none. Findings still tell the full story either way." },
    ],
  },
  {
    build: 213, date: "2026-08-10", title: "A posture score, and seven checks deeper",
    items: [
      { kind: "new", tool: "Best-practice & bypass checks", text: "Zero Trust scorecard — three pillars (Verify explicitly, Least privilege, Assume breach), each a weighted average of 0-100 signals derived from the policy set and the findings, with an overall posture number on the summary and in the Markdown export. A number, not a verdict: it points at the findings, it does not replace them. Modeled on the scorecard in Jhope188's CA Policy Analyzer (independent reimplementation, credited in the README)." },
      { kind: "new", tool: "Best-practice & bypass checks", text: "Seven new checks: no sign-in-risk / no user-risk policy (Identity Protection signals computed but unused), Microsoft-managed policy detection including disabled Baseline Security Mode phantom drafts (MC1246002), platform-scoped policies without an unknown-platform block (the platform condition comes from the user agent, which is spoofable), named-location hygiene (dangling location references, 'All trusted locations' while IP locations sit unmarked, country locations with empty country lists), broad MFA policies with client-app-type holes, disabled resilience defaults, and authentication-context / Protected Actions policies (basic MFA instead of a strength, All-users scoping, report-only step-up, missing break-glass exclusions)." },
      { kind: "new", tool: "All tools", text: "Beta channel: a deployment on any host other than the production one wears a permanent BETA ribbon and a [BETA] page title, so a test deployment can never be mistaken for production." },
    ],
  },
  {
    build: 212, date: "2026-08-04", title: "146 roles, and only one of them showing",
    items: [
      { kind: "fixed", tool: "List Policies", text: "A policy scoped to many things showed only the first of them. The list row and the card summary printed users.inc[0] and nothing else — no count, no ellipsis — so a policy assigned a group plus 145 directory roles read exactly like one assigned a single group, and an assignment that had just been written looked like it had not been. Both now say “+N more”. The applications column already did this; the user column never did." },
      { kind: "fixed", tool: "Conditional Access groups", text: "The assign wizard only reloaded the policies when it was closed with the Close button. Closing it with Cancel, or by clicking outside it, left the app showing the state from before the write. Any way out now reloads, and only when something actually changed." },
      { kind: "improved", tool: "Conditional Access groups", text: "The role picker is about administrator roles, which is what people mean when they ask for them. “All built-in roles” has gone: directoryRoleTemplates includes Guest User, Restricted Guest User, Device Join and the Partner support roles, and offering all 146 behind one button is how a policy ends up scoped to things nobody intended. The list defaults to roles with “Administrator” in the name plus the privileged set, the quick pick selects exactly those, and a tickbox reveals the rest with a note about what is in there." },
    ],
  },
  {
    build: 211, date: "2026-08-04", title: "Assign directory roles, not just groups",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "The assign wizard can now target a policy's Directory roles — the same include and exclude the portal offers under Users. Choose Groups or Directory roles at the top, and the same actions apply to whichever you picked, bar “Set INCLUDE to All Users”, which has no role equivalent and is hidden. This is the assignment behind every “require MFA for admins” policy, and it was the one thing the wizard could not express." },
      { kind: "new", tool: "Conditional Access groups", text: "Quick picks: Microsoft's privileged set — the fourteen roles Microsoft names as the minimum to require MFA on (Global, Application, Authentication, Billing, Cloud Application, Conditional Access, Exchange, Helpdesk, Password, Privileged Authentication, Privileged Role, Security, SharePoint and User Administrator) — or every built-in role, or clear. The set is held as names and resolved against this tenant's own role templates rather than hard-coded GUIDs, because a wrong GUID would silently target nothing at all." },
      { kind: "improved", tool: "Conditional Access groups", text: "The wizard is explicit about the limit that catches people out: Conditional Access enforces built-in roles only. Custom roles and administrative-unit-scoped assignments are not covered by a policy scoped this way — said at the point of choosing, again in the review, and once more in the change report. Setting include roles on a policy that currently covers All users warns that it will narrow to those roles." },
      { kind: "fixed", tool: "Conditional Access groups", text: "The no-op check that skips policies an assign would not change compared only groups and users. A role-only edit therefore compared equal and would have been skipped on every policy — the run reporting success having written nothing. It compares roles now." },
    ],
  },
  {
    build: 210, date: "2026-08-04", title: "Small things: version on the tool, autofill on the search",
    items: [
      { kind: "improved", tool: "All tools", text: "The version badge now sits on the tool's own header card, not only on the home tile — which is where you are when you wonder whether what you are looking at has changed since last time. Hovering it still gives the full note of what that version covers. It survives the tool re-rendering its own header, so it does not vanish after a scan." },
      { kind: "improved", tool: "Sign-in failures", text: "The search box autocompletes, like the user fields elsewhere in the app. Two sources, in order: the users and apps that actually appear in the current result — the only ones worth typing once a scan has run — and then the directory, for when it has not. Typing two characters searches Entra; focusing the empty box offers what is already on screen." },
    ],
  },
  {
    build: 209, date: "2026-08-04", title: "Sign in without a pop-up (for Edge work profiles)",
    items: [
      { kind: "fixed", tool: "All tools", text: "Microsoft Edge signed into a work profile could loop the sign-in forever, while the same account in the same browser without a profile worked. Edge's automatic profile switching decides a work sign-in belongs to another profile and reopens the pop-up in that profile's window — which severs the link back to the page that opened it. The pop-up then has no way to hand the response back, so Entra just asks again." },
      { kind: "new", tool: "All tools", text: "A redirect sign-in is now available: “Pop-up not working? Sign in without one” under the sign-in button. It navigates this tab instead of opening a window, so there is no opener to lose, and the choice is remembered — the sign-in button uses it from then on, with the link offering to switch back. Returning from it carries straight on into the tenant rather than showing the sign-in screen to somebody who has just signed in. The pop-up remains the default; it keeps the page as you left it." },
      { kind: "improved", tool: "All tools", text: "A pop-up that closes on its own now names Edge's profile switching as the first thing to check, since that is a browser problem with a one-click fix rather than anything to do with the tenant." },
    ],
  },
  {
    build: 208, date: "2026-08-04", title: "The sign-in popup that ate its own answer",
    items: [
      { kind: "fixed", tool: "All tools", text: "Sign-in could loop on Microsoft's account picker: pick an account, land on /common/reprocess, and be asked to pick an account again, forever. The redirect URI is this app's own page, so after authentication the popup navigated back here and loaded the entire application again — every script, and a second MSAL instance — inside a window whose only job was to hand its own URL back to the opener. That second instance could consume the authorization response before the opener read it, leaving the sign-in with nothing to complete and the picker to reappear. The popup, and the hidden iframe used for silent token renewal, now stop loading the moment they see they are carrying an auth response. Nothing else changes: no new redirect URI, so no app registration needs touching." },
    ],
  },
  {
    build: 207, date: "2026-08-04", title: "A sign-in that tells you why it failed",
    items: [
      { kind: "fixed", tool: "All tools", text: "A failed sign-in could return you to the sign-in screen saying nothing at all. MSAL reports user_cancelled for any pop-up that closes without a token — not just the one you close yourself, but also a Conditional Access policy interrupting the sign-in, a tenant that has not consented, or an account blocked from the app — and the handler treated every one of those as “they changed their mind” and returned silently. It now always says what happened, in place under the sign-in button rather than as an alert you dismiss, and recognises the codes that matter: blocked by Conditional Access, MFA needed, device policy, consent missing, app not present in the tenant, redirect URI, wrong account type. Each one says what to do next, and the raw code and timestamp sit underneath in one click-to-select line for a ticket." },
    ],
  },
  {
    build: 206, date: "2026-08-04", title: "The logo, properly this time",
    items: [
      { kind: "fixed", tool: "All tools", text: "205 fixed half of it. The policy-card marks stopped being hard-coded, but they read the deployment's own BRANDING — and a per-audience override does not mutate that. activeBrand() builds a merged copy for the chrome and leaves the global untouched, so under an override the header wore the right logo while every policy card still drew the deployment's. The active look is now published as Brand.current and that is what draws the marks. Exports are deliberately excluded and still carry the neutral product credit, which is the entire point of an override changing chrome only." },
    ],
  },
  {
    build: 205, date: "2026-08-04", title: "A logo that should not have been there",
    items: [
      { kind: "fixed", tool: "All tools", text: "A rebranded deployment was still showing the Limon-IT mark on every policy card. js/branding.js was meant to be the one file that carries the identity, but js/render.js hard-coded assets/logo-mark-light.svg and assets/logo-mark-dark.svg for the two on-screen policy marks, so a fork's own logo never reached them. Both now come from branding, and a wide wordmark keeps its aspect instead of being squashed into a 30-pixel square. Exports are unaffected — they carry the customer's tenant branding and never a product logo, which was already correct." },
      { kind: "fixed", tool: "Conditional Access groups", text: "Disable nesting could be offered on the archived half of an earlier recreate — a group still called “… (legacy 2026-08-04)”. Acting there is wrong twice over: the live group is the one without the suffix, and a recreate would have created a permanent new group still carrying the archive suffix in its name, then renamed the old one to “… (legacy …) (nesting …)”. It now recognises all three archive shapes this tool leaves behind and refuses, pointing at the live group instead." },
      { kind: "new", tool: "All tools", text: "Reports and confirmations that tell you to check Group Analyzer now link to it. Markdown rendering learned links, including an in-app form that closes whatever is open and lands you on the tool — being told to go and find something is not the same as being taken there." },
      { kind: "fixed", tool: "All tools", text: "Builds 203 and 204 were dated 2026-07-28. They were released today. Corrected — and the note on the List Policies mobile fix no longer blames a sticky offset that build 201 had already fixed properly; the real reason that toolbar stops sticking on a phone is that it wraps to five rows and pinning a quarter of the viewport leaves nothing to read." },
    ],
  },
  {
    build: 204, date: "2026-08-04", title: "List Policies on a phone, and more than one scoped admin",
    items: [
      { kind: "improved", tool: "List Policies", text: "Usable on a phone. The toolbar is no longer sticky below 680px — not because the offset was wrong (build 201 already measures that correctly) but because on a narrow screen this particular toolbar wraps to five rows, and pinning a quarter of the viewport leaves nothing to read. The action bar under it stops sticking for the same reason. The policy card was a three-column grid, which at 390 pixels gave columns barely wider than a word; it is one column, with the dividers that assumed three of them removed. And the list table was width:100%, so it crushed its columns instead of scrolling; it scrolls now. The state filters swipe sideways rather than stacking three rows deep, and the action bar wraps to two rows instead of one squeezed line." },
      { kind: "improved", tool: "Protect exclusions", text: "The scoped-administrator box takes more than one account. Separate them with a comma — a break-glass pair, or an admin plus the team that covers them, which is exactly the shape you want when the whole point is that tenant-level admins can no longer manage these groups. Each account is resolved and granted on its own, so one bad UPN no longer costs the others, and every outcome reaches the change report by name; an account that already holds the scoped role is reported as such rather than as a failure. Type-ahead now completes the entry after the last comma instead of searching for the whole line. Applies to both entrances — the standalone tile and CA groups ⑥." },
    ],
  },
  {
    build: 203, date: "2026-08-04", title: "Close the side door: disable group nesting",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "🚫 Disable group nesting (BETA), on any present, non-dynamic group in ① Check. A nested group is an invisible route into a Conditional Access assignment: someone adds a group to a group, a policy's scope widens, and the policy itself was never touched — so nothing in a review of that policy shows it happened. Entra's beta disableNesting property closes it: with the property set, no group can be added as a member. On a persona group, where the whole design assumes membership is deliberate, that is worth having." },
      { kind: "new", tool: "Conditional Access groups", text: "Detection is honest about what it cannot know. A plain read does not return disableNesting at all — only an explicit request for that one property does — so ① Check asks for it separately, after the table is already on screen, and reports three states rather than two: disabled, allowed, or not reported. “Not reported” means this tenant does not surface the property yet; it does not mean nesting is allowed, and the tool does not pretend otherwise." },
      { kind: "new", tool: "Conditional Access groups", text: "The write path tries the harmless thing first. Microsoft documents a dedicated permission for updating this property but does not list the property as updatable, and in the field it currently only takes at creation — so ENCA attempts the in-place change and then reads the value back to confirm, because Entra will happily accept a PATCH and silently ignore a property it does not recognise. Only if that genuinely fails does it offer to recreate the group — rename the current one aside, create it again with nesting disabled, move the user members, repoint every Conditional Access assignment — behind its own separate typed confirmation, never the first one. When Microsoft finishes shipping this, the recreate simply stops being reached." },
      { kind: "new", tool: "Conditional Access groups", text: "It refuses to run on a group that already contains nested groups, and says which ones. A nesting-disabled group cannot hold them, so recreating would quietly drop those memberships — and with them every user who was only a member through the nested group. That is exactly the kind of loss that is discovered months later, so the tool stops and hands you the list instead of proceeding and reporting the damage afterwards." },
      { kind: "new", tool: "Conditional Access groups", text: "If a recreate is needed the group gets a new object ID. Conditional Access assignments are moved for you; app assignments, Intune, group-based licensing and Azure RBAC are not, and the confirmation says so and points at Group Analyzer. The old group is renamed rather than deleted, so it is recoverable, and a failed create rolls the rename back rather than leaving the tenant half-changed. Needs Group-NestingSupport.ReadWrite.All and Group.ReadWrite.All, on demand. Background: Daniel Bradley, ourcloudnetwork.com." },
    ],
  },
  {
    build: 202, date: "2026-07-28", title: "Protect keeps its result",
    items: [
      { kind: "improved", tool: "Protect exclusions", text: "Same manners as Sign-in failures now: opening the tool shows a ▶ Scan button instead of immediately reading the directory, the result stays when you switch tabs and come back (until an explicit ⟳ Rescan), and a scan in flight survives navigating away. The shared group scan also loads on demand rather than on open, so just visiting the tool costs nothing. Applies to both entrances — the standalone tile and CA groups ⑥. The scoped-administrator field also auto-completes UPNs now, the same way the What-If user field does." },
    ],
  },
  {
    build: 201, date: "2026-07-28", title: "Sign-in failures, phone-sized",
    items: [
      { kind: "fixed", tool: "All tools", text: "On a phone, the sticky chrome (header, tool tab bar, each screen's toolbar) overlapped the content and stole taps — the layer offsets were hard-coded for a one-row desktop header, and on a narrow screen the header wraps taller. The offsets are now measured from the real header and tab-bar heights (and re-measured on resize and screen changes), so every sticky layer — toolbars, the Help table of contents, the List screen's action bar, the pinned labels — lands where the previous layer actually ends, at any width." },
      { kind: "improved", tool: "Sign-in failures", text: "The per-sign-in list is now the DEFAULT view — a failed sign-in is usually investigated one event at a time, and the newest event is the one you came for; Per policy stays one tap away for the aggregate picture. And because this is exactly the tool that gets opened from a phone when something is blocking someone right now, it now behaves on small screens: full-width search, the policy chips as one swipeable strip instead of a wall, tighter cards with wrapping instead of clipping, and the Per-policy table scrolls sideways." },
    ],
  },
  {
    build: 200, date: "2026-07-28", title: "Protect reads top-down",
    items: [
      { kind: "improved", tool: "Protect exclusions", text: "The panel now reads in the order you work: the administrative unit, scoped administrator and confirmation first, the group list below it — with a clearer explanation of why only the unprotected ASSIGNED exclusion groups are pre-selected. Dynamic groups are opt-in: their members follow a membership rule, not manual adds — the restriction still guards the group object (rule edits included) — and role-assignable groups are already privileged-only. The confirmation tick also survives toggling groups now." },
    ],
  },
  {
    build: 198, date: "2026-07-28", title: "Protect exclusions gets its own front door",
    items: [
      { kind: "new", tool: "Protect exclusions", text: "The exclusion-group protection workflow is now also a tool of its own on the home grid — same engine as CA groups ⑥ Protect (one state, one renderer, two entrances): restricted management administrative unit created if missing or reused, per-group protection status, optional AU-scoped Groups Administrator, explicit acknowledgement, Markdown report. Opening either view primes the other — the group scan is shared." },
    ],
  },
  {
    build: 197, date: "2026-07-28", title: "Exclusion groups, out of reach",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "⑥ Protect — membership of a CA exclusion group is a Conditional Access bypass, and any tenant-level Groups/User Administrator can quietly hand it out. The new tab places the exclusion groups in a restricted management administrative unit (isMemberManagementRestricted — set at creation, immutable), after which only roles scoped to that administrative unit can change their members; tenant-wide admins, Global Administrator included, drop to read. Shows which exclusion groups are already protected, creates or reuses the restricted AU, and can grant one account Groups Administrator scoped to the AU so membership stays manageable — recommended, and called out because it also affects this tool's own ⑤ Import members. Behind an explicit acknowledgement; ends with a Markdown report. Needs AdministrativeUnit.ReadWrite.All (added to the app-registration script — re-run it against an existing app to pick the permission up), the Privileged Role Administrator role, and Entra ID P1 for AU administrators. Cloud security groups only — mail-enabled and on-premises-synced groups are rejected by Graph." },
    ],
  },
  {
    build: 196, date: "2026-07-27", title: "Compare users and Named locations are out of BETA",
    items: [
      { kind: "improved", tool: "Compare users", text: "Out of BETA, at v1.0. Nothing about it changed in this build — the badge is off because the tool has held up: per-policy assignment for two to eight users with the group, role or direct exclusion behind every difference, the membership grid underneath it, and the optional What-If sign-in run per user. It stays read-only and resolves per user, so it is unaffected by tenant size." },
      { kind: "improved", tool: "Named locations", text: "Out of BETA, at v1.4. It still writes to the tenant, and that badge stays: create, edit and delete IP-range and country locations, with CIDR and ISO-code validation, a warning when the trusted flag changes what policies do, and a typed confirmation before deleting a location a policy still references." },
      { kind: "fixed", tool: "All tools", text: "The README still listed Sign-in failures as BETA, three builds after it graduated. Corrected." },
    ],
  },
  {
    build: 195, date: "2026-07-27", title: "The summary follows you down the page",
    items: [
      { kind: "improved", tool: "Group Analyzer", text: "The summary chips now sit in a strip that stays put while you scroll — in both the sweep and the single-group view. On an account with a few hundred references the counts are the navigation (each area chip jumps to its section), and having them scroll away meant returning to the top to move anywhere. The object's name rides along, so it stays obvious whose result you are reading, and in the sweep the search box and the unused-only toggle come with it." },
      { kind: "improved", tool: "Group Analyzer", text: "The single-group header no longer buries the counts under a wall of group memberships. The object ID and the “member of / contains / roles” lines moved into their own card below the strip, where a hundred-group membership list can be as long as it likes." },
    ],
  },
  {
    build: 194, date: "2026-07-27", title: "Sweep only the groups Conditional Access actually uses",
    items: [
      { kind: "new", tool: "Group Analyzer", text: "New sweep scope, and the new default: Only groups used by Conditional Access. It takes the include and exclude groups off every policy already loaded — enabled, report-only and Off alike — so it needs no directory enumeration at all and is bounded by your baseline rather than by the size of the tenant. On a 20 000-group tenant it is the difference between a sweep you plan and one you just run. It is also the question worth asking here: not “which of my 20 000 groups is dead”, but “now that Conditional Access depends on this group, what else does it touch?”" },
      { kind: "new", tool: "Group Analyzer", text: "Dangling references are kept, not dropped. When a policy names a group id the directory can no longer resolve, that row stays in the sweep flagged “not in the directory”, with the policies that name it — because the policy still points at it, so that assignment targets nobody, and a policy quietly scoped to nothing deserves more attention than a group that is merely unused. A chip filters the table down to them, the popup spells out the consequence, and they carry through to the Markdown, HTML and CSV exports." },
      { kind: "improved", tool: "Group Analyzer", text: "Opening the tool no longer reads a page of groups to seed the single-group picker. With the sweep as the default mode that list is not even on screen, so it is fetched when the picker is actually reached — switching to single-group mode, or clicking into the box." },
    ],
  },
  {
    build: 193, date: "2026-07-27", title: "Lemon headings, and the sweep up front",
    items: [
      { kind: "improved", tool: "All tools", text: "In dark, tool card titles are lemon rather than white — the same role the accent plays on limon-it.nl, where it is green in light and lemon in dark. Section labels stay white: on the site only the small eyebrow labels take the accent, headings do not. The BETA pill is now an outlined lemon chip rather than a solid one, because a solid lemon pill sitting beside a lemon title turns the whole line one colour." },
      { kind: "improved", tool: "Group Analyzer", text: "Sweep every group is the default mode. It is the more useful first move — it answers “which of my groups is dead” across the whole tenant, and any single group is one click away from the result." },
      { kind: "improved", tool: "All tools", text: "The NEW badge is off CA validator, What-If and Change audit. They have been in for several builds; a badge that never comes off stops meaning anything." },
    ],
  },
  {
    build: 192, date: "2026-07-27", title: "Dark mode, in Limon-IT colours",
    items: [
      { kind: "improved", tool: "All tools", text: "The dark theme now uses limon-it.nl's own palette, value for value: the background, surfaces, borders, ink and the sage muted tone are lifted straight from the site, and the lemon is the logo lemon (#f7d65a) rather than the duller shade this theme had drifted to. The greens are deeper and greener, so the tools and the site read as one product instead of two." },
      { kind: "improved", tool: "All tools", text: "More than a palette swap: the site's rule is that the green is the surface and the lemon is the signal, and this theme had it the other way round. So in dark, tool titles are white rather than green, the BETA and NEW pills are the site's lemon category pill (uppercase, letter-spaced, dark green text), the primary button is lemon, and the home screen carries the site's two-tone hero glow. Light mode is untouched — there the green is the accent, exactly as on the site." },
      { kind: "fixed", tool: "All tools", text: "Dark-mode rules that need more than a variable swap were only written for the explicit theme picker, so anyone on Auto with a dark OS got the light-mode active tab — white text on green. Every dark rule now exists in both branches, and they are kept in parity." },
      { kind: "fixed", tool: "All tools", text: "The faint tone used for “not applicable” rows and disclosure carets fell below 3:1 against the new, lighter surface. Lifted back over the line; every other text pair in the theme checks out at AA or better." },
    ],
  },
  {
    build: 191, date: "2026-07-27", title: "Group Analyzer: a way back, and a way to sweep less",
    items: [
      { kind: "new", tool: "Group Analyzer", text: "Deep analyze no longer costs you the sweep. Drilling into a single group keeps the finished sweep loaded, and ← Back to the sweep appears above the result to put it straight back — same groups, same search, same “only unused” filter, no second scan. It survives analysing several groups in a row, and is cleared only by a new sweep or Reset." },
      { kind: "new", tool: "Group Analyzer", text: "A sweep can be narrowed by name: starts with, ends with or contains. Naming conventions live at both ends of a name, so a prefix like CAB-SEC- is usually enough to cut a 20 000-group tenant down to the set worth looking at — and “Groups in scope” then counts matches rather than raw groups, so “first 100” means a hundred groups you care about. The filter runs server-side where Graph supports it (endsWith needs $count, which pairs with the ConsistencyLevel header ENCA already sends) and falls back to filtering locally where a tenant rejects it. The scope is carried into the sweep header and into every export." },
      { kind: "new", tool: "Group Analyzer", text: "Purview, as far as Graph allows: the container sensitivity label on a group is now read and reported under Microsoft 365. It is worth having — the label drives the team's and site's privacy, guest access and external sharing, so membership plus label is the real posture. It is also the only part of Purview with a Microsoft Graph surface: DLP policies, retention policies, label publishing policies, insider risk and communication compliance live behind Security & Compliance PowerShell, which a static site cannot call. The help text says so outright rather than letting a clean result imply Purview was checked." },
      { kind: "new", tool: "Group Analyzer", text: "The summary chips do something. In a sweep, “groups” clears the filters, “with no usage found” toggles the unused-only list, “services read” opens the receipt — every service read, what it found and how long it took — and “not read” jumps to the failures. On a single group, each area chip jumps to its section." },
      { kind: "fixed", tool: "All tools", text: "A checkbox sitting inside a What-If–style form field was being inflated into a 38-pixel bordered square: the rule that gives text inputs and selects their height was matching every input, tick boxes included." },
      { kind: "fixed", tool: "Group Analyzer", text: "When all candidate shapes of a call failed, the “Not read” entry said only “none of 3 known shapes worked” and swallowed the individual reasons — the joiner used the same separator the error shortener splits on. The per-URL reasons are back." },
    ],
  },
  {
    build: 190, date: "2026-07-27", title: "Group Analyzer: no second scan, and two calls that were quietly failing",
    items: [
      { kind: "improved", tool: "Group Analyzer", text: "Clicking a group in a tenant sweep no longer re-runs the whole analysis. The sweep already holds every (group, object) hit, so the row now opens a popup that filters what is in memory — instant, on a tenant of any size. The one thing a sweep genuinely cannot know is inheritance, because it matches each group only against itself; the popup says so and offers ⤢ Deep analyze, which re-reads that single group with its parent groups expanded. Markdown, HTML and CSV export straight from the popup, for that group alone." },
      { kind: "fixed", tool: "Group Analyzer", text: "Intune scripts came back 403 while compliance and configuration profiles read fine, which looked like a role problem and was not: PowerShell scripts, macOS shell scripts and remediations sit behind their own permission, DeviceManagementScripts.Read.All, and are not covered by DeviceManagementConfiguration.Read.All. It is now requested with the rest of the Intune area and added to the app registration script." },
      { kind: "fixed", tool: "Group Analyzer", text: "Access packages came back 400 on both calls. The cause was nesting inside an $expand — $expand=accessPackage($select=…) and $expand=resourceRoleScopes($expand=scope,role) — which Graph rejects outright while naming nothing. Both are now single-level expands, and because entitlement management has renamed these relationships between versions before, each call tries a short ladder of known spellings and takes the first that answers instead of failing on the first miss." },
      { kind: "improved", tool: "Group Analyzer", text: "A failure now says what to do about it. Under “Not read”, each entry carries the permission the call needs and, separately, the directory or Intune role the signed-in user needs on top of it — those are different things, and a consented scope is often not enough. A 404 is called out as normal for a workload the tenant does not use, rather than looking like a fault." },
      { kind: "new", tool: "Group Analyzer", text: "Export HTML: a self-contained report — summary cards, every reference grouped by service, and the “Not read” list — that opens on any machine with no access to the tenant. The artefact to attach to a change request when the argument is that a group must not be touched. Available for a single group, for a whole sweep, and from the per-group popup." },
      { kind: "fixed", tool: "Group Analyzer", text: "The tenant-sweep card had a dead band above the search row and its content ran off the right edge: it reused the shared sticky toolbar, which is built for the top of a screen and breaks inside a card that clips its overflow. The card now has its own toolbar and the table scrolls instead of the card." },
      { kind: "improved", tool: "All tools", text: "A failed Graph read used to throw a bare “Graph request failed (403)”. It now carries Graph's own message, code and details — the same treatment writes already had — so every tool says whether it hit a missing scope, a missing role or a malformed query." },
    ],
  },
  {
    build: 189, date: "2026-07-27", title: "Where is this group actually used?",
    items: [
      { kind: "new", tool: "Group Analyzer", text: "New tool (BETA) in Analyse & simulate. A group is a shared handle: one admin scopes a Conditional Access policy to it, another targets an Intune configuration profile at it, a third grants it a role on an Azure subscription — and nobody sees the whole picture, so adding a member has consequences that are invisible at the moment of the change. Paste a group name, a UPN or an object ID and get every place it is referenced, across 23 services: Entra ID (group nesting, administrative units, directory roles including PIM eligibility, enterprise application assignments, group-based licensing, the authentication methods policy, Conditional Access, access packages, admin-consent reviewers and — for a user — what they have actually registered), Intune (enrolment device-limit and platform restrictions, compliance policies, configuration profiles across device / settings catalog / ADMX, PowerShell and shell scripts and remediations, app protection, app configuration, app assignments, Autopilot profiles, Windows update profiles), Microsoft 365 (whether the group is an M365 group with a team on it) and Azure RBAC across every subscription and management group you can read, down to resource scope. After Jasper Baes' Microsoft Cloud Group Analyzer, re-implemented in the browser against delegated permissions — nothing installed, no client secret." },
      { kind: "new", tool: "Group Analyzer", text: "Parent groups are taken along. If the group is nested inside another group, anything targeting the parent reaches these members too — those hits are reported with “via parent group …” in the Matched via column, so an inherited reference is never mistaken for a direct one. For a user, every group they are a member of and every directory role they hold is in scope, so you see what the person is actually subject to." },
      { kind: "new", tool: "Group Analyzer", text: "Sweep every group: the same checks run tenant-wide and produce a group × service count table plus the list of groups nothing references — the starting point for a clean-up. Each service is read once and matched against every group, so a sweep costs little more than a single lookup; the per-group lookups (nesting, administrative units, app assignments, licensing, Teams) are batched 20 at a time through Graph's $batch and can be switched off for a fast first pass. Click any row to analyse that group on its own." },
      { kind: "new", tool: "Group Analyzer", text: "Nothing is read that you did not ask for. Entra, Intune, Microsoft 365 and Azure are ticked independently, and each area asks for its own permissions at the moment you tick it — while the click is still a live user gesture, which is where a consent popup actually survives. Azure is a different resource entirely (management.azure.com), so it gets its own token and its own consent, never bundled with Graph. Any service that failed or was never granted is listed by name with the reason under “Not read”: nothing found only ever means nothing found in what was actually read." },
      { kind: "new", tool: "All tools", text: "The permissions overview on the home screen now lists the six additional read scopes Group Analyzer can ask for and, separately, the Azure Resource Manager permission — marked as its own resource rather than mixed into the Graph consent request." },
    ],
  },
  {
    build: 188, date: "2026-07-23", title: "Compare users, side by side",
    items: [
      { kind: "new", tool: "Compare users", text: "New tool (BETA) in Analyse & simulate: add two to eight users and see where Conditional Access treats them differently. Per enabled or report-only policy, whether each user is included, excluded (hover for the group, role or direct exclusion behind it) or not targeted — rows where the users differ are flagged, and a differences-only toggle (on by default) hides the rest. A membership grid shows the groups and directory roles behind those differences. Optionally describe one What-If sign-in (resource, platform, client, IP/country, device state, risk) and it runs once per user through the What-If engine — a verdict per user, then the per-policy matrix of who it would actually hit. Markdown export of the whole comparison. Resolution is per user (transitiveMemberOf), so no tenant-wide group expansion — it stays fast on any tenant size." },
    ],
  },
  {
    build: 187, date: "2026-07-22", title: "Updates inherit what already works",
    items: [
      { kind: "fixed", tool: "Import", text: "Updating an existing policy (match & replace) could fail with a bare Graph 400 when the newer baseline version carried a terms-of-use or custom authentication-strength id from the source tenant that the dependency map couldn't place — even though the policy being replaced obviously has working ids. Those ids now fall back to the replaced policy's own terms of use / strength (tenant-valid by definition), with a note in the change report. A failed update also now says explicitly that an update is create-new-version-then-switch-old-Off, and that the current policy is untouched and still active when the create fails." },
    ],
  },
  {
    build: 186, date: "2026-07-22", title: "Import members stays inside the baseline",
    items: [
      { kind: "fixed", tool: "Conditional Access groups", text: "⑤ Import members offered every assignable group the scan knew — including ad-hoc groups only referenced by policies, so a persona named Global could auto-map to a Global-U-Exclude-MFA-P exclusion group by name coincidence. The target list (and the auto-mapping) is now restricted to baseline deployment-model groups — the bundled templates and the active catalogs — by default; a checkbox opts the remaining policy-referenced groups back in when you really mean one of them. Mappings you picked by hand are never overwritten by the toggle." },
    ],
  },
  {
    build: 185, date: "2026-07-22", title: "Pilot users, meet your groups",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "⑤ Import members — bulk-add deployment-test users to the CA groups from a CSV, the browser equivalent of the Add-UsersToCAGroup PowerShell script. A UPN column is enough; with a Persona column (multi-persona cells split on , ; | or spaces) every user is auto-routed to the mapped group, pre-matched against the tenant's group names — including abbreviated conventions (internals → …-INT). Users are resolved, existing memberships pre-checked (already-members are skipped, not re-added), and nothing is written until an explicit review step. Dynamic groups are excluded — Entra manages those memberships. Produces a Markdown change report per group. Consents Group.ReadWrite.All on demand." },
      { kind: "improved", tool: "Sign-in failures", text: "Out of BETA." },
    ],
  },
  {
    build: 184, date: "2026-07-22", title: "From a failure to the policy in one click",
    items: [
      { kind: "improved", tool: "Sign-in failures", text: "Policy names are now links that open the policy's card — the same card as in List Policies, with the What-if flow and per-policy actions — from the Per policy table, the pinned label, and the failed-policy lines of an expanded sign-in. Log → policy card → What-If: the whole trace of a failed sign-in without leaving the tool." },
    ],
  },
  {
    build: 183, date: "2026-07-22", title: "Which policy was I reading again?",
    items: [
      { kind: "fixed", tool: "Sign-in failures", text: "Expanding a policy with dozens of sign-ins scrolled the policy's own row — and with it the name — off screen. The expanded list now carries a pinned label with the policy name, sign-in count and unmet controls that stays just below the toolbar while you scroll through it, with an ✕ to collapse the policy from wherever you are." },
    ],
  },
  {
    build: 182, date: "2026-07-22", title: "Help finds its headings again",
    items: [
      { kind: "fixed", tool: "Help", text: "Clicking a section chip in the Help table of contents could scroll the section's heading underneath the ToC itself. The ToC is sticky and wraps to more rows as tools are added — with the Sign-in failures chip it crossed onto a third row at common window widths, and the fixed scroll offset no longer covered it. The jump (and the scroll-spy highlight) now measure the ToC's actual height instead of assuming it." },
    ],
  },
  {
    build: 181, date: "2026-07-22", title: "The sign-in log joins the toolbox",
    items: [
      { kind: "new", tool: "Sign-in failures", text: "New tool. Reads the Entra sign-in log and shows which sign-ins Conditional Access failed and which policy did it — grouped per policy, so the policy generating the noise sits on top, with distinct users, affected apps and the grant controls that weren't met. Two modes: Enforced (conditionalAccessStatus = failure, filtered by Graph) and Report-only (policies that would have failed — the sign-ins complete, so the window is read and filtered in the browser, capped at 10 000). Any logged sign-in can be replayed in What-If with one click — user, app, platform, client, IP, country and device state prefilled — so the log tells you which policy failed and What-If tells you why. Exports: CSV with one line per sign-in × failing policy (pivot-table and SIEM friendly) and a per-policy Markdown report. Needs AuditLog.Read.All, requested when you run it." },
    ],
  },
  // Build 180 ("One file to rebrand a fork", js/branding.js) is deliberately
  // not listed. This changelog is what a tenant-side reader sees; how the repo
  // is re-skinned for a fork is not their release note. The capability is
  // documented in README.md under "Rebranding a fork".
  {
    build: 179, date: "2026-07-22", title: "Make dynamic: a create that was not a create",
    items: [
      { kind: "fixed", tool: "Conditional Access groups", text: "⟳ Make dynamic could report success while doing damage. Group creation reuses a group of the same name if it finds one, and the directory is eventually consistent — so straight after the rename the lookup still returned the OLD group and handed back its id. The add and remove steps then ran against the same id, which stripped the group from every policy it was assigned to instead of replacing it. Creation is now forced (no name reuse) and, as a second guard, the run aborts and rolls the rename back if the new group ever comes back with the id of the old one — before any policy is touched. The change report now prints both ids. If you ran this on build 178 and the two ids in the report are identical, the group's policy assignments were removed: re-add it with Assign → ADD to EXCLUDE." },
    ],
  },
  {
    build: 178, date: "2026-07-22", title: "Convert a group to dynamic membership",
    items: [
      { kind: "new", tool: "Conditional Access groups", text: "⟳ Make dynamic on any group the template says should be dynamic but the tenant has as assigned. A plain security group is converted in place — same id, so every policy, app and role assignment keeps pointing at it. A role-assignable group cannot be dynamic at all (Entra makes the two mutually exclusive, and isAssignableToRole is immutable), so it is replaced: the old group is renamed -static-YYYYMMDD and kept as the rollback, a dynamic group is created under the original name, added to every policy that referenced the old one, and only then is the old one removed from those policies — so no policy is left without either group mid-flight. Typed confirmation, a step-by-step log and a change report, and the warning that the replacement is not role-assignable." },
    ],
  },
  {
    build: 177, date: "2026-07-22", title: "Clear a search in one click",
    items: [
      { kind: "improved", tool: "All tools", text: "Every search box now has a × to clear it — all eight of them, from the policy list to Change audit — and Escape does the same while the box has focus. It appears only when there is something to clear." },
    ],
  },
  {
    build: 176, date: "2026-07-22", title: "Named locations: a report per location, and config snapshots",
    items: [
      { kind: "new", tool: "Named locations", text: "Click a location name — in cards or the table — to open its report: every range or country, what the trusted flag actually means for it, and the full list of policies that name it plus the ones covering it via “All trusted locations”, each clickable through to the policy card. The cards now only summarise usage, so eighteen policy names no longer fill them." },
      { kind: "new", tool: "Named locations", text: "📄 Documentation (MD) writes up a single location on its own, next to the existing whole-inventory export." },
      { kind: "new", tool: "Named locations", text: "⭳ Export JSON saves the configuration of every location, and ⇄ Compare loads an earlier export back to show what moved: changed ranges, countries or trusted flags, locations that have since been deleted, and ones created since. Matched by display name, with a Markdown export of the differences." },
    ],
  },
  {
    build: 175, date: "2026-07-22", title: "An unknown app no longer costs you the whole policy",
    items: [
      { kind: "fixed", tool: "Import", text: "A policy that excludes a Microsoft first-party app this tenant has no service principal for — the Defender apps the baseline exempts, for instance — was rejected outright by Graph with a bare 400, losing the policy. If the service principal cannot be created, the importer now retries once without that reference and the policy lands (Off). Every drop is listed in the change report, with the warning that a dropped exclusion makes the policy apply more widely than the source did." },
      { kind: "improved", tool: "Import", text: "A 400 now names the specific application it could not resolve — “no service principal for MicrosoftDefenderATP XPlat (a3b7…)” instead of “references 2 application(s) by id”." },
    ],
  },
  {
    build: 174, date: "2026-07-22", title: "Named locations: tighter cards and a table view",
    items: [
      { kind: "improved", tool: "Named locations", text: "Cards are smaller and now tile in a grid — at least two side by side, more on a wide screen — with the Edit and Delete buttons on their own row and the policy list capped so one location used by thirty policies cannot stretch its card past the rest." },
      { kind: "new", tool: "Named locations", text: "A Table view next to Cards: name, type, definition, which policies use it (named or via “All trusted”) and the actions, one line per location. On a tenant with dozens of locations this is the view you actually want." },
    ],
  },
  {
    build: 173, date: "2026-07-22", title: "CA validator: open the policy from the report",
    items: [
      { kind: "improved", tool: "CA validator", text: "Click a policy name in the validation report — compact or detailed view — and its full policy card opens, so you can check the actual assignment behind a simulated result without leaving the tool. In the detailed view the rest of the header still collapses the table." },
      { kind: "improved", tool: "CA validator", text: "Out of BETA: it now carries the NEW badge, like What-If and Change audit." },
    ],
  },
  {
    build: 172, date: "2026-07-22", title: "Change audit leaves BETA",
    items: [
      { kind: "improved", tool: "Change audit", text: "Out of BETA — it has proven itself on a large tenant (thousands of entries, summary roll-up, snapshot compare), so it now carries the same NEW badge as What-If. Nothing about how it works changed." },
    ],
  },
  {
    build: 171, date: "2026-07-22", title: "CA Doc is now ENCA — new name, new address",
    items: [
      { kind: "improved", tool: "All tools", text: "The toolset is renamed ENCA (Entra Conditional Access) and now lives at enca.limon-it.nl. cadoc.limon-it.nl redirects, so old bookmarks and the footer on documents you generated earlier keep working. Nothing about your tenant changes: the app registration keeps the same application ID, so no one has to consent again." },
      { kind: "fixed", tool: "Change audit", text: "Audit snapshots exported under the old name (schema cadoc-audit/1) still load for comparison — the rename does not orphan the history you already collected." },
      { kind: "fixed", tool: "All tools", text: "Arriving for the first time no longer opens the whole changelog at once, just the newest release. This matters right now because the new address is a new origin, so every browser looks like a first visit." },
    ],
  },
  {
    build: 170, date: "2026-07-22", title: "Workload ID licence check and post-import housekeeping",
    items: [
      { kind: "improved", tool: "Import", text: "Conditional Access for workload identities needs the separately purchased Microsoft Entra Workload ID licence, which is not part of Entra ID P1 or P2. The importer now reads the tenant's subscriptions first: without that licence the CA900-range policies are marked 🔒 and left out entirely instead of being attempted and rejected by Graph with a bare 400. The change report says which ones were held back and how to get the licence." },
      { kind: "new", tool: "List Policies", text: "🧹 Housekeeping — a match & replace import leaves the version it supersedes in place, switched Off, as your rollback, and nothing ever cleaned those up. The button appears when such policies exist, lists each one next to the policy that replaced it, and hands the ones you tick to the normal delete flow with its JSON backup and typed confirmation." },
    ],
  },
  {
    build: 169, date: "2026-07-21", title: "Imports that were failing with a bare 400",
    items: [
      { kind: "fixed", tool: "Import", text: "Policies that exclude Microsoft first-party apps — Defender for Endpoint, Defender for Mobile TVM, Device Registration Service — failed with an unexplained 400 on tenants that had never used those apps, because a policy can only name an application that has a service principal here. The importer now checks every referenced app up front and creates the missing service principals before importing." },
      { kind: "fixed", tool: "Import", text: "Workload-identity policies no longer have a persona deploy group forced onto them. Graph rejects a policy that carries both a service-principal scope and a user scope, which is why the WorkloadIDs policies failed; their assignment is now kept as-is, like E-Admins." },
      { kind: "improved", tool: "Import", text: "A 400 from Graph now names the likely cause — app references needing a service principal, a workload-identity scope conflict, insider risk, or a terms of use that must exist first — instead of just the raw error." },
    ],
  },
  {
    build: 168, date: "2026-07-21", title: "A clearer home button",
    items: [
      { kind: "improved", tool: "All tools", text: "Both home controls — the icon in the tab bar and the Tools button in the header — now use a drawn house icon instead of a glyph, bigger and easier to hit, and the tab-bar one highlights when you are on the tools page." },
    ],
  },
  {
    build: 166, date: "2026-07-21", title: "The selection bar sits where it should",
    items: [
      { kind: "fixed", tool: "List Policies", text: "The green selection bar overlapped the toolbar whenever the toolbar wrapped to a second row — searching, or a narrower window, was enough to trigger it. Its position is now measured from the toolbar's real height, and it wraps rather than clipping its own buttons." },
    ],
  },
  {
    build: 165, date: "2026-07-21", title: "Audit snapshots you can compare against",
    items: [
      { kind: "new", tool: "Change audit", text: "Export the current read as JSON, then load that snapshot on a later run to see what has happened since. Entra only keeps about 30 days of audit log and nothing is stored server-side, so exporting is how you build real history: new entries are badged and filterable, and anything the snapshot holds that Entra has since dropped is listed separately — at that point your export is the only copy." },
    ],
  },
  {
    build: 164, date: "2026-07-21", title: "A readable change audit on busy tenants",
    items: [
      { kind: "improved", tool: "Change audit", text: "Opens on a Summary view that rolls the log up per resource — one row per policy or group with how many adds, removes and updates it saw, how many distinct people moved, and who did it. On a large tenant that turns thousands of near-identical entitlement-management events into a handful of readable rows; click one for the individual changes, or switch to Timeline for the raw feed." },
    ],
  },
  {
    build: 163, date: "2026-07-21", title: "Change audit defaults and a read that holds",
    items: [
      { kind: "improved", tool: "Change audit", text: "Defaults to the last 7 days." },
      { kind: "fixed", tool: "Change audit", text: "A read in progress now survives switching tabs — come back and it is still running, or already finished, instead of showing the Run button again and starting a second read." },
    ],
  },
  {
    build: 162, date: "2026-07-21", title: "Auditing exclusion group membership",
    items: [
      { kind: "new", tool: "Change audit", text: "Also watches membership of the groups your policies include or exclude. Adding someone to an exclusion group widens a bypass without any policy being edited, so it never appears as a policy change — those additions and removals are now listed alongside, showing who was moved, to which group, by whom, and which policies that group exempts them from." },
    ],
  },
  {
    build: 161, date: "2026-07-21", title: "What's new, and a changelog page",
    items: [
      { kind: "new", tool: "What's new", text: "A “What's new” overlay after sign-in showing only what has landed since your last visit, and a full changelog page listing every release — reachable from its own tile, the tab bar, or by clicking the build number in the footer." },
    ],
  },
  {
    build: 160, date: "2026-07-21", title: "Setup script covers the audit permission",
    items: [
      { kind: "fixed", tool: "Setup", text: "The app-registration script now registers and consents AuditLog.Read.All, so Change audit works after a fresh setup. Re-run it against your existing app to add the permission." },
    ],
  },
  {
    build: 159, date: "2026-07-21", title: "Session-only policies are simulated",
    items: [
      { kind: "improved", tool: "CA validator", text: "Policies with only session controls are simulated instead of skipped — sign-in frequency, persistent browser, token protection, app-enforced restrictions, MDA app control and CAE now appear as expected controls carrying their configured value. Only a policy with no controls at all is skipped." },
      { kind: "improved", tool: "CA validator", text: "Both views group policies by persona." },
    ],
  },
  {
    build: 158, date: "2026-07-21", title: "Change audit, and sections on the home page",
    items: [
      { kind: "new", tool: "Change audit", text: "New tool. Reads the Entra directory audit log and shows who changed which Conditional Access resource, when, and exactly what changed — a field-level diff (state: report-only → enabled, one group added to an exclusion) rather than a wall of JSON. Covers policies, named locations, authentication strengths and contexts, and terms of use, with the actor and their source IP. Needs the AuditLog.Read.All permission, requested when you run it." },
      { kind: "improved", tool: "All tools", text: "The tools home page is grouped into sections — explore and document, analyse and simulate, compare against a baseline, manage the tenant — now that the tool count has grown." },
    ],
  },
  {
    build: 157, date: "2026-07-21", title: "Exclusion risk review",
    items: [
      { kind: "new", tool: "Exclusion analyzer", text: "New Risk review: every policy with exclusions scored for governance — privileged roles or all guests excluded, direct user exclusions, oversized exclusion lists, stale disabled accounts (including ones sitting inside an excluded group) and report-only exclusions — worst first, with the reasoning. Flag patterns follow Tiago S. Carvalho's CA exclusions audit." },
    ],
  },
  {
    build: 156, date: "2026-07-21", title: "Leaner group lookups",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "A scope selector, defaulting to only the groups your policies actually reference, so a big tenant no longer looks up every template and baseline group. The member scan is now a picker — read the groups you care about instead of all of them, since each one costs a Graph call." },
    ],
  },
  {
    build: 155, date: "2026-07-21", title: "Named location usage fixed",
    items: [
      { kind: "fixed", tool: "Named locations", text: "Locations consumed through “All trusted locations” were reported as unused — nearly every trusted location in a real tenant. That implicit coverage is now resolved and labelled separately from a direct reference." },
      { kind: "improved", tool: "Named locations", text: "Global Secure Access compliant-network locations are recognised as their own type instead of being shown as IP ranges, and marked service-managed." },
    ],
  },
  {
    build: 154, date: "2026-07-21", title: "The exclusion matrix keeps its headers",
    items: [
      { kind: "fixed", tool: "Exclusion analyzer", text: "The policy column headers and the exclusion column stay pinned while you scroll the matrix, so you can always tell which policy a mark belongs to." },
    ],
  },
  {
    build: 152, date: "2026-07-21", title: "Named locations",
    items: [
      { kind: "new", tool: "Named locations", text: "New tool. View, create, edit and delete the IP-range and country named locations your policies target, and see which policies use each one. Validates CIDR (IPv4 and IPv6) and ISO country codes, warns when changing the trusted flag would move policies that use “All trusted locations”, and requires a typed confirmation before deleting a location a policy still references." },
    ],
  },
  {
    build: 151, date: "2026-07-21", title: "Group members, and a cleaner Gap analyse",
    items: [
      { kind: "improved", tool: "Exclusion analyzer", text: "A group's member count is now a link that opens the member list with UPNs, plus a CSV export." },
      { kind: "fixed", tool: "Gap analyse", text: "The policy list's green action bar no longer sits on top of the analysis output, and the policy-only search and filters are hidden in that view." },
    ],
  },
  {
    build: 148, date: "2026-07-21", title: "What-If",
    items: [
      { kind: "new", tool: "What-If", text: "New tool. Describe a sign-in — user, target resource, platform, client app, IP or country, device state and risk — and every enabled or report-only policy is evaluated against it: which apply, with the grant and session controls to satisfy, and which do not, each with the first condition that wasn't met. Mirrors the Entra What If tool." },
    ],
  },
  {
    build: 147, date: "2026-07-21", title: "Validator scoping made complete",
    items: [
      { kind: "fixed", tool: "CA validator", text: "Running against a persona group now shows the catch-all policies that reach it alongside its own, honours exclusions on a group it is nested inside, and lists the policies that do not reach it with the reason rather than dropping them silently." },
    ],
  },
  {
    build: 146, date: "2026-07-21", title: "Baseline diffs and target autocomplete",
    items: [
      { kind: "improved", tool: "Baseline Policies", text: "A Changes column shows what a newer baseline version actually changes against the deployed policy — added and removed assignments, and grant or session control differences." },
      { kind: "improved", tool: "CA validator", text: "The “Run against” box suggests matching groups and users as you type." },
    ],
  },
  {
    build: 145, date: "2026-07-21", title: "A compact validator view",
    items: [
      { kind: "improved", tool: "CA validator", text: "Opens on a Compact view — one summary card per policy showing what it enforces, on which apps, clients and conditions, and who it does not apply to — instead of every simulation as its own row. Detailed keeps the full grid." },
    ],
  },
  {
    build: 144, date: "2026-07-21", title: "Results that stick around",
    items: [
      { kind: "improved", tool: "All tools", text: "The Exclusion analyzer, Best-practice checks and CA validator no longer re-scan every time you come back to their tab — the result is cached, with a Run button to start and Rescan to refresh." },
      { kind: "improved", tool: "All tools", text: "A close-all-tabs button in the tab bar, and Help moved to the end of the tool list." },
      { kind: "fixed", tool: "All tools", text: "Mobile: filter chips and the validator's target row wrap properly, and wide report tables scroll inside their own container instead of pushing the page off-screen." },
    ],
  },
  {
    build: 143, date: "2026-07-21", title: "Run the validator against one persona",
    items: [
      { kind: "new", tool: "CA validator", text: "A “Run against” box scopes the whole report to a single persona group or user — only the policies that actually apply to that principal, with their group and role membership taken into account." },
    ],
  },
  {
    build: 142, date: "2026-07-21", title: "CA validator",
    items: [
      { kind: "new", tool: "CA validator", text: "New tool. For each policy, the sign-in simulations it implies and the control each one should — or should not — enforce, with the excluded side inverted to prove the policy does not fire there. Ported from Jasper Baes' Conditional Access Validator." },
    ],
  },
  {
    build: 140, date: "2026-07-21", title: "Help as a proper tool",
    items: [
      { kind: "new", tool: "Help", text: "Help is a full tool with its own page and tab, documenting every tool, each option and what to expect from it, with a sticky table of contents that follows you as you scroll." },
    ],
  },
  {
    build: 137, date: "2026-07-21", title: "Smarter imports",
    items: [
      { kind: "new", tool: "Import", text: "Choose an assignment mode: deploy new policies onto the persona deploy groups, or match & replace — a policy already in the tenant keeps its current assignment and state, gains any new exclusion groups the update adds, and the superseded version is switched Off." },
    ],
  },
  {
    build: 132, date: "2026-07-21", title: "Click to filter the exclusion matrix",
    items: [
      { kind: "improved", tool: "Exclusion analyzer", text: "Click a user or group row, or a policy column, to filter the matrix down to what is actually in scope and drop the empty cells." },
    ],
  },
  {
    build: 131, date: "2026-07-21", title: "Baseline groups and the R26.6 catalog",
    items: [
      { kind: "improved", tool: "Conditional Access groups", text: "One-click create for a missing baseline group, including TeamsSharedDevices as a dynamic group with the Teams Rooms membership rule, and a recreate path for a group that should be role-assignable but isn't." },
      { kind: "improved", tool: "Baseline Policies", text: "Catalog updated to the 2026-07-21 R26.6 export, including the new TeamsSharedDevices exclusion on the global session and risk policies." },
    ],
  },
];

// The newest build that has changelog copy — what the overlay compares against.
const CHANGELOG_LATEST = CHANGELOG.length ? CHANGELOG[0].build : 0;
