// Rakki Dev (npm run app:dev) keeps itself up to date: every 30 seconds it fast-forwards the
// clone to GitHub's main, and the open window picks the change up (Vite for the interface,
// Tauri's watcher rebuilding and restarting the app for src-tauri). Only a fast-forward: local
// commits, another branch or uncommitted edits in the incoming files stop it with a warning,
// never a merge or a reset. The few changes that need Rakki Dev closed and reopened (new
// packages, the dev setup itself) show a notice in the app and the terminal (src/dev/DevNotice.tsx).
import { execFile } from 'node:child_process';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

const EVERY = 30_000;

export interface DevNotice {
  kind: 'updated' | 'restarting' | 'reopen' | 'warning';
  text: string;
}

/** Changes that only take effect after closing Rakki Dev (Ctrl+C) and running it again. */
const REOPEN = ['desktop/src-tauri/tauri.dev.conf.json'];
const DEPS = ['dependencies', 'devDependencies', 'overrides'] as const;

/** Kept on globalThis: Vite restarts itself (and re-runs this file) when its config changes. */
const state = globalThis as typeof globalThis & { __rakkiReopen?: DevNotice; __rakkiWarned?: string };

function git(root: string, ...args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile('git', args, { cwd: root, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, out, errOut) =>
      err ? reject(new Error((errOut || err.message).trim())) : resolve(out.trim()),
    ),
  );
}

async function depsOf(root: string, rev: string, file: string): Promise<string> {
  try {
    const pkg = JSON.parse(await git(root, 'show', `${rev}:${file}`));
    return JSON.stringify(DEPS.map((k) => pkg[k] ?? null));
  } catch {
    return '';
  }
}

/** What a pull from `from` to `to` needs from Lucki. */
async function whatChanged(root: string, from: string, to: string, files: string[]): Promise<DevNotice> {
  const short = to.slice(0, 7);
  const subject = await git(root, 'log', '-1', '--format=%s', to).catch(() => '');
  const what = subject ? `${short}: ${subject}` : short;

  const reasons: string[] = [];
  for (const pkg of ['package.json', 'desktop/package.json']) {
    if (files.includes(pkg) && (await depsOf(root, from, pkg)) !== (await depsOf(root, to, pkg))) {
      reasons.push(`new packages (run npm install in ${pkg === 'package.json' ? 'rakki' : 'rakki\\desktop'})`);
    }
  }
  if (files.includes('desktop/package.json') && !reasons.length) {
    const scripts = async (rev: string) => (await git(root, 'show', `${rev}:desktop/package.json`).then((s) => JSON.stringify(JSON.parse(s).scripts)).catch(() => ''));
    if ((await scripts(from)) !== (await scripts(to))) reasons.push('the dev scripts changed');
  }
  if (files.some((f) => REOPEN.includes(f))) reasons.push('the dev setup changed');
  if (reasons.length) {
    return { kind: 'reopen', text: `Pulled ${what}. Close Rakki Dev (Ctrl+C) and run npm run app:dev again: ${reasons.join(', ')}.` };
  }
  if (files.some((f) => f.startsWith('desktop/src-tauri/'))) {
    return { kind: 'restarting', text: `Pulled ${what}. Rakki Dev rebuilds and restarts on its own (Rust or app settings changed).` };
  }
  return { kind: 'updated', text: `Pulled ${what}. Updated live.` };
}

export function autoPull(): Plugin {
  return {
    name: 'rakki-autopull',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // Only Rakki Dev (tauri.dev.conf.json starts Vite in this mode), not plain `npm run dev`.
      if (server.config.mode !== 'app-dev') return;
      const root = path.join(server.config.root, '..');
      const log = server.config.logger;

      const tell = (notice: DevNotice) => {
        const line = `[auto-pull] ${notice.text}`;
        if (notice.kind === 'reopen' || notice.kind === 'warning') log.warn(line, { timestamp: true });
        else log.info(line, { timestamp: true });
        if (notice.kind === 'reopen') state.__rakkiReopen = notice;
        // A moment later, so a full page reload from the same pull doesn't swallow it.
        setTimeout(() => server.ws.send({ type: 'custom', event: 'rakki:dev', data: notice }), 2000);
      };
      /** Warnings once each, not every 30 seconds. */
      const warn = (text: string) => {
        if (state.__rakkiWarned === text) return;
        state.__rakkiWarned = text;
        tell({ kind: 'warning', text });
      };

      // A reloaded page (or one opened later) still sees a pending reopen.
      server.ws.on('connection', () => {
        if (state.__rakkiReopen) setTimeout(() => server.ws.send({ type: 'custom', event: 'rakki:dev', data: state.__rakkiReopen }), 1000);
      });

      let busy = false;
      const tick = async () => {
        if (busy) return;
        busy = true;
        try {
          const branch = await git(root, 'rev-parse', '--abbrev-ref', 'HEAD');
          if (branch !== 'main') return warn(`Not pulling: the clone is on ${branch}, not main.`);
          await git(root, 'fetch', '--quiet', 'origin', 'main');
          const from = await git(root, 'rev-parse', 'HEAD');
          const to = await git(root, 'rev-parse', 'origin/main');
          if (from === to) return;
          const ahead = await git(root, 'merge-base', '--is-ancestor', 'HEAD', 'origin/main').then(() => false, () => true);
          if (ahead) return warn('Not pulling: this clone has commits GitHub doesn’t. Push or sort them out, then it carries on.');
          try {
            await git(root, 'merge', '--ff-only', '--quiet', 'origin/main');
          } catch {
            return warn('Not pulling: uncommitted edits here touch the incoming files. Commit or undo them, then it carries on.');
          }
          state.__rakkiWarned = undefined;
          const files = (await git(root, 'diff', '--name-only', from, to)).split('\n').filter(Boolean);
          tell(await whatChanged(root, from, to, files));
        } catch (e) {
          // Offline or GitHub busy: next time.
          log.info(`[auto-pull] Couldn't check GitHub (${e instanceof Error ? e.message.split('\n')[0] : e}).`, { timestamp: true });
        } finally {
          busy = false;
        }
      };

      log.info('[auto-pull] On: following GitHub main every 30 seconds.', { timestamp: true });
      void tick();
      const id = setInterval(() => void tick(), EVERY);
      server.httpServer?.once('close', () => clearInterval(id));
    },
  };
}
