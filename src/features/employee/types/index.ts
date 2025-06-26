/**
 * TypeScript types for Employee Authentication & Management
 * Based on the local database schema and PRD requirements
 */

// Re-export types from database schema
export type { 
  Employee, 
  NewEmployee, 
  EmployeeRole 
} from '@/db/local/schema'

// Authentication-specific types
export interface AuthenticationState {
  currentUser: Employee | null
  isAuthenticated: boolean
  sessionStartTime: Date | null
  lastActivity: Date | null
}

export interface LoginCredentials {
  pin: string
}

export interface LoginResult {
  success: boolean
  employee?: Employee
  error?: string
}

export interface SessionInfo {
  employee: Employee
  startTime: Date
  lastActivity: Date
  isExpired: boolean
}

// Role-based permission types
export interface RolePermissions {
  canProcessSales: boolean
  canProcessRefunds: boolean
  canVoidTransactions: boolean
  canOverridePrices: boolean
  canResetPins: boolean
  canAccessSettings: boolean
  canViewReports: boolean
  canManageInventory: boolean
  canManageProducts: boolean
  canManageEmployees: boolean
  canManageHoldOrders: boolean
  canProcessReturns: boolean
  canViewInventory: boolean
}

// Permission mapping by role
export const ROLE_PERMISSIONS: Record<EmployeeRole, RolePermissions> = {
  cashier: {
    canProcessSales: true,
    canProcessRefunds: false,
    canVoidTransactions: false,
    canOverridePrices: false,
    canResetPins: false,
    canAccessSettings: false,
    canViewReports: false,
    canManageInventory: false,
    canManageProducts: false,
    canManageEmployees: false,
    canManageHoldOrders: true,
    canProcessReturns: false,
    canViewInventory: true,
  },
  manager: {
    canProcessSales: true,
    canProcessRefunds: true,
    canVoidTransactions: true,
    canOverridePrices: true,
    canResetPins: true,
    canAccessSettings: false,
    canViewReports: true,
    canManageInventory: true,
    canManageProducts: true,
    canManageEmployees: false,
    canManageHoldOrders: true,
    canProcessReturns: true,
    canViewInventory: true,
  },
  owner: {
    canProcessSales: true,
    canProcessRefunds: true,
    canVoidTransactions: true,
    canOverridePrices: true,
    canResetPins: true,
    canAccessSettings: true,
    canViewReports: true,
    canManageInventory: true,
    canManageProducts: true,
    canManageEmployees: true,
    canManageHoldOrders: true,
    canProcessReturns: true,
    canViewInventory: true,
  },
}

// Utility type for checking permissions
export type PermissionKey = keyof RolePermissions

// Transaction preservation types (for cart state during session changes)
export interface PreservedTransaction {
  items: any[] // Will be replaced with actual cart item types
  subtotal: number
  timestamp: Date
  preservedBy: string // employee ID who was logged in
}

// Authentication event types (for logging/audit)
export interface AuthEvent {
  type: 'login' | 'logout' | 'timeout' | 'failed_attempt'
  employeeId?: string
  timestamp: Date
  details?: string
}

// PIN management types
export interface PinResetRequest {
  targetEmployeeId: string
  newPin: string
  resetByEmployeeId: string
}

export interface PinValidationResult {
  isValid: boolean
  employee?: Employee
  attemptsRemaining?: number
  isLocked?: boolean
}

// Rate limiting types
export interface AuthAttempt {
  employeeCode: string
  timestamp: Date
  success: boolean
}

export interface RateLimitState {
  attempts: AuthAttempt[]
  isLocked: boolean
  lockExpiry?: Date
}