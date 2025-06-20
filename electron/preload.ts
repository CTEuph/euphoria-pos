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
  transaction: {
    complete: (dto: any) => Promise<{
      success: boolean
      transactionId?: string
      error?: string
    }>
    get: (transactionId: string) => Promise<{
      success: boolean
      transaction?: any
      error?: string
    }>
    recent: (limit?: number) => Promise<{
      success: boolean
      transactions?: any[]
      error?: string
    }>
    void: (transactionId: string, reason: string) => Promise<{
      success: boolean
      message?: string
      error?: string
    }>
  }
}

const electronAPI: IElectronAPI = {
  auth: {
    verifyPin: (pin) => ipcRenderer.invoke('auth:verify-pin', pin),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getCurrentEmployee: () => ipcRenderer.invoke('auth:get-current-employee'),
    checkAuthenticated: () => ipcRenderer.invoke('auth:check-authenticated')
  },
  transaction: {
    complete: (dto) => ipcRenderer.invoke('transaction:complete', dto),
    get: (transactionId) => ipcRenderer.invoke('transaction:get', transactionId),
    recent: (limit) => ipcRenderer.invoke('transaction:recent', limit),
    void: (transactionId, reason) => ipcRenderer.invoke('transaction:void', transactionId, reason)
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)