import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electron", {
  version: process.versions.electron,
  // Authentication methods
  auth: {
    login: (credentials) => ipcRenderer.invoke("auth:login", credentials),
    validatePin: (employeeCode, pin) => ipcRenderer.invoke("auth:validate-pin", employeeCode, pin),
    createEmployee: (employeeCode, firstName, lastName, plainPin, role = "cashier", createdByEmployeeId) => ipcRenderer.invoke(
      "auth:create-employee",
      employeeCode,
      firstName,
      lastName,
      plainPin,
      role,
      createdByEmployeeId
    ),
    resetPin: (targetEmployeeId, newPlainPin, resetByEmployeeId) => ipcRenderer.invoke("auth:reset-pin", targetEmployeeId, newPlainPin, resetByEmployeeId),
    clearRateLimit: (employeeCode, clearedByEmployeeId) => ipcRenderer.invoke("auth:clear-rate-limit", employeeCode, clearedByEmployeeId),
    getRateLimitStatus: (employeeCode) => ipcRenderer.invoke("auth:get-rate-limit-status", employeeCode),
    hashPin: (plainPin) => ipcRenderer.invoke("auth:hash-pin", plainPin),
    logActivity: (employeeId, activity) => ipcRenderer.invoke("auth:log-activity", employeeId, activity),
    getRecentActivity: (limit = 50) => ipcRenderer.invoke("auth:get-recent-activity", limit)
  },
  // Database methods
  db: {
    healthCheck: () => ipcRenderer.invoke("db:health-check"),
    createBackup: (backupPath) => ipcRenderer.invoke("db:create-backup", backupPath)
  }
});
