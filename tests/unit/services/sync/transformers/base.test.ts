/**
 * Unit tests for base transformer utilities and classes
 */

import { describe, it, expect } from 'vitest'
import { 
  BaseTransformer, 
  TransformUtils, 
  TransformationError 
} from '../../../../../src/services/sync/transformers/base'

// Mock transformer for testing
class MockTransformer extends BaseTransformer<{ id: string; value: number }, { id: string; value: string }> {
  toCloud(local: { id: string; value: number }): { id: string; value: string } {
    return {
      id: local.id,
      value: local.value.toString()
    }
  }

  toLocal(cloud: { id: string; value: string }): { id: string; value: number } {
    return {
      id: cloud.id,
      value: parseInt(cloud.value)
    }
  }
}

describe('BaseTransformer', () => {
  const transformer = new MockTransformer()

  describe('batch operations', () => {
    it('should transform batch to cloud', () => {
      const locals = [
        { id: '1', value: 10 },
        { id: '2', value: 20 }
      ]

      const clouds = transformer.batchToCloud(locals)

      expect(clouds).toEqual([
        { id: '1', value: '10' },
        { id: '2', value: '20' }
      ])
    })

    it('should transform batch to local', () => {
      const clouds = [
        { id: '1', value: '10' },
        { id: '2', value: '20' }
      ]

      const locals = transformer.batchToLocal(clouds)

      expect(locals).toEqual([
        { id: '1', value: 10 },
        { id: '2', value: 20 }
      ])
    })
  })

  describe('validation', () => {
    it('should validate round-trip transformation', () => {
      const local = { id: '1', value: 10 }
      const cloud = transformer.toCloud(local)

      const isValid = transformer.validate(local, cloud)

      expect(isValid).toBe(true)
    })

    it('should detect invalid transformation', () => {
      const local = { id: '1', value: 10 }
      const cloud = { id: '1', value: '20' } // Different value

      const isValid = transformer.validate(local, cloud)

      expect(isValid).toBe(false)
    })
  })
})

describe('TransformUtils', () => {
  describe('timestamp conversion', () => {
    it('should convert SQLite timestamp to ISO string', () => {
      const timestamp = new Date('2024-01-01T10:00:00Z').getTime()
      const iso = TransformUtils.sqliteTimestampToIso(timestamp)

      expect(iso).toBe('2024-01-01T10:00:00.000Z')
    })

    it('should handle null timestamp', () => {
      const iso = TransformUtils.sqliteTimestampToIso(null)

      expect(iso).toBeNull()
    })

    it('should convert ISO string to SQLite timestamp', () => {
      const iso = '2024-01-01T10:00:00.000Z'
      const timestamp = TransformUtils.isoToSqliteTimestamp(iso)

      expect(timestamp).toBe(new Date(iso).getTime())
    })

    it('should handle null ISO string', () => {
      const timestamp = TransformUtils.isoToSqliteTimestamp(null)

      expect(timestamp).toBeNull()
    })
  })

  describe('boolean conversion', () => {
    it('should convert SQLite boolean to boolean', () => {
      expect(TransformUtils.sqliteBooleanToBoolean(1)).toBe(true)
      expect(TransformUtils.sqliteBooleanToBoolean(0)).toBe(false)
      expect(TransformUtils.sqliteBooleanToBoolean(true)).toBe(true)
      expect(TransformUtils.sqliteBooleanToBoolean(false)).toBe(false)
    })

    it('should convert boolean to SQLite boolean', () => {
      expect(TransformUtils.booleanToSqliteBoolean(true)).toBe(1)
      expect(TransformUtils.booleanToSqliteBoolean(false)).toBe(0)
    })
  })

  describe('decimal conversion', () => {
    it('should convert PostgreSQL decimal to number', () => {
      expect(TransformUtils.pgDecimalToNumber('12.50')).toBe(12.50)
      expect(TransformUtils.pgDecimalToNumber(12.50)).toBe(12.50)
    })

    it('should convert number to PostgreSQL decimal', () => {
      expect(TransformUtils.numberToPgDecimal(12.5)).toBe('12.50')
      expect(TransformUtils.numberToPgDecimal(12)).toBe('12.00')
    })
  })

  describe('JSON handling', () => {
    it('should parse JSON safely', () => {
      const obj = { name: 'test', value: 123 }
      const parsed = TransformUtils.parseJsonSafely(JSON.stringify(obj), {})

      expect(parsed).toEqual(obj)
    })

    it('should return default value for invalid JSON', () => {
      const defaultValue = { error: true }
      const parsed = TransformUtils.parseJsonSafely('invalid json', defaultValue)

      expect(parsed).toEqual(defaultValue)
    })

    it('should return default value for null JSON', () => {
      const defaultValue = { error: true }
      const parsed = TransformUtils.parseJsonSafely(null, defaultValue)

      expect(parsed).toEqual(defaultValue)
    })

    it('should stringify JSON safely', () => {
      const obj = { name: 'test', value: 123 }
      const stringified = TransformUtils.stringifyJsonSafely(obj)

      expect(stringified).toBe(JSON.stringify(obj))
    })

    it('should return null for null object', () => {
      expect(TransformUtils.stringifyJsonSafely(null)).toBeNull()
      expect(TransformUtils.stringifyJsonSafely(undefined)).toBeNull()
    })
  })

  describe('ULID generation', () => {
    it('should generate ULID', () => {
      const ulid = TransformUtils.generateUlid()

      expect(ulid).toBeTruthy()
      expect(typeof ulid).toBe('string')
      expect(ulid.length).toBeGreaterThan(0)
    })

    it('should generate unique ULIDs', () => {
      const ulid1 = TransformUtils.generateUlid()
      const ulid2 = TransformUtils.generateUlid()

      expect(ulid1).not.toBe(ulid2)
    })
  })
})

describe('TransformationError', () => {
  it('should create error with context', () => {
    const context = {
      transformer: 'TestTransformer',
      operation: 'toCloud' as const,
      data: { test: true }
    }

    const error = new TransformationError('Test error', context)

    expect(error.message).toBe('Test error')
    expect(error.name).toBe('TransformationError')
    expect(error.context).toEqual(context)
  })

  it('should be instanceof Error', () => {
    const error = new TransformationError('Test error', {
      transformer: 'TestTransformer',
      operation: 'toCloud'
    })

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(TransformationError)
  })
})