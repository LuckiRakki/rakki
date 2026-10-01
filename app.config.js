// Build variants on top of app.json. APP_VARIANT=development makes "Rakki Dev": its own name
// and bundle id, so the dev build (loads code live from the PC) and the everyday build can be
// installed side by side.
//
// RAKKI_UPDATE / RAKKI_COMMIT are set by the over-the-air publish workflow, so each update
// carries its number and commit (shown in Settings → About). Left out entirely when not set:
// the embedded config turns null into {}.
//
// expo.version (app.json) is Rakki's version, a.b.c: a = big releases, b = new features and
// UI, c = fixes. It ships with every update. runtimeVersion is separate: it names the native
// build an update needs, and only changes with a new native build (see update.yml).
module.exports = ({ config }) => {
  const build = {};
  if (process.env.RAKKI_UPDATE) build.update = Number(process.env.RAKKI_UPDATE);
  if (process.env.RAKKI_COMMIT) build.commit = process.env.RAKKI_COMMIT.slice(0, 7);
  const withBuild = { ...config, extra: { ...config.extra, build } };
  if (process.env.APP_VARIANT !== 'development') return withBuild;
  return {
    ...withBuild,
    name: 'Rakki Dev',
    ios: { ...config.ios, bundleIdentifier: `${config.ios.bundleIdentifier}.dev` },
    android: { ...config.android, package: `${config.android.package}.dev` },
  };
};
