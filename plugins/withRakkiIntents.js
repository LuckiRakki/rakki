// Rakki 2.0: App Intents for the Control Center and Lock Screen controls.
//
// - plugins/rakki-intents/RakkiIntents.swift (the intents) goes into the app target, so the
//   system can run them in Rakki's process without opening it (AudioPlaybackIntent), and into
//   the widget extension, which the controls live in.
// - plugins/rakki-intents/RakkiControls.swift (the iOS 18 controls) goes into the extension,
//   and its RakkiControls bundle is added to the extension's widget bundle.
//
// expo-widgets writes the extension's sources (ios/ExpoWidgetsTarget) on every prebuild and
// adds only its own files to the Xcode target, so the extension's part is added to its
// index.swift, which is already in the target.
//
// List this plugin BEFORE expo-widgets in app.json: Expo runs the mods of later plugins first,
// so this one then sees the files expo-widgets wrote instead of having them replaced.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const TARGET = 'ExpoWidgetsTarget';
const MARK = '// ---- Rakki intents and controls (plugins/withRakkiIntents.js) ----';
const SOURCES = path.join(__dirname, 'rakki-intents');

function read(name) {
  return fs.readFileSync(path.join(SOURCES, name), 'utf8');
}

/** A Swift file's import lines and the rest, so imports can go to the top of the file it joins. */
function split(source) {
  const imports = [];
  const body = [];
  for (const line of source.split('\n')) {
    if (/^\s*import\s+\w+/.test(line)) imports.push(line.trim());
    else body.push(line);
  }
  return { imports, body: body.join('\n').trim() };
}

function addToExtension(index) {
  if (index.includes(MARK)) return index;
  const intents = split(read('RakkiIntents.swift'));
  const controls = split(read('RakkiControls.swift'));
  const existing = new Set(index.split('\n').filter((l) => /^\s*(internal\s+)?import\s+/.test(l)).map((l) => l.trim().replace(/^internal\s+/, '')));
  const imports = [...new Set([...intents.imports, ...controls.imports])].filter((l) => !existing.has(l));
  // The controls join the last part of the widget bundle (expo-widgets ends it with the Live Activity).
  const bundled = index.replace(
    /^(\s*)WidgetLiveActivity\(\)\s*$/m,
    (line, indent) => `${line}\n${indent}if #available(iOS 18.0, *) {\n${indent}  RakkiControls().body\n${indent}}`,
  );
  if (bundled === index) throw new Error('withRakkiIntents: could not find the widget bundle in ExpoWidgetsTarget/index.swift');
  return `${imports.join('\n')}\n${bundled}\n\n${MARK}\n\n${intents.body}\n\n${controls.body}\n`;
}

module.exports = function withRakkiIntents(config) {
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const { platformProjectRoot, projectName } = config.modRequest;
      // The app's copy of the intents.
      fs.writeFileSync(path.join(platformProjectRoot, projectName, 'RakkiIntents.swift'), read('RakkiIntents.swift'));
      // The extension's: into the index.swift expo-widgets just wrote.
      const index = path.join(platformProjectRoot, TARGET, 'index.swift');
      if (fs.existsSync(index)) fs.writeFileSync(index, addToExtension(fs.readFileSync(index, 'utf8')));
      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const { projectName } = config.modRequest;
    const project = config.modResults;
    const filepath = `${projectName}/RakkiIntents.swift`;
    if (!project.hasFile(filepath)) {
      // The app target by name: the widget extension has a Sources phase too.
      const [targetUuid] = IOSConfig.Target.findNativeTargetByName(project, projectName);
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: projectName, project, targetUuid });
    }
    return config;
  });

  return config;
};
