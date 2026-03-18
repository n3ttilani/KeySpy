const { ipcRenderer } = window.require('electron');

document.querySelector('[data-action="min"]')  .addEventListener('click', () => ipcRenderer.send('window-min'));
document.querySelector('[data-action="max"]')  .addEventListener('click', () => ipcRenderer.send('window-max'));
document.querySelector('[data-action="close"]').addEventListener('click', () => ipcRenderer.send('window-close'));