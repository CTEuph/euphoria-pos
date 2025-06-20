import { contextBridge, ipcRenderer } from 'electron'

// Type-safe IPC API
export interface IElectronAPI {
  auth: {
    verifyPin: (pin: string) => Promise<{
      id: string
      firstName: string
      lastName: string
      employeeCode: string
      isManager: boolean
      canOverridePrice: boolean
      canVoidTransaction: boolean
    } | null>
    logout: () => Promise<void>
    getCurrentEmployee: () => Promise<{
      id: string
      name: string
      employeeCode: string
      isManager: boolean
    } | null>
    checkAuthenticated: () => Promise<boolean>
  }
}

const electronAPI: IElectronAPI = {
  auth: {
    verifyPin: (pin) => ipcRenderer.invoke('auth:verify-pin', pin),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getCurrentEmployee: () => ipcRenderer.invoke('auth:get-current-employee'),
    checkAuthenticated: () => ipcRenderer.invoke('auth:check-authenticated')
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)