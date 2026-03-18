const { app, BrowserWindow, ipcMain } = require('electron');
const { uIOhook } = require('uiohook-napi');
const { execFile } = require('child_process');
const path = require('path');

let mainWindow;
let currentLang  = null;
let layoutInterval;

const checkKeyboardLayout = () => {
    execFile('powershell', ['-command', `
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class KeyboardLayout {
            [DllImport("user32.dll")]
            public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll")]
            public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);
            [DllImport("user32.dll")]
            public static extern IntPtr GetKeyboardLayout(uint idThread);
        }
"@
        $hwnd = [KeyboardLayout]::GetForegroundWindow()
        $thread = [KeyboardLayout]::GetWindowThreadProcessId($hwnd, [IntPtr]::Zero)
        $layout = [KeyboardLayout]::GetKeyboardLayout($thread)
        [int]$layout -band 0xFFFF
    `], (err, stdout) => {
        if (err) return;
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const langId    = parseInt(stdout.trim());
        const isEnglish = langId === 0x0409;
        if (currentLang !== isEnglish) {
            currentLang = isEnglish;
            mainWindow.webContents.send('keyboard-language', isEnglish);
        }
    });
};

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        frame: false,
        backgroundColor: '#0d0d0d',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'views/login.html'));

    ipcMain.on('window-min',   () => mainWindow.minimize());
    ipcMain.on('window-max',   () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
    ipcMain.on('window-close', () => mainWindow.close());

    uIOhook.on('keydown', (e) => mainWindow?.webContents.send('keydown', { keyCode: e.keycode, time: Date.now() }));
    uIOhook.on('keyup',   (e) => mainWindow?.webContents.send('keyup',   { keyCode: e.keycode, time: Date.now() }));
    uIOhook.start();

    layoutInterval = setInterval(checkKeyboardLayout, 1000);

    mainWindow.on('closed', () => {
        clearInterval(layoutInterval);
        mainWindow = null;
    });
});

app.on('window-all-closed', () => {
    uIOhook.stop();
    app.quit();
});