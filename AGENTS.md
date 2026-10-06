# Rakki: project notes for coding agents

Read these first; they override the generic Expo guidance below where they differ.

- **Docs:** the plan and decisions are in `docs/FRAMEWORK.md`, what changed per version in
  `docs/CHANGELOG.md` (add an entry with every version bump; the a.b.c scheme is FRAMEWORK §10).
- **Builds don't use `eas build`.** iOS builds run on GitHub Actions (`.github/workflows/ios.yml`,
  variants `release` / `dev` / `check`), unsigned, and are installed with SideStore. JS changes
  ship as over-the-air updates: every push to `main` runs `update.yml` (`eas update`).
- **Native code** (`modules/rakki-audio`, native packages, app.json plugins) only reaches the
  phone with a new build; bump `runtimeVersion` in app.json when it changes.
- Native modules are guarded (`requireOptionalNativeModule`) so updates still run on older builds.
- Run `npm run typecheck` and `npm run lint` before declaring a task done.

---

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- **React Compiler and closures:** never write `x!.prop` (or `x.prop` on something that can be
  undefined) inside a function created in a component or hook, such as a `queryFn` or callback.
  The compiler reads a closure's dependencies while rendering, so `artist!.Name` with no artist
  throws during render. 1.6.2 crashed the app at launch this way. Read the value outside first
  (`const name = artist?.Name ?? ''`) and close over that.
- The app is wrapped in an error boundary (src/app/_layout.tsx): a render error shows its message
  and goes to the performance log instead of closing the app. Errors outside rendering (timers,
  native events) still close it.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
