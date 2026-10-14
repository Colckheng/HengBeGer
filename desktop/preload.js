'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hengberger', {
  state: () => ipcRenderer.invoke('desktop:state'),
  saveServer: (url) => ipcRenderer.invoke('desktop:save-server', url),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  quit: () => ipcRenderer.invoke('desktop:quit'),
});
