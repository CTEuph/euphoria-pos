/**
 * Employee transformer for converting between local SQLite and cloud PostgreSQL formats
 * Handles the key differences:
 * - ULID vs UUID primary keys
 * - Individual permission boolean fields vs JSON permissions object
 * - SQLite integer timestamps vs PostgreSQL timestamptz
 * - PIN hashing differences between environments
 */

import { BaseTransformer, TransformUtils, TransformationError } from './base'
import type { Employee } from '../../../db/local/schema'
import type { CloudEmployee } from '../../../db/cloud/types'

/**
 * Extended employee interface with permission aggregation
 */
export interface EmployeeWithPermissions extends Employee {
  permissions?: {
    canOverridePrice: boolean
    canVoidTransaction: boolean
    isManager: boolean
    customPermissions?: Record<string, boolean>
  }
}

/**
 * Cloud employee with JSON permissions
 */
export interface CloudEmployeeWithPermissions extends Omit<CloudEmployee, 'can_override_price' | 'can_void_transaction' | 'is_manager'> {
  permissions: {
    can_override_price: boolean
    can_void_transaction: boolean
    is_manager: boolean
    custom_permissions?: Record<string, boolean>
  }
}

/**
 * Transform employees between local and cloud formats
 */
export class EmployeeTransformer extends BaseTransformer<Employee, CloudEmployee> {
  /**
   * Convert local SQLite employee to cloud PostgreSQL format
   */
  toCloud(local: Employee): CloudEmployee {
    try {
      const cloud: CloudEmployee = {
        id: local.id, // Keep ULID as-is
        employee_code: local.employeeCode,
        first_name: local.firstName,
        last_name: local.lastName,
        pin_hash: local.pin, // Assume PIN is already hashed
        is_active: local.isActive || false,
        can_override_price: local.canOverridePrice || false,
        can_void_transaction: local.canVoidTransaction || false,
        is_manager: local.isManager || false,
        created_at: TransformUtils.sqliteTimestampToIso(local.createdAt.getTime())!,
        updated_at: TransformUtils.sqliteTimestampToIso(local.updatedAt.getTime())!,
        version_number: 1 // Start with version 1 for new records
      }
      
      return cloud
      
    } catch (error) {
      throw new TransformationError(
        `Failed to transform employee to cloud format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'EmployeeTransformer',
          operation: 'toCloud',
          data: local
        }
      )
    }
  }
  
  /**
   * Convert cloud PostgreSQL employee to local SQLite format
   */
  toLocal(cloud: CloudEmployee): Employee {
    try {
      const local: Employee = {
        id: cloud.id,
        employeeCode: cloud.employee_code,
        firstName: cloud.first_name,
        lastName: cloud.last_name,
        pin: cloud.pin_hash,
        isActive: cloud.is_active || false,
        canOverridePrice: cloud.can_override_price || false,
        canVoidTransaction: cloud.can_void_transaction || false,
        isManager: cloud.is_manager || false,
        createdAt: new Date(cloud.created_at),
        updatedAt: new Date(cloud.updated_at)
      }
      
      return local
      
    } catch (error) {
      throw new TransformationError(
        `Failed to transform employee to local format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'EmployeeTransformer',
          operation: 'toLocal',
          data: cloud
        }
      )
    }
  }
  
  /**
   * Custom validation for employees
   */
  validate(local: Employee, cloud: CloudEmployee): boolean {
    try {
      return (
        local.id === cloud.id &&
        local.employeeCode === cloud.employee_code &&
        local.firstName === cloud.first_name &&
        local.lastName === cloud.last_name &&
        local.isActive === cloud.is_active &&
        local.canOverridePrice === cloud.can_override_price &&
        local.canVoidTransaction === cloud.can_void_transaction &&
        local.isManager === cloud.is_manager
        // Note: PIN hash comparison omitted for security
      )
    } catch {
      return false
    }
  }
}

/**
 * Enhanced transformer for employees with JSON permissions (future use)
 */
export class EmployeePermissionsTransformer extends BaseTransformer<EmployeeWithPermissions, CloudEmployeeWithPermissions> {
  /**
   * Convert local employee with individual permissions to cloud format with JSON permissions
   */
  toCloud(local: EmployeeWithPermissions): CloudEmployeeWithPermissions {
    try {
      const cloud: CloudEmployeeWithPermissions = {
        id: local.id,
        employee_code: local.employeeCode,
        first_name: local.firstName,
        last_name: local.lastName,
        pin_hash: local.pin,
        is_active: local.isActive,
        created_at: TransformUtils.sqliteTimestampToIso(local.createdAt.getTime())!,
        updated_at: TransformUtils.sqliteTimestampToIso(local.updatedAt.getTime())!,
        version_number: 1,
        permissions: {
          can_override_price: local.canOverridePrice || false,
          can_void_transaction: local.canVoidTransaction || false,
          is_manager: local.isManager || false,
          custom_permissions: local.permissions?.customPermissions
        }
      }
      
      return cloud
      
    } catch (error) {
      throw new TransformationError(
        `Failed to transform employee with permissions to cloud format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'EmployeePermissionsTransformer',
          operation: 'toCloud',
          data: local
        }
      )
    }
  }
  
  /**
   * Convert cloud employee with JSON permissions to local format with individual fields
   */
  toLocal(cloud: CloudEmployeeWithPermissions): EmployeeWithPermissions {
    try {
      const local: EmployeeWithPermissions = {
        id: cloud.id,
        employeeCode: cloud.employee_code,
        firstName: cloud.first_name,
        lastName: cloud.last_name,
        pin: cloud.pin_hash,
        isActive: cloud.is_active,
        canOverridePrice: cloud.permissions.can_override_price || false,
        canVoidTransaction: cloud.permissions.can_void_transaction || false,
        isManager: cloud.permissions.is_manager || false,
        createdAt: new Date(cloud.created_at),
        updatedAt: new Date(cloud.updated_at),
        permissions: {
          canOverridePrice: cloud.permissions.can_override_price,
          canVoidTransaction: cloud.permissions.can_void_transaction,
          isManager: cloud.permissions.is_manager,
          customPermissions: cloud.permissions.custom_permissions
        }
      }
      
      return local
      
    } catch (error) {
      throw new TransformationError(
        `Failed to transform employee with permissions to local format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'EmployeePermissionsTransformer',
          operation: 'toLocal',
          data: cloud
        }
      )
    }
  }
}

