import { ipcMain } from 'electron'
import { getConfig, setConfig, getAllConfig } from '../../services/configService'
import { assertAuthenticated } from './auth'

export function setupConfigHandlers() {
  // Get config value
  ipcMain.handle('config:get', async (_, key: string) => {
    assertAuthenticated()
    return await getConfig(key)
  })

  // Set config value (requires manager)
  ipcMain.handle('config:set', async (_, key: string, value: any) => {
    assertAuthenticated()
    return await setConfig(key, value)
  })

  // Get all config
  ipcMain.handle('config:get-all', async () => {
    assertAuthenticated()
    return await getAllConfig()
  })
}