import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { setupDatabaseHandlers } from './ipc/handlers/database'
import { setupAuthHandlers } from './ipc/handlers/authHandler'
import { initializeDatabases, setupDatabaseShutdownHandlers } from '../src/db'
import type { DatabaseConfig } from '../src/db'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const preloadPath = join(__dirname, '../preload/index.cjs')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
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
    // Initialize database connections
    const dbConfig: DatabaseConfig = {
      sqlite: {
        databasePath: './data/euphoria-pos.db'
      },
      supabase: {
        url: process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
        anonKey: process.env.SUPABASE_ANON_KEY || 'placeholder-key'
      },
      terminalId: 'terminal-001'
    }
    
    await initializeDatabases(dbConfig)
    
    // Setup database shutdown handlers
    setupDatabaseShutdownHandlers()
    
    // Setup IPC handlers
    setupDatabaseHandlers()
    setupAuthHandlers()
    
    // Create the main window
    createWindow()
    
  } catch (error) {
    console.error('Failed to initialize application:', error)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})