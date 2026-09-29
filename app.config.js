// Build variants on top of app.json. APP_VARIANT=development makes "Rakki Dev": its own name
// and bundle id, so the dev build (loads code live from the PC) and the everyday build can be
// installed side by side.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'development') return config;
  return {
    ...config,
    name: 'Rakki Dev',
    ios: { ...config.ios, bundleIdentifier: `${config.ios.bundleIdentifier}.dev` },
    android: { ...config.android, package: `${config.android.package}.dev` },
  };
};
