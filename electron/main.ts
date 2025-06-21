import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { validateConfig, handleConfigErrors } from './services/configValidator'
import { initializeDatabase, closeDatabase } from './services/localDb'
import { seedInitialData } from './services/seedInitialData'
import { setupAuthHandlers } from './ipc/handlers/auth'
import { setupTransactionHandlers } from './ipc/handlers/transaction'
import { startLaneSync, stopLaneSync, startCloudSync, stopCloudSync } from './services/sync'

let mainWindow: BrowserWindow | null = null

// Validate configuration before anything else
const configResult = validateConfig()
if (!configResult.isValid) {
  handleConfigErrors(configResult)
  app.quit()
  process.exit(1)
}

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
  try {
    // Show configuration info
    console.log('========================================')
    console.log('Euphoria POS Starting')
    console.log(`Terminal ID: ${configResult.config!.terminalId}`)
    console.log(`Terminal Port: ${configResult.config!.terminalPort}`)
    console.log(`Peer Terminals: ${configResult.config!.peerTerminals.join(', ') || 'none'}`)
    console.log('========================================\n')
    
    // Initialize database
    initializeDatabase()
    
    // Seed initial data
    await seedInitialData()
    
    // Setup IPC handlers
    setupAuthHandlers()
    setupTransactionHandlers()
    
    // Start lane sync (Phase 10)
    startLaneSync()
    
    // Start cloud sync if configured (Phase 10)
    if (configResult.config!.supabaseUrl && configResult.config!.supabaseServiceKey) {
      console.log('Starting cloud sync...')
      startCloudSync({
        supabaseUrl: configResult.config!.supabaseUrl,
        supabaseServiceKey: configResult.config!.supabaseServiceKey,
        terminalId: configResult.config!.terminalId,
        syncInterval: 30000, // 30 seconds
        batchSize: 50,
        maxRetries: 3
      })
    } else {
      console.log('Cloud sync disabled (no Supabase credentials)')
    }
    
    // Create window
    createWindow()
  } catch (error) {
    console.error('Failed to start application:', error)
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start Euphoria POS:\n\n${error instanceof Error ? error.message : 'Unknown error'}`
    )
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  console.log('Shutting down Euphoria POS...')
  
  // Stop lane sync
  stopLaneSync()
  
  // Stop cloud sync
  stopCloudSync()
  
  // Close database connection
  closeDatabase()
  
  console.log('Shutdown complete')
})