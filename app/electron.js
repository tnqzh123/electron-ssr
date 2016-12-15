'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const AutoLaunch = require('auto-launch')
const path = require('path')
const tray = require('./tray')
const client = require('./client')
const storage = require('./storage')

const AutoLauncher = new AutoLaunch({
    name: 'ShadowsocksR Client',
    isHidden: true,
    mac: {
      useLaunchAgent: true
    }
})

let mainWindow
let config = {}
let trayEvent
let appIcon = null
let storedConfig

if (process.env.NODE_ENV === 'development') {
  config = require('../config')
  config.url = `http://localhost:${config.port}`
} else {
  config.devtron = false
  config.url = `file://${__dirname}/dist/index.html`
}

function createWindow () {
  /**
   * Initial window options
   */
  mainWindow = new BrowserWindow({
    height: 420,
    width: 800,
    resizable: false,
    minimizable: false,
    maximizable: false
  })

  mainWindow.setMenu(null)

  mainWindow.loadURL(config.url)

  if (process.env.NODE_ENV === 'development') {
    BrowserWindow.addDevToolsExtension(path.join(__dirname, '../node_modules/devtron'))

    let installExtension = require('electron-devtools-installer')

    installExtension.default(installExtension.VUEJS_DEVTOOLS)
      .then((name) => mainWindow.webContents.openDevTools())
      .catch((err) => console.log('An error occurred: ', err))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  console.log('mainWindow opened')
}

function showWindow() {
  mainWindow.show()
}

function quitHandler() {
  mainWindow.destroy()
  tray.destroy()
  app.quit()
}

function execHandler (args) {
  mainWindow.webContents.send('exec-error', args)
}

app.on('ready', () => {
  createWindow()
  // init storage
  storage.setup(app.getAppPath())
  // get configs
  storedConfig = storage.getConfigs()
  // init tray
  trayEvent = tray.setup(storedConfig)
  // tray event
  trayEvent.on('change-enable', (enable) => {
    storedConfig.enable = enable
    storage.saveConfig()
    const selectedConfigIndex = tray.getMenuConfig().selected
    if (selectedConfigIndex > -1) {
      // exec python command
      client.run(enable, storedConfig.configs[selectedConfigIndex])
    }
  }).on('change-auto-launch', (isAutoLaunch) => {
    storedConfig.autoLaunch = isAutoLaunch
    storage.saveConfig()
    if (isAutoLaunch) {
      AutoLauncher.enable()
    } else {
      AutoLauncher.disable()
    }
  }).on('change-selected', (index) => {
    storedConfig.selected = index
    storage.saveConfig()
    if (index > -1) {
      client.run(storedConfig.enable, storedConfig.configs[index])
    }
}).on('exit', quitHandler).on('click', showWindow)
  // when loaded, init configs
  mainWindow.webContents.once('did-finish-load', () => {
    // download ShadowsocksR python sources
    client.setup(app.getAppPath(), storedConfig, execHandler)
    // init gui configs
    mainWindow.webContents.send('init-configs', storedConfig.configs)
  })

  // hide to tray when window closed
  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow.hide()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// ipc channels
ipcMain.on('update-configs', (e, configs) => {
  if (configs.length && storedConfig.selected < 0) {
    storedConfig.selected = configs.length - 1
    client.run(storedConfig.enable, configs[configs.length - 1])
  }
  // save configs
  storedConfig.configs = configs
  storage.saveConfig()
  tray.refreshConfigs(configs, storedConfig.selected)
})