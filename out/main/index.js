import { ipcMain, app, BrowserWindow } from "electron";
import { join } from "path";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
let currentEmployee = null;
function setupAuthHandlers() {
  console.log("Setting up auth handlers...");
  ipcMain.handle("auth:verify-pin", async (_, pin) => {
    console.log("auth:verify-pin called with pin:", pin);
    if (pin === "1234") {
      currentEmployee = {
        id: "1",
        employeeCode: "EMP001",
        firstName: "John",
        lastName: "Doe",
        pin: "hashed",
        isActive: true,
        canOverridePrice: true,
        canVoidTransaction: true,
        isManager: true,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      return {
        id: "1",
        firstName: "John",
        lastName: "Doe"
      };
    } else if (pin === "5678") {
      return {
        id: "2",
        firstName: "Jane",
        lastName: "Smith"
      };
    }
    return null;
  });
  ipcMain.handle("auth:logout", async () => {
    currentEmployee = null;
  });
  ipcMain.handle("auth:get-current-employee", async () => {
    if (!currentEmployee) return null;
    return {
      id: currentEmployee.id,
      name: `${currentEmployee.firstName} ${currentEmployee.lastName}`
    };
  });
}
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(async () => {
  try {
    console.log("App starting...");
    setupAuthHandlers();
    createWindow();
    console.log("App started successfully");
  } catch (error) {
    console.error("Failed to initialize app:", error);
    app.quit();
  }
});
app.on("before-quit", () => {
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
