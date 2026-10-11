const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    googleLogin: () => ipcRenderer.invoke('google-login')
});