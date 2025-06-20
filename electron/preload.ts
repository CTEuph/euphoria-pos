console.log('=== Preload script starting ===')

const { contextBridge, ipcRenderer } = require('electron')

console.log('Electron modules imported successfully')

// Define the API
const electronAPI = {
  auth: {
    verifyPin: (pin) => ipcRenderer.invoke('auth:verify-pin', pin),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getCurrentEmployee: () => ipcRenderer.invoke('auth:get-current-employee')
  },
  database: {
    getProducts: () => ipcRenderer.invoke('db:get-products'),
    getProduct: (barcode) => ipcRenderer.invoke('db:get-product', barcode),
    getDiscountRules: () => ipcRenderer.invoke('db:get-discount-rules')
  },
  config: {
    get: (key) => ipcRenderer.invoke('config:get', key)
  },
  scanner: {
    onScan: (callback) => {
      const subscription = (_event, barcode) => callback(barcode)
      ipcRenderer.on('scanner:data', subscription)
      return () => {
        ipcRenderer.removeListener('scanner:data', subscription)
      }
    }
  }
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  console.log('=== API exposed successfully ===')
  console.log('Available methods:', Object.keys(electronAPI))
} catch (error) {
  console.error('=== Failed to expose API ===', error)
}