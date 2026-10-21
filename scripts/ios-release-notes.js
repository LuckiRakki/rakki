// Writes the notes for the iPhone download page (the ios-latest GitHub Release) from
// docs/CHANGELOG.md: the current version, the updates that arrive over the air on top of the
// installed build, and what the native build itself brought. Run by the "iOS release page"
// workflow on every version bump and by "iOS build" after a release build, so the page never
// goes stale. `node scripts/ios-release-notes.js` prints the notes; the title is
// "Rakki <app.json version>".
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { version, runtimeVersion } = require(path.join(root, 'app.json')).expo;
const changelog = fs.readFileSync(path.join(root, 'docs/CHANGELOG.md'), 'utf8');
const REPO = 'https://github.com/LuckiRakki/rakki';

// Phone entries only ("## 1.22.2 (date)" or "## 1.15.0, native build (date)"); desktop and
// plugin entries have their own headings and are skipped.
const entries = [];
for (const section of changelog.split(/^## /m).slice(1)) {
  const [heading, ...rest] = section.split('\n');
  const m = heading.match(/^(\d+\.\d+\.\d+)(, native build)? \(/);
  if (!m) continue;
  // Join each bullet's wrapped lines into one.
  const bullets = rest
    .join('\n')
    .split(/^- /m)
    .slice(1)
    .map((b) => b.replace(/\s*\n\s*/g, ' ').trim());
  entries.push({ version: m[1], native: !!m[2], bullets });
}

// A bullet's headline: its bold lead if it has one, otherwise its first sentence.
function headline(bullet) {
  const bold = bullet.match(/^\*\*(.+?)\*\*/);
  const text = bold ? bold[1] : bullet.split(/(?<=\.) /)[0];
  return text.replace(/\*\*/g, '').replace(/\.$/, '');
}
// Desktop-only bullets inside a phone entry ("**Desktop: ...**", "**The desktop's ...**",
// "**... on the desktop.**").
const isDesktop = (bullet) =>
  /^\*\*(Desktop\b|The desktop)/.test(bullet) || /^\*\*[^*]*\bon the desktop\.?\*\*/.test(bullet);

const nativeIndex = entries.findIndex((e) => e.native && e.version === runtimeVersion);
const native = entries[nativeIndex];
const updates = nativeIndex < 0 ? entries : entries.slice(0, nativeIndex);

const lines = [
  `**Rakki ${version}** on the **${runtimeVersion} native build** (runtime ${runtimeVersion}). ` +
    'Install `Rakki.ipa` with SideStore over the existing app; your sign-in, downloads and ' +
    `settings stay. Already on the ${runtimeVersion} build? Nothing to install: the updates ` +
    'below arrive over the air when you open Rakki.',
  '',
  `**Download:** ${REPO}/releases/download/ios-latest/Rakki.ipa`,
];
const phoneUpdates = updates
  .map((e) => ({ ...e, bullets: e.bullets.filter((b) => !isDesktop(b)) }))
  .filter((e) => e.bullets.length);
if (phoneUpdates.length) {
  lines.push('', '## Over-the-air updates since this build');
  for (const e of phoneUpdates) {
    lines.push(`- **${e.version}**: ${e.bullets.map(headline).join('; ')}.`);
  }
}
if (native) {
  lines.push('', `## In the ${runtimeVersion} native build`);
  for (const b of native.bullets.filter((b) => !b.startsWith('A new `.ipa`'))) {
    lines.push(`- ${headline(b)}.`);
  }
}
lines.push('', `Full history: [docs/CHANGELOG.md](${REPO}/blob/main/docs/CHANGELOG.md)`);
console.log(lines.join('\n'));
