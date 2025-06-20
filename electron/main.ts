import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { initializeDatabase } from './services/localDb'
import { seedEmployees } from './services/employeeService'
import { seedInitialData } from './services/seedInitialData'
import { setupAuthHandlers } from './ipc/handlers/auth'
import { setupDatabaseHandlers } from './ipc/handlers/database'
import { setupConfigHandlers } from './ipc/handlers/config'
import { startLaneSync } from './services/sync'
import { startCloudSync } from './services/sync/cloudSync'
import { validateConfig } from './services/configValidator'
import type { SyncHandle } from './services/sync'

let mainWindow: BrowserWindow | null = null
let laneSync: SyncHandle | null = null
let cloudSync: SyncHandle | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
    console.log('App starting...')
    
    // Validate configuration
    // validateConfig()
    
    // Initialize database
    // initializeDatabase()
    
    // Seed initial data
    // await seedEmployees()
    // await seedInitialData()
    
    // Set up IPC handlers
    setupAuthHandlers()
    // setupDatabaseHandlers()
    // setupConfigHandlers()
    
    // Start sync services
    // laneSync = startLaneSync()
    // cloudSync = startCloudSync()
    
    // Create window
    createWindow()
    
    console.log('App started successfully')
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