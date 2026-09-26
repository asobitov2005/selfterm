const { contextBridge, ipcRenderer } = require('electron');

function on(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('selfterm', {
  getVault: () => ipcRenderer.invoke('vault:get'),
  saveHost: (host) => ipcRenderer.invoke('vault:save-host', host),
  deleteHost: (hostId) => ipcRenderer.invoke('vault:delete-host', hostId),
  saveSettings: (settings) => ipcRenderer.invoke('vault:save-settings', settings),
  selectKey: () => ipcRenderer.invoke('dialog:select-key'),
  syncPush: (payload) => ipcRenderer.invoke('sync:push', payload),
  syncPull: (payload) => ipcRenderer.invoke('sync:pull', payload),
  connect: (payload) => ipcRenderer.invoke('ssh:connect', payload),
  write: (payload) => ipcRenderer.invoke('ssh:write', payload),
  resize: (payload) => ipcRenderer.invoke('ssh:resize', payload),
  disconnect: (sessionId) => ipcRenderer.invoke('ssh:disconnect', sessionId),
  onData: (callback) => on('ssh:data', callback),
  onStatus: (callback) => on('ssh:status', callback),
  onError: (callback) => on('ssh:error', callback),
  onVaultChanged: (callback) => on('vault:changed', callback),
});
