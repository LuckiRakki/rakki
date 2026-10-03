// Liquid Glass alternate icons. expo-alternate-app-icons only makes flat .appiconset
// alternates; iOS 26 (Xcode 26) also takes Icon Composer .icon files as alternates. This copies
// each .icon into the native project as a resource and adds its name to the alternate icon
// names that expo-alternate-app-icons already set.
//
// List this plugin BEFORE expo-alternate-app-icons in app.json: Expo runs the project mods of
// later plugins first, so this one then adds to that plugin's names instead of being replaced.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const PROPERTY = 'ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES';

const iconName = (file) => path.basename(file, '.icon');

function namesIn(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).replace(/^"|"$/g, '').split(/\s+/);
  return list.map((n) => String(n).replace(/^"|"$/g, '')).filter(Boolean);
}

module.exports = function withGlassAlternateIcons(config, { icons = [] } = {}) {
  if (!icons.length) return config;

  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const { projectRoot, platformProjectRoot, projectName } = config.modRequest;
      const target = path.join(platformProjectRoot, projectName);
      for (const icon of icons) {
        const source = path.join(projectRoot, icon);
        if (!fs.existsSync(source)) throw new Error(`Glass icon not found: ${icon}`);
        await fs.promises.cp(source, path.join(target, path.basename(icon)), { recursive: true });
      }
      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const { projectName } = config.modRequest;
    for (const icon of icons) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: `${projectName}/${path.basename(icon)}`,
        groupName: projectName,
        project,
        isBuildFile: true,
        verbose: true,
      });
    }
    // Add to the flat alternates' names, on the app target's configurations only.
    const [, target] = IOSConfig.Target.findNativeTargetByName(project, projectName);
    const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(project, target.buildConfigurationList);
    for (const [, buildConfig] of configurations) {
      const settings = buildConfig.buildSettings;
      if (!settings) continue;
      const names = [...new Set([...namesIn(settings[PROPERTY]), ...icons.map(iconName)])];
      settings[PROPERTY] = `"${names.join(' ')}"`;
    }
    return config;
  });

  return config;
};
