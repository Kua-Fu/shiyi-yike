const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('catGuard', {
  getState: () => ipcRenderer.invoke('guard:state'),
  command: (action, value) => ipcRenderer.invoke('guard:command', action, value),
  subscribe: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('guard:update', listener);
    return () => ipcRenderer.removeListener('guard:update', listener);
  },
});
