// `npm run phone` — starts the Expo dev server on this PC's Tailscale address, so Expo Go
// (or the Rakki dev build) on the iPhone can connect from anywhere Tailscale is on, not
// just on home Wi-Fi. Extra arguments are passed through to `expo start` (e.g. --clear).
const { execSync, spawn } = require('node:child_process');

let host = '';
try {
  host = execSync('tailscale ip -4', { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
} catch {}
if (!host) {
  console.error('Could not read the Tailscale IP. Is Tailscale running on this PC?');
  process.exit(1);
}

console.log(`\nExpo Go URL: exp://${host}:8081  (scan the QR below with the iPhone camera)\n`);
const child = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: host },
});
child.on('exit', (code) => process.exit(code ?? 0));
