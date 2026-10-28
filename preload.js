// Bridge between the pet page and the main process (window, menus, save file).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  loadSprites: () => ipcRenderer.invoke('sprites'),
  workAreas: () => ipcRenderer.invoke('screens'),
  cursor: () => ipcRenderer.invoke('cursor'),
  onWorkAreas: cb => ipcRenderer.on('screens', (_, areas) => cb(areas)),
  move: (x, y) => ipcRenderer.send('move', x, y),
  mouseThrough: on => ipcRenderer.send('mouse-through', on),
  menu: settings => ipcRenderer.send('menu', settings),
  onAction: cb => ipcRenderer.on('action', (_, a) => cb(a)),
  load: () => ipcRenderer.invoke('load'),
  save: state => ipcRenderer.send('save', state),
  diary: day => ipcRenderer.send('diary', day),
});
