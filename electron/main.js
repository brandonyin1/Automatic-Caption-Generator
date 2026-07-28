'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const SEND_TO_SHORTCUT_NAME = 'Automatic Caption Generator.lnk';

// Extensions the main HTML app already accepts, per its upload-area hint text -
// kept in sync manually since there's no shared module between the two.
const MIME_BY_EXTENSION = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm'
};

let mainWindow = null;

// Locates the app HTML both in dev (living one directory up from electron/)
// and packaged (copied into resources/ via the extraResources build config -
// see package.json) without needing two different code paths at the call site.
function resolveAppHtmlPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'Automatic Caption Generator v2.html');
  }
  return path.join(__dirname, '..', 'Automatic Caption Generator v2.html');
}

// Electron's own CLI consumes argv[1] as the app path only when unpackaged
// (`electron .`) - packaged apps don't have that extra segment. This is the
// standard slice Electron apps use to isolate "real" launch arguments.
function rawLaunchArgs(argv) {
  return app.isPackaged ? argv.slice(1) : argv.slice(2);
}

// Filters launch args down to ones that are actually existing files on disk -
// guards against stray Electron/Chromium flags leaking through rather than
// trying to allowlist every possible flag shape.
function filePathsFromArgs(argv) {
  return rawLaunchArgs(argv).filter(arg => {
    try {
      return fs.statSync(arg).isFile();
    } catch {
      return false;
    }
  });
}

async function readFilesForRenderer(filePaths) {
  const results = [];
  for (const filePath of filePaths) {
    try {
      const [buffer, stat] = await Promise.all([
        fs.promises.readFile(filePath),
        fs.promises.stat(filePath)
      ]);
      const ext = path.extname(filePath).toLowerCase();
      results.push({
        name: path.basename(filePath),
        buffer,
        type: MIME_BY_EXTENSION[ext] || '',
        lastModified: stat.mtimeMs
      });
    } catch (error) {
      console.error(`Could not read file for Send To: ${filePath}`, error);
    }
  }
  return results;
}

async function sendFilesToRenderer(filePaths) {
  if (filePaths.length === 0 || !mainWindow) {
    return;
  }
  const payload = await readFilesForRenderer(filePaths);
  if (payload.length === 0) {
    return;
  }
  mainWindow.webContents.send('files-opened', payload);
}

function createWindow(initialFilePaths) {
  let quitConfirmed = false;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    sendFilesToRenderer(initialFilePaths);
  });

  mainWindow.loadFile(resolveAppHtmlPath());

  // The page has its own beforeunload handler warning about unsaved caption
  // work (in-memory only until downloaded), which is exactly the right thing
  // in a real browser tab - it triggers a native "Leave site?" dialog. Inside
  // Electron, beforeunload being cancelled just silently blocks the window
  // from closing at all, with no dialog and no visible feedback - clicking
  // the X button (or the default menu's Exit, which also routes through this)
  // would appear to do nothing. Handling it here instead, with a real dialog,
  // and destroy()-ing (which bypasses beforeunload entirely) once confirmed,
  // rather than calling close() again, which would just hit the same
  // beforeunload guard a second time.
  mainWindow.on('close', async (event) => {
    if (quitConfirmed) {
      return;
    }
    event.preventDefault();

    let hasUnsavedWork = false;
    try {
      hasUnsavedWork = await mainWindow.webContents.executeJavaScript(
        'window.hasUnsavedCaptionWork ? window.hasUnsavedCaptionWork() : false'
      );
    } catch (error) {
      console.error('Could not check for unsaved caption work:', error);
    }

    if (hasUnsavedWork) {
      // Autosave already keeps a recovery snapshot up to date continuously
      // through the session (see saveSessionSnapshot in the page itself) -
      // "Save & Quit" just leaves that snapshot in place, "Don't Save" clears
      // it so nothing gets offered for restore next launch, matching an
      // explicit choice not to keep this session around at all.
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Save & Quit', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'Unsaved caption work',
        message: "You have processed captions that haven't been downloaded yet.",
        detail: 'Save this session so it can be restored next time you open the app?'
      });

      if (response === 2) {
        return;
      }
      if (response === 1) {
        try {
          await mainWindow.webContents.executeJavaScript(
            'window.discardCaptionSessionForQuit ? window.discardCaptionSessionForQuit() : null'
          );
        } catch (error) {
          console.error('Could not clear the session snapshot before quitting:', error);
        }
      }
    }

    quitConfirmed = true;
    mainWindow.destroy();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Windows invokes a Send To target once per selection (all chosen paths as
// separate argv entries), not once per file. If the app isn't running yet,
// those paths arrive as this process's own argv (handled below). If it's
// already running, the OS starts a second process that immediately exits
// after handing its argv to the first one via this lock/event pair, so
// repeated Send-To-ing adds to the existing window instead of piling up
// duplicate windows.
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePaths = filePathsFromArgs(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      sendFilesToRenderer(filePaths);
    }
  });

  app.whenReady().then(() => {
    createWindow(filePathsFromArgs(process.argv));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow([]);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// --- Send To registration -------------------------------------------------
//
// Windows' "Send To" menu is driven by shortcut (.lnk) files in the per-user
// shell:sendto folder. Node has no built-in way to write the binary .lnk
// format, so shortcut creation is delegated to PowerShell's WScript.Shell COM
// object - available on every Windows install, no extra native dependency.
//
// Registration only makes full sense against a packaged build (the shortcut
// needs a stable .exe path to target); in dev mode it points at the Electron
// binary with the app directory as an argument, which works but is mainly
// meant for testing the mechanism itself, not day-to-day use.

function sendToShortcutPath() {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo', SEND_TO_SHORTCUT_NAME);
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

ipcMain.handle('send-to:status', () => {
  if (process.platform !== 'win32') {
    return { supported: false, registered: false };
  }
  return { supported: true, registered: fs.existsSync(sendToShortcutPath()) };
});

ipcMain.handle('send-to:register', async () => {
  if (process.platform !== 'win32') {
    throw new Error('Send To integration is only available on Windows.');
  }

  const shortcutPath = sendToShortcutPath();
  const targetPath = process.execPath;
  // __dirname is electron/ itself - the directory containing this file's
  // package.json, which is what Electron's CLI expects as the app path.
  // (This previously pointed one level too high, at the repo root, which has
  // no package.json - hence "Cannot find module 'C:\...\Caption Generator'".)
  const args = app.isPackaged ? '' : __dirname;

  const script = `
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
    $shortcut.TargetPath = '${targetPath.replace(/'/g, "''")}'
    ${args ? `$shortcut.Arguments = '"${args.replace(/'/g, "''")}"'` : ''}
    $shortcut.Save()
  `;

  await runPowerShell(script);
  return { supported: true, registered: true };
});

ipcMain.handle('send-to:unregister', async () => {
  const shortcutPath = sendToShortcutPath();
  if (fs.existsSync(shortcutPath)) {
    fs.unlinkSync(shortcutPath);
  }
  return { supported: process.platform === 'win32', registered: false };
});
