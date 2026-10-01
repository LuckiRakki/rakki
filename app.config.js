// Build variants on top of app.json. APP_VARIANT=development makes "Rakki Dev": its own name
// and bundle id, so the dev build (loads code live from the PC) and the everyday build can be
// installed side by side.
//
// RAKKI_UPDATE / RAKKI_COMMIT are set by the over-the-air publish workflow, so each update
// carries its number and commit (shown in Settings → About). The app version itself only
// changes with a new native build.
module.exports = ({ config }) => {
  const withBuild = {
    ...config,
    extra: {
      ...config.extra,
      build: {
        update: process.env.RAKKI_UPDATE ? Number(process.env.RAKKI_UPDATE) : null,
        commit: process.env.RAKKI_COMMIT ? process.env.RAKKI_COMMIT.slice(0, 7) : null,
      },
    },
  };
  if (process.env.APP_VARIANT !== 'development') return withBuild;
  return {
    ...withBuild,
    name: 'Rakki Dev',
    ios: { ...config.ios, bundleIdentifier: `${config.ios.bundleIdentifier}.dev` },
    android: { ...config.android, package: `${config.android.package}.dev` },
  };
};
