"use strict";
const electron = require("electron");
const electronAPI = {
  auth: {
    verifyPin: (pin) => electron.ipcRenderer.invoke("auth:verify-pin", pin),
    logout: () => electron.ipcRenderer.invoke("auth:logout"),
    getCurrentEmployee: () => electron.ipcRenderer.invoke("auth:get-current-employee"),
    checkAuthenticated: () => electron.ipcRenderer.invoke("auth:check-authenticated")
  },
  transaction: {
    complete: (dto) => electron.ipcRenderer.invoke("transaction:complete", dto),
    get: (transactionId) => electron.ipcRenderer.invoke("transaction:get", transactionId),
    recent: (limit) => electron.ipcRenderer.invoke("transaction:recent", limit),
    void: (transactionId, reason) => electron.ipcRenderer.invoke("transaction:void", transactionId, reason)
  }
};
electron.contextBridge.exposeInMainWorld("electron", electronAPI);
