/**
 * Base transformer interface for converting data between local SQLite and cloud PostgreSQL formats
 * Handles the impedance mismatch between different database types and structures
 */

export interface DataTransformer<LocalType, CloudType> {
  /**
   * Transform local SQLite data to cloud PostgreSQL format
   */
  toCloud(local: LocalType): CloudType
  
  /**
   * Transform cloud PostgreSQL data to local SQLite format
   */
  toLocal(cloud: CloudType): LocalType
  
  /**
   * Validate that the transformation is correct
   */
  validate(local: LocalType, cloud: CloudType): boolean
}

/**
 * Batch transformer for handling arrays of data
 */
export interface BatchTransformer<LocalType, CloudType> extends DataTransformer<LocalType, CloudType> {
  /**
   * Transform array of local data to cloud format
   */
  batchToCloud(locals: LocalType[]): CloudType[]
  
  /**
   * Transform array of cloud data to local format
   */
  batchToLocal(clouds: CloudType[]): LocalType[]
}

/**
 * Base transformer class with common functionality
 */
export abstract class BaseTransformer<LocalType, CloudType> implements BatchTransformer<LocalType, CloudType> {
  abstract toCloud(local: LocalType): CloudType
  abstract toLocal(cloud: CloudType): LocalType
  
  /**
   * Default validation - override for custom validation logic
   */
  validate(local: LocalType, cloud: CloudType): boolean {
    try {
      const roundTrip = this.toLocal(this.toCloud(local))
      return JSON.stringify(local) === JSON.stringify(roundTrip)
    } catch {
      return false
    }
  }
  
  /**
   * Batch transform to cloud
   */
  batchToCloud(locals: LocalType[]): CloudType[] {
    return locals.map(local => this.toCloud(local))
  }
  
  /**
   * Batch transform to local
   */
  batchToLocal(clouds: CloudType[]): LocalType[] {
    return clouds.map(cloud => this.toLocal(cloud))
  }
}

/**
 * Utility functions for common transformations
 */
export class TransformUtils {
  /**
   * Convert SQLite integer timestamp to ISO string
   */
  static sqliteTimestampToIso(timestamp: number | null): string | null {
    if (timestamp === null) return null
    return new Date(timestamp).toISOString()
  }
  
  /**
   * Convert ISO string to SQLite integer timestamp
   */
  static isoToSqliteTimestamp(iso: string | null): number | null {
    if (iso === null) return null
    return new Date(iso).getTime()
  }
  
  /**
   * Convert SQLite boolean (0/1) to actual boolean
   */
  static sqliteBooleanToBoolean(value: number | boolean): boolean {
    if (typeof value === 'boolean') return value
    return value === 1
  }
  
  /**
   * Convert boolean to SQLite boolean (0/1)
   */
  static booleanToSqliteBoolean(value: boolean): number {
    return value ? 1 : 0
  }
  
  /**
   * Convert PostgreSQL decimal string to number
   */
  static pgDecimalToNumber(decimal: string | number): number {
    if (typeof decimal === 'number') return decimal
    return parseFloat(decimal)
  }
  
  /**
   * Convert number to PostgreSQL decimal string
   */
  static numberToPgDecimal(num: number): string {
    return num.toFixed(2)
  }
  
  /**
   * Generate ULID for local records (chronologically sortable)
   */
  static generateUlid(): string {
    // Simple ULID implementation - in production you'd use a proper library
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2)
    return `${timestamp}${random}`.toUpperCase()
  }
  
  /**
   * Parse JSON string safely
   */
  static parseJsonSafely<T>(jsonString: string | null, defaultValue: T): T {
    if (!jsonString) return defaultValue
    try {
      return JSON.parse(jsonString)
    } catch {
      return defaultValue
    }
  }
  
  /**
   * Stringify object safely
   */
  static stringifyJsonSafely(obj: any): string | null {
    if (obj === null || obj === undefined) return null
    try {
      return JSON.stringify(obj)
    } catch {
      return null
    }
  }
}

/**
 * Transformation error class
 */
export class TransformationError extends Error {
  constructor(
    message: string,
    public readonly context: {
      transformer: string
      operation: 'toCloud' | 'toLocal'
      data?: any
    }
  ) {
    super(message)
    this.name = 'TransformationError'
  }
}