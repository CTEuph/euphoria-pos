import { contextBridge, ipcRenderer } from 'electron'

// Type-safe IPC API
export interface IElectronAPI {
  auth: {
    verifyPin: (pin: string) => Promise<{ id: string; firstName: string; lastName: string } | null>
    logout: () => Promise<void>
    getCurrentEmployee: () => Promise<{ id: string; name: string } | null>
  }
  database: {
    getProducts: () => Promise<any[]>
    getProduct: (barcode: string) => Promise<any | null>
    getDiscountRules: () => Promise<any[]>
  }
  config: {
    get: (key: string) => Promise<any>
  }
  scanner: {
    onScan: (callback: (barcode: string) => void) => () => void
  }
}

const electronAPI: IElectronAPI = {
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
      const subscription = (_event: any, barcode: string) => callback(barcode)
      ipcRenderer.on('scanner:data', subscription)
      return () => {
        ipcRenderer.removeListener('scanner:data', subscription)
      }
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)