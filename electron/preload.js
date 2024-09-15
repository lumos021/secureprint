const { contextBridge, ipcRenderer } = require('electron');

// Define allowed channels for security
const validChannels = [
  'log-message',
  'printer-list',
  'queue-update',
  'dark-mode-changed',
  'register-client',
  'auth-status',
  'reconnect-websocket',
  'token-refreshed',
  'check-token'
];

contextBridge.exposeInMainWorld('electron', {
  receive: (channel, func) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  send: (channel, data) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  invoke: (channel, data) => {
    const validInvokeChannels = [
      'request-printer-list',
      'toggle-dark-mode',
      'select-printer',
      'cancel-job',
      'check-registration',
      'register-client',
      'refresh-token',
      'check-token'
    ];
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Invalid channel: ${channel}`));
  },
  
  requestPrinterList: () => ipcRenderer.invoke('request-printer-list'),
  toggleDarkMode: (isDarkMode) => ipcRenderer.invoke('toggle-dark-mode', isDarkMode),
  selectPrinter: (printerName) => ipcRenderer.invoke('select-printer', printerName),
  cancelJob: (jobId) => ipcRenderer.invoke('cancel-job', jobId),
  
  // New methods for registration and authentication
  checkRegistration: () => ipcRenderer.invoke('check-registration'),
  registerClient: (data) => ipcRenderer.invoke('register-client', data),
  refreshToken: () => ipcRenderer.invoke('refresh-token'),
  checkToken: () => ipcRenderer.invoke('check-token'),
});
