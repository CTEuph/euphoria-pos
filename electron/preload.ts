import { contextBridge, ipcRenderer } from 'electron'
import type { 
  LoginCredentials,
  LoginResult,
  PinValidationResult,
  Employee,
  RateLimitState
} from '../src/features/employee/types'
import type { NewTransaction, NewTransactionItem, Transaction } from '../src/db/local/schema'


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
  
  // Database API
  db: {
    healthCheck: () => Promise<any>
    createBackup: (backupPath?: string) => Promise<string>
    createTransaction: (data: {
      transaction: NewTransaction
      items: NewTransactionItem[]
    }) => Promise<{ success: boolean; transaction?: Transaction; error?: string }>
    getEmployeeTransactions: (employeeId: string, limit?: number) => Promise<{ 
      success: boolean; 
      transactions?: any[]; 
      error?: string 
    }>
    getTransactionById: (transactionId: string) => Promise<{ 
      success: boolean; 
      transaction?: Transaction; 
      error?: string 
    }>
    voidTransaction: (data: {
      transactionId: string
      voidedBy: string
      reason: string
    }) => Promise<{ success: boolean; error?: string }>
    getDailySalesSummary: (employeeId: string, date: Date) => Promise<{ 
      success: boolean; 
      summary?: {
        totalSales: number
        transactionCount: number
        averageTransaction: number
        cashSales: number
        cardSales: number
      }; 
      error?: string 
    }>
  }
}

// Create the API object
const electronAPI = {
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
    createBackup: (backupPath?: string) => ipcRenderer.invoke('db:create-backup', backupPath),
    createTransaction: (data: {
      transaction: NewTransaction
      items: NewTransactionItem[]
    }) => ipcRenderer.invoke('db:create-transaction', data),
    getEmployeeTransactions: (employeeId: string, limit?: number) => 
      ipcRenderer.invoke('db:get-employee-transactions', employeeId, limit),
    getTransactionById: (transactionId: string) => 
      ipcRenderer.invoke('db:get-transaction-by-id', transactionId),
    voidTransaction: (data: {
      transactionId: string
      voidedBy: string
      reason: string
    }) => ipcRenderer.invoke('db:void-transaction', data),
    getDailySalesSummary: (employeeId: string, date: Date) => 
      ipcRenderer.invoke('db:get-daily-sales-summary', employeeId, date)
  }
} satisfies ElectronAPI

// Expose the API to the renderer
contextBridge.exposeInMainWorld('electron', electronAPI)

// Type declaration for global window object
declare global {
  interface Window {
    electron: ElectronAPI
  }
}