import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { initializeDatabase, closeDatabase } from './services/localDb'
import { seedInitialData } from './services/seedInitialData'
import { setupAuthHandlers } from './ipc/handlers/auth'
import { startLaneSync, stopLaneSync } from './services/sync'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
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
  // Initialize database
  initializeDatabase()
  
  // Seed initial data
  await seedInitialData()
  
  // Setup IPC handlers
  setupAuthHandlers()
  
  // Start lane sync
  startLaneSync()
  
  // Create window
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Stop lane sync
  stopLaneSync()
  
  // Close database connection
  closeDatabase()
})