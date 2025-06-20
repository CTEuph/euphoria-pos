"use strict";
const electron = require("electron");
const electronAPI = {
  auth: {
    verifyPin: (pin) => electron.ipcRenderer.invoke("auth:verify-pin", pin),
    logout: () => electron.ipcRenderer.invoke("auth:logout"),
    getCurrentEmployee: () => electron.ipcRenderer.invoke("auth:get-current-employee"),
    checkAuthenticated: () => electron.ipcRenderer.invoke("auth:check-authenticated")
  }
};
electron.contextBridge.exposeInMainWorld("electron", electronAPI);
