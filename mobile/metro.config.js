// Metro 默认只认项目目录；mobile/src/content/content.js 要 import 仓库根的纯解析模块，
// 所以把仓库根加进 watchFolders，并保留两份 node_modules 的查找路径。
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];
// 不覆盖 disableHierarchicalLookup：expo-doctor 明确要求用 expo/metro-config 的推荐值（false），
// 强行关掉向上查找会让共享模块解析不到依赖。
module.exports = config;