/**
 * Utility functions for employee-specific transformations
 */
export class EmployeeTransformUtils {
  /**
   * Hash PIN for storage (simplified - use proper hashing in production)
   */
  static hashPin(pin: string, salt?: string): string {
    // In production, use bcrypt or similar
    // This is a placeholder implementation
    const actualSalt = salt || 'euphoria-pos-salt'
    return `hashed_${pin}_${actualSalt}`
  }
  
  /**
   * Verify PIN against hash (simplified)
   */
  static verifyPin(pin: string, hash: string, salt?: string): boolean {
    const expectedHash = this.hashPin(pin, salt)
    return expectedHash === hash
  }
  
  /**
   * Get employee display name
   */
  static getDisplayName(employee: Employee): string {
    return `${employee.firstName} ${employee.lastName}`.trim()
  }
  
  /**
   * Get employee full name with code
   */
  static getFullNameWithCode(employee: Employee): string {
    return `${this.getDisplayName(employee)} (${employee.employeeCode})`
  }
  
  /**
   * Check if employee has specific permission
   */
  static hasPermission(
    employee: Employee | EmployeeWithPermissions,
    permission: 'override_price' | 'void_transaction' | 'manager' | string
  ): boolean {
    switch (permission) {
      case 'override_price':
        return employee.canOverridePrice
      case 'void_transaction':
        return employee.canVoidTransaction
      case 'manager':
        return employee.isManager
      default:
        // Check custom permissions if available
        if ('permissions' in employee && employee.permissions?.customPermissions) {
          return employee.permissions.customPermissions[permission] || false
        }
        return false
    }
  }
  
  /**
   * Create permission summary for employee
   */
  static getPermissionSummary(employee: Employee): {
    level: 'basic' | 'supervisor' | 'manager'
    permissions: string[]
  } {
    const permissions: string[] = []
    
    if (employee.canOverridePrice) permissions.push('Price Override')
    if (employee.canVoidTransaction) permissions.push('Void Transactions')
    if (employee.isManager) permissions.push('Manager Access')
    
    let level: 'basic' | 'supervisor' | 'manager' = 'basic'
    if (employee.isManager) {
      level = 'manager'
    } else if (employee.canOverridePrice || employee.canVoidTransaction) {
      level = 'supervisor'
    }
    
    return { level, permissions }
  }
  
  /**
   * Validate employee data integrity
   */
  static validateEmployeeData(employee: Employee): {
    isValid: boolean
    errors: string[]
  } {
    const errors: string[] = []
    
    // Basic field validation
    if (!employee.id?.trim()) errors.push('Employee ID is required')
    if (!employee.employeeCode?.trim()) errors.push('Employee code is required')
    if (!employee.firstName?.trim()) errors.push('First name is required')
    if (!employee.lastName?.trim()) errors.push('Last name is required')
    if (!employee.pin?.trim()) errors.push('PIN is required')
    
    // Employee code format validation (alphanumeric, 3-20 chars)
    if (employee.employeeCode && !/^[A-Za-z0-9]{3,20}$/.test(employee.employeeCode)) {
      errors.push('Employee code must be 3-20 alphanumeric characters')
    }
    
    // Name validation (no special characters except spaces, hyphens, apostrophes)
    const nameRegex = /^[A-Za-z\s\-']+$/
    if (employee.firstName && !nameRegex.test(employee.firstName)) {
      errors.push('First name contains invalid characters')
    }
    if (employee.lastName && !nameRegex.test(employee.lastName)) {
      errors.push('Last name contains invalid characters')
    }
    
    // PIN validation (numeric, 4-8 digits)
    if (employee.pin && !/^\d{4,8}$/.test(employee.pin) && !employee.pin.startsWith('hashed_')) {
      errors.push('PIN must be 4-8 digits (if not already hashed)')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
  
  /**
   * Generate employee code from name
   */
  static generateEmployeeCode(firstName: string, lastName: string, existingCodes: string[] = []): string {
    // Create base code from first initial + last name (max 8 chars)
    const baseCode = (firstName.charAt(0) + lastName)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 8)
    
    let code = baseCode
    let counter = 1
    
    // Ensure uniqueness
    while (existingCodes.includes(code)) {
      code = baseCode.substring(0, 6) + counter.toString().padStart(2, '0')
      counter++
    }
    
    return code
  }
}