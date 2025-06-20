// Simple test preload
console.log('Preload script is running!')

import { contextBridge } from 'electron'

try {
  contextBridge.exposeInMainWorld('electronTest', {
    ping: () => 'pong',
    version: process.versions.electron
  })
  console.log('Test API exposed successfully')
} catch (error) {
  console.error('Failed to expose test API:', error)
}

// Original API
try {
  const { ipcRenderer } = require('electron')
  
  contextBridge.exposeInMainWorld('electron', {
    auth: {
      verifyPin: (pin: string) => {
        console.log('Calling verifyPin with:', pin)
        return ipcRenderer.invoke('auth:verify-pin', pin)
      },
      logout: () => ipcRenderer.invoke('auth:logout'),
      getCurrentEmployee: () => ipcRenderer.invoke('auth:get-current-employee')
    }
  })
  console.log('Main API exposed successfully')
} catch (error) {
  console.error('Failed to expose main API:', error)
}