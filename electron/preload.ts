import { contextBridge, ipcRenderer } from 'electron'
import type { 
  LoginCredentials,
  LoginResult,
  PinValidationResult,
  Employee,
  RateLimitState
} from '../src/features/employee/types'

// Define the API interface that will be available in renderer
interface ElectronAPI {
  version: string
  
  // Authentication API
  auth: {
    login: (credentials: LoginCredentials) => Promise<LoginResult>
    validatePin: (employeeCode: string, pin: string) => Promise<PinValidationResult>
    createEmployee: (
      employeeCode: string,
      firstName: string,
      lastName: string,
      plainPin: string,
      role: 'cashier' | 'manager' | 'owner',
      createdByEmployeeId: string
    ) => Promise<{ success: boolean; employee?: Employee; error?: string }>
    resetPin: (
      targetEmployeeId: string,
      newPlainPin: string,
      resetByEmployeeId: string
    ) => Promise<{ success: boolean; error?: string }>
    clearRateLimit: (
      employeeCode: string,
      clearedByEmployeeId: string
    ) => Promise<{ success: boolean; error?: string }>
    getRateLimitStatus: (employeeCode: string) => Promise<RateLimitState>
    hashPin: (plainPin: string) => Promise<{ success: boolean; hash?: string; error?: string }>
    logActivity: (employeeId: string, activity: string) => Promise<void>
    getRecentActivity: (limit?: number) => Promise<any[]>
  }
  
  // Database API (for future use)
  db: {
    healthCheck: () => Promise<any>
    createBackup: (backupPath?: string) => Promise<string>
  }
}

contextBridge.exposeInMainWorld('electron', {
  version: process.versions.electron,
  
  // Authentication methods
  auth: {
    login: (credentials: LoginCredentials) => 
      ipcRenderer.invoke('auth:login', credentials),
    
    validatePin: (employeeCode: string, pin: string) => 
      ipcRenderer.invoke('auth:validate-pin', employeeCode, pin),
    
    createEmployee: (
      employeeCode: string,
      firstName: string,
      lastName: string,
      plainPin: string,
      role: 'cashier' | 'manager' | 'owner' = 'cashier',
      createdByEmployeeId: string
    ) => ipcRenderer.invoke('auth:create-employee', 
      employeeCode, firstName, lastName, plainPin, role, createdByEmployeeId),
    
    resetPin: (
      targetEmployeeId: string,
      newPlainPin: string,
      resetByEmployeeId: string
    ) => ipcRenderer.invoke('auth:reset-pin', targetEmployeeId, newPlainPin, resetByEmployeeId),
    
    clearRateLimit: (employeeCode: string, clearedByEmployeeId: string) => 
      ipcRenderer.invoke('auth:clear-rate-limit', employeeCode, clearedByEmployeeId),
    
    getRateLimitStatus: (employeeCode: string) => 
      ipcRenderer.invoke('auth:get-rate-limit-status', employeeCode),
    
    hashPin: (plainPin: string) => 
      ipcRenderer.invoke('auth:hash-pin', plainPin),
    
    logActivity: (employeeId: string, activity: string) => 
      ipcRenderer.invoke('auth:log-activity', employeeId, activity),
    
    getRecentActivity: (limit: number = 50) => 
      ipcRenderer.invoke('auth:get-recent-activity', limit)
  },
  
  // Database methods
  db: {
    healthCheck: () => ipcRenderer.invoke('db:health-check'),
    createBackup: (backupPath?: string) => ipcRenderer.invoke('db:create-backup', backupPath)
  }
} satisfies ElectronAPI)

// Type declaration for global window object
declare global {
  interface Window {
    electron: ElectronAPI
  }
}