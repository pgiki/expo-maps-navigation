const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const escape = (value) => value.replace(/[/\\]/g, '[/\\\\]');

const config = getDefaultConfig(projectRoot);

// Only watch the library source — not the library's node_modules.
config.watchFolders = [path.resolve(workspaceRoot, 'src')];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

// Prevent Metro from pulling a second React/RN from the library root.
config.resolver.blockList = [
  new RegExp(`${escape(workspaceRoot)}[/\\\\]node_modules[/\\\\].*`),
];

config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'react-native-svg': path.resolve(projectRoot, 'node_modules/react-native-svg'),
  'react-native-safe-area-context': path.resolve(
    projectRoot,
    'node_modules/react-native-safe-area-context'
  ),
  expo: path.resolve(projectRoot, 'node_modules/expo'),
  'expo-maps': path.resolve(projectRoot, 'node_modules/expo-maps'),
  'expo-location': path.resolve(projectRoot, 'node_modules/expo-location'),
  'expo-speech': path.resolve(projectRoot, 'node_modules/expo-speech'),
  'expo-image': path.resolve(projectRoot, 'node_modules/expo-image'),
  'expo-keep-awake': path.resolve(projectRoot, 'node_modules/expo-keep-awake'),
  'lucide-react-native': path.resolve(
    projectRoot,
    'node_modules/lucide-react-native'
  ),
  '@turf/helpers': path.resolve(projectRoot, 'node_modules/@turf/helpers'),
  '@turf/nearest-point-on-line': path.resolve(
    projectRoot,
    'node_modules/@turf/nearest-point-on-line'
  ),
  '@turf/bearing': path.resolve(projectRoot, 'node_modules/@turf/bearing'),
  '@turf/distance': path.resolve(projectRoot, 'node_modules/@turf/distance'),
};

module.exports = config;
