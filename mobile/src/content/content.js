/**
 * 复用仓库根的纯解析模块（设计文档 §5.2：contentModel 零依赖零 DOM，原样搬）。
 * Metro 的 watchFolders 指向仓库根，所以这里可以直接 import 项目外的文件。
 */
export * from '../../../src/demo/contentModel.js';
