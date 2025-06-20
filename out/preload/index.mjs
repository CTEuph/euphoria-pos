import { contextBridge, ipcRenderer } from "electron";
const electronAPI = {
  auth: {
    verifyPin: (pin) => ipcRenderer.invoke("auth:verify-pin", pin),
    logout: () => ipcRenderer.invoke("auth:logout"),
    getCurrentEmployee: () => ipcRenderer.invoke("auth:get-current-employee")
  },
  database: {
    getProducts: () => ipcRenderer.invoke("db:get-products"),
    getProduct: (barcode) => ipcRenderer.invoke("db:get-product", barcode),
    getDiscountRules: () => ipcRenderer.invoke("db:get-discount-rules")
  },
  config: {
    get: (key) => ipcRenderer.invoke("config:get", key)
  },
  scanner: {
    onScan: (callback) => {
      const subscription = (_event, barcode) => callback(barcode);
      ipcRenderer.on("scanner:data", subscription);
      return () => {
        ipcRenderer.removeListener("scanner:data", subscription);
      };
    }
  }
};
contextBridge.exposeInMainWorld("electron", electronAPI);
