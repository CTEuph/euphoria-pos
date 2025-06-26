/**
 * Unit tests for EmployeeTransformer
 * Tests bidirectional transformation between local SQLite and cloud PostgreSQL formats
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { 
  EmployeeTransformer, 
  EmployeeTransformUtils 
} from '../../../../../src/services/sync/transformers/EmployeeTransformer'
import type { Employee } from '../../../../../src/db/local/schema'
import type { CloudEmployee } from '../../../../../src/db/cloud/types'

describe('EmployeeTransformer', () => {
  let transformer: EmployeeTransformer
  
  beforeEach(() => {
    transformer = new EmployeeTransformer()
  })

  describe('toCloud', () => {
    it('should transform local employee to cloud format', () => {
      const localEmployee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: 'hashed_123456_salt',
        isActive: true,
        canOverridePrice: true,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-02T10:00:00Z')
      }

      const cloudEmployee = transformer.toCloud(localEmployee)

      expect(cloudEmployee).toEqual({
        id: 'ULID1234565678909',
        employee_code: 'EMP001',
        first_name: 'John',
        last_name: 'Doe',
        pin_hash: 'hashed_123456_salt',
        is_active: true,
        can_override_price: true,
        can_void_transaction: false,
        is_manager: false,
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-02T10:00:00.000Z',
        version_number: 1
      })
    })

    it('should handle false boolean values correctly', () => {
      const localEmployee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: 'hashed_123456_salt',
        isActive: false,
        canOverridePrice: false,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-02T10:00:00Z')
      }

      const cloudEmployee = transformer.toCloud(localEmployee)

      expect(cloudEmployee.is_active).toBe(false)
      expect(cloudEmployee.can_override_price).toBe(false)
      expect(cloudEmployee.can_void_transaction).toBe(false)
      expect(cloudEmployee.is_manager).toBe(false)
    })
  })

  describe('toLocal', () => {
    it('should transform cloud employee to local format', () => {
      const cloudEmployee: CloudEmployee = {
        id: 'ULID1234565678909',
        employee_code: 'EMP001',
        first_name: 'John',
        last_name: 'Doe',
        pin_hash: 'hashed_123456_salt',
        is_active: true,
        can_override_price: true,
        can_void_transaction: false,
        is_manager: false,
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-02T10:00:00.000Z',
        version_number: 1
      }

      const localEmployee = transformer.toLocal(cloudEmployee)

      expect(localEmployee).toEqual({
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: 'hashed_123456_salt',
        isActive: true,
        canOverridePrice: true,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date('2024-01-01T10:00:00.000Z'),
        updatedAt: new Date('2024-01-02T10:00:00.000Z')
      })
    })
  })

  describe('validate', () => {
    it('should validate matching local and cloud employees', () => {
      const localEmployee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: 'hashed_123456_salt',
        isActive: true,
        canOverridePrice: true,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-02T10:00:00Z')
      }

      const cloudEmployee = transformer.toCloud(localEmployee)
      const isValid = transformer.validate(localEmployee, cloudEmployee)

      expect(isValid).toBe(true)
    })

    it('should detect mismatched employees', () => {
      const localEmployee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: 'hashed_123456_salt',
        isActive: true,
        canOverridePrice: true,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const cloudEmployee = transformer.toCloud(localEmployee)
      cloudEmployee.first_name = 'Jane'

      const isValid = transformer.validate(localEmployee, cloudEmployee)

      expect(isValid).toBe(false)
    })
  })

  describe('batch operations', () => {
    it('should transform multiple employees to cloud format', () => {
      const localEmployees: Employee[] = [
        {
          id: 'ULID1',
          employeeCode: 'EMP001',
          firstName: 'John',
          lastName: 'Doe',
          pin: 'hashed_123456_salt',
          isActive: true,
          canOverridePrice: false,
          canVoidTransaction: false,
          isManager: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'ULID2',
          employeeCode: 'EMP002',
          firstName: 'Jane',
          lastName: 'Smith',
          pin: 'hashed_567890_salt',
          isActive: true,
          canOverridePrice: true,
          canVoidTransaction: true,
          isManager: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]

      const cloudEmployees = transformer.batchToCloud(localEmployees)

      expect(cloudEmployees).toHaveLength(2)
      expect(cloudEmployees[0].employee_code).toBe('EMP001')
      expect(cloudEmployees[1].employee_code).toBe('EMP002')
      expect(cloudEmployees[1].is_manager).toBe(true)
    })
  })
})

describe('EmployeeTransformUtils', () => {
  describe('validateEmployeeData', () => {
    it('should validate correct employee data', () => {
      const employee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: '123456',
        isActive: true,
        canOverridePrice: false,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const validation = EmployeeTransformUtils.validateEmployeeData(employee)

      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should detect invalid employee data', () => {
      const employee: Employee = {
        id: '',
        employeeCode: 'A1!', // Invalid characters
        firstName: 'John@', // Invalid characters
        lastName: '', // Empty
        pin: '12', // Too short
        isActive: true,
        canOverridePrice: false,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const validation = EmployeeTransformUtils.validateEmployeeData(employee)

      expect(validation.isValid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
      expect(validation.errors).toContain('Employee ID is required')
      expect(validation.errors).toContain('Employee code must be 3-20 alphanumeric characters')
      expect(validation.errors).toContain('First name contains invalid characters')
      expect(validation.errors).toContain('Last name is required')
      expect(validation.errors).toContain('PIN must be 4-8 digits (if not already hashed)')
    })

    it('should allow hashed PINs', () => {
      const employee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: 'hashed_123456_salt',
        isActive: true,
        canOverridePrice: false,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const validation = EmployeeTransformUtils.validateEmployeeData(employee)

      expect(validation.isValid).toBe(true)
    })
  })

  describe('getDisplayName', () => {
    it('should format employee display name', () => {
      const employee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: '123456',
        isActive: true,
        canOverridePrice: false,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const displayName = EmployeeTransformUtils.getDisplayName(employee)

      expect(displayName).toBe('John Doe')
    })

    it('should handle single name', () => {
      const employee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: '',
        pin: '123456',
        isActive: true,
        canOverridePrice: false,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const displayName = EmployeeTransformUtils.getDisplayName(employee)

      expect(displayName).toBe('John')
    })
  })

  describe('getFullNameWithCode', () => {
    it('should format full name with employee code', () => {
      const employee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: '123456',
        isActive: true,
        canOverridePrice: false,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const fullName = EmployeeTransformUtils.getFullNameWithCode(employee)

      expect(fullName).toBe('John Doe (EMP001)')
    })
  })

  describe('hasPermission', () => {
    const employee: Employee = {
      id: 'ULID1234565678909',
      employeeCode: 'EMP001',
      firstName: 'John',
      lastName: 'Doe',
      pin: '123456',
      isActive: true,
      canOverridePrice: true,
      canVoidTransaction: false,
      isManager: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    it('should check price override permission', () => {
      expect(EmployeeTransformUtils.hasPermission(employee, 'override_price')).toBe(true)
    })

    it('should check void transaction permission', () => {
      expect(EmployeeTransformUtils.hasPermission(employee, 'void_transaction')).toBe(false)
    })

    it('should check manager permission', () => {
      expect(EmployeeTransformUtils.hasPermission(employee, 'manager')).toBe(false)
    })

    it('should return false for unknown permissions', () => {
      expect(EmployeeTransformUtils.hasPermission(employee, 'unknown_permission')).toBe(false)
    })
  })

  describe('getPermissionSummary', () => {
    it('should return basic level for employee with no special permissions', () => {
      const employee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: '123456',
        isActive: true,
        canOverridePrice: false,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const summary = EmployeeTransformUtils.getPermissionSummary(employee)

      expect(summary.level).toBe('basic')
      expect(summary.permissions).toHaveLength(0)
    })

    it('should return supervisor level for employee with some permissions', () => {
      const employee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: '123456',
        isActive: true,
        canOverridePrice: true,
        canVoidTransaction: false,
        isManager: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const summary = EmployeeTransformUtils.getPermissionSummary(employee)

      expect(summary.level).toBe('supervisor')
      expect(summary.permissions).toContain('Price Override')
    })

    it('should return manager level for manager employees', () => {
      const employee: Employee = {
        id: 'ULID1234565678909',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: '123456',
        isActive: true,
        canOverridePrice: true,
        canVoidTransaction: true,
        isManager: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const summary = EmployeeTransformUtils.getPermissionSummary(employee)

      expect(summary.level).toBe('manager')
      expect(summary.permissions).toContain('Price Override')
      expect(summary.permissions).toContain('Void Transactions')
      expect(summary.permissions).toContain('Manager Access')
    })
  })

  describe('generateEmployeeCode', () => {
    it('should generate employee code from name', () => {
      const code = EmployeeTransformUtils.generateEmployeeCode('John', 'Doe')

      expect(code).toBe('JDOE')
    })

    it('should handle long last names', () => {
      const code = EmployeeTransformUtils.generateEmployeeCode('John', 'VeryLongLastName')

      expect(code).toBe('JVERYLON') // First 8 chars
    })

    it('should ensure uniqueness with existing codes', () => {
      const existingCodes = ['JDOE', 'JDOE01']
      const code = EmployeeTransformUtils.generateEmployeeCode('John', 'Doe', existingCodes)

      expect(code).toBe('JDOE02')
    })

    it('should handle special characters in names', () => {
      const code = EmployeeTransformUtils.generateEmployeeCode("John-Paul", "O'Connor")

      expect(code).toBe('JOCONNOR')
    })
  })

  describe('hashPin and verifyPin', () => {
    it('should hash and verify PIN correctly', () => {
      const pin = '123456'
      const hash = EmployeeTransformUtils.hashPin(pin)

      expect(hash).toBeTruthy()
      expect(hash).not.toBe(pin)

      const isValid = EmployeeTransformUtils.verifyPin(pin, hash)
      expect(isValid).toBe(true)

      const isInvalid = EmployeeTransformUtils.verifyPin('567890', hash)
      expect(isInvalid).toBe(false)
    })

    it('should use custom salt', () => {
      const pin = '123456'
      const salt = 'custom-salt'
      const hash = EmployeeTransformUtils.hashPin(pin, salt)

      const isValid = EmployeeTransformUtils.verifyPin(pin, hash, salt)
      expect(isValid).toBe(true)
    })
  })
})