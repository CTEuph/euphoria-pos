import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { initializeDatabase } from './services/localDb'
import { seedEmployees } from './services/employeeService'
import { setupAuthHandlers } from './ipc/handlers/auth'
import { startLaneSync } from './services/sync'
import { startCloudSync } from './services/sync/cloudSync'
import type { SyncHandle } from './services/sync'

let mainWindow: BrowserWindow | null = null
let laneSync: SyncHandle | null = null
let cloudSync: SyncHandle | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  try {
    // Initialize database
    initializeDatabase()
    
    // Seed initial data
    await seedEmployees()
    
    // Set up IPC handlers
    setupAuthHandlers()
    
    // Start sync services
    laneSync = startLaneSync()
    cloudSync = startCloudSync()
    
    // Create window
    createWindow()
  } catch (error) {
    console.error('Failed to initialize app:', error)
    app.quit()
  }
})

app.on('before-quit', () => {
  // Stop sync services
  if (laneSync) {
    laneSync.stop()
  }
  if (cloudSync) {
    cloudSync.stop()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})