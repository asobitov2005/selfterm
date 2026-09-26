const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage } = require('electron');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('ssh2');

let mainWindow;
const sessions = new Map();

const isDev = !app.isPackaged;

function send(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function getVaultPath() {
  return path.join(app.getPath('userData'), 'vault.json');
}

function defaultVault() {
  return {
    version: 1,
    updatedAt: Date.now(),
    settings: {
      syncUrl: '',
      syncToken: '',
      theme: 'termius-dark',
      uiFont: 'system',
      terminalFont: 'jetbrains',
      uiFontSize: 14,
      terminalFontSize: 13,
      uiTextColor: '',
      terminalTextColor: '',
    },
    history: [],
    hosts: [
      {
        id: crypto.randomUUID(),
        label: 'Example server',
        hostname: '192.168.1.10',
        port: 22,
        username: 'root',
        group: 'Local',
        color: '#47c2a8',
        authMethod: 'agent',
        keyPath: '',
        notes: 'Edit or delete this sample host.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  };
}

function publicHost(host) {
  const { passwordSecret, ...safeHost } = host;
  return {
    ...safeHost,
    hasSavedPassword: Boolean(passwordSecret),
  };
}

function publicVault(vault) {
  return {
    ...vault,
    hosts: vault.hosts.map(publicHost),
  };
}

async function readVault() {
  const vaultPath = getVaultPath();
  try {
    const raw = await fs.readFile(vaultPath, 'utf8');
    const vault = JSON.parse(raw);
    return {
      ...defaultVault(),
      ...vault,
      settings: { ...defaultVault().settings, ...(vault.settings || {}) },
      history: Array.isArray(vault.history) ? vault.history : [],
      hosts: Array.isArray(vault.hosts) ? vault.hosts : [],
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to read vault:', error);
    }
    const vault = defaultVault();
    await writeVault(vault);
    return vault;
  }
}

async function writeVault(vault) {
  const vaultPath = getVaultPath();
  await fs.mkdir(path.dirname(vaultPath), { recursive: true });
  await fs.writeFile(vaultPath, JSON.stringify(vault, null, 2), 'utf8');
  return vault;
}

function normalizeHost(input, existing = {}) {
  const now = Date.now();
  const hostname = String(input.hostname || '').trim();
  const label = String(input.label || hostname || 'Untitled host').trim();
  const username = String(input.username || '').trim();
  const port = Number.parseInt(input.port, 10);
  const authMethod = ['agent', 'key', 'password'].includes(input.authMethod) ? input.authMethod : 'agent';
  let passwordSecret = authMethod === 'password' ? existing.passwordSecret || '' : '';

  if (authMethod === 'password') {
    if (input.clearSavedPassword) passwordSecret = '';
    if (typeof input.password === 'string' && input.password.length > 0) {
      passwordSecret = encryptSecret(input.password);
    }
  }

  return {
    ...existing,
    id: existing.id || input.id || crypto.randomUUID(),
    label,
    hostname,
    port: Number.isFinite(port) && port > 0 ? port : 22,
    username,
    group: String(input.group || '').trim(),
    color: String(input.color || existing.color || '#47c2a8'),
    authMethod,
    keyPath: String(input.keyPath || '').trim(),
    passwordSecret,
    notes: String(input.notes || '').trim(),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

function encryptSecret(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Linux keyring encryption is not available. Install/enable GNOME Keyring or KWallet to save passwords.');
  }

  return safeStorage.encryptString(value).toString('base64');
}

function decryptSecret(secret) {
  if (!secret) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Saved password cannot be decrypted because Linux keyring encryption is not available.');
  }

  return safeStorage.decryptString(Buffer.from(secret, 'base64'));
}

function normalizeColorSetting(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '';
}

function normalizeTerminalSize(cols, rows) {
  const parsedCols = Number.parseInt(cols, 10);
  const parsedRows = Number.parseInt(rows, 10);
  return {
    cols: Number.isFinite(parsedCols) && parsedCols > 0 ? parsedCols : 100,
    rows: Number.isFinite(parsedRows) && parsedRows > 0 ? parsedRows : 32,
  };
}

async function recordConnectedHost(host, requestedPassword, shouldRememberPassword, sessionId) {
  const vault = await readVault();
  const now = Date.now();
  let passwordError = '';
  let hosts = vault.hosts;

  if (requestedPassword && shouldRememberPassword) {
    try {
      const passwordSecret = encryptSecret(requestedPassword);
      hosts = vault.hosts.map((item) =>
        item.id === host.id
          ? {
              ...item,
              passwordSecret,
              updatedAt: now,
            }
          : item,
      );
    } catch (error) {
      passwordError = error.message;
    }
  }

  const entry = {
    id: crypto.randomUUID(),
    hostId: host.id,
    label: host.label || host.hostname,
    hostname: host.hostname,
    port: host.port || 22,
    username: host.username,
    group: host.group || '',
    color: host.color || '#47c2a8',
    connectedAt: now,
  };

  const next = {
    ...vault,
    hosts,
    history: [entry, ...(Array.isArray(vault.history) ? vault.history : [])].slice(0, 100),
    updatedAt: now,
  };
  await writeVault(next);
  send('vault:changed', publicVault(next));

  if (passwordError) {
    send('ssh:error', { sessionId, message: `Connected, but password was not stored: ${passwordError}` });
  }
}

function encryptedBlobFromVault(vault, passphrase) {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Sync passphrase must be at least 8 characters.');
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(
    JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      hosts: vault.hosts,
    }),
    'utf8',
  );
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    format: 'selfterm-vault-v1',
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function vaultFromEncryptedBlob(blob, passphrase) {
  if (!blob || blob.format !== 'selfterm-vault-v1') {
    throw new Error('Remote vault format is not supported.');
  }
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Sync passphrase must be at least 8 characters.');
  }

  const salt = Buffer.from(blob.salt, 'base64');
  const iv = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const ciphertext = Buffer.from(blob.ciphertext, 'base64');
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed = JSON.parse(plaintext.toString('utf8'));

  if (!Array.isArray(parsed.hosts)) {
    throw new Error('Remote vault does not contain hosts.');
  }

  return parsed;
}

function normalizeBaseUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) throw new Error('Sync server URL is required.');
  return trimmed.replace(/\/+$/, '');
}

function authHeaders(token) {
  const trimmed = String(token || '').trim();
  if (!trimmed) throw new Error('Sync token is required.');
  return {
    Authorization: `Bearer ${trimmed}`,
    'Content-Type': 'application/json',
  };
}

async function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: '#101214',
    title: 'SelfTerm',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('vault:get', async () => publicVault(await readVault()));

ipcMain.handle('vault:save-host', async (_event, input) => {
  const vault = await readVault();
  const existing = vault.hosts.find((host) => host.id === input.id);
  const host = normalizeHost(input, existing);
  if (!host.hostname) throw new Error('Hostname is required.');
  if (!host.username) throw new Error('Username is required.');

  const hosts = existing
    ? vault.hosts.map((item) => (item.id === host.id ? host : item))
    : [host, ...vault.hosts];

  const next = { ...vault, hosts, updatedAt: Date.now() };
  await writeVault(next);
  return publicVault(next);
});

ipcMain.handle('vault:delete-host', async (_event, hostId) => {
  const vault = await readVault();
  const next = {
    ...vault,
    hosts: vault.hosts.filter((host) => host.id !== hostId),
    updatedAt: Date.now(),
  };
  await writeVault(next);
  return publicVault(next);
});

ipcMain.handle('vault:save-settings', async (_event, settings) => {
  const vault = await readVault();
  const next = {
    ...vault,
    settings: {
      ...vault.settings,
      syncUrl: String(settings.syncUrl || '').trim(),
      syncToken: String(settings.syncToken || '').trim(),
      theme: String(settings.theme || vault.settings.theme || 'termius-dark').trim(),
      uiFont: String(settings.uiFont || vault.settings.uiFont || 'system').trim(),
      terminalFont: String(settings.terminalFont || vault.settings.terminalFont || 'jetbrains').trim(),
      uiFontSize: Number(settings.uiFontSize || vault.settings.uiFontSize || 14),
      terminalFontSize: Number(settings.terminalFontSize || vault.settings.terminalFontSize || 13),
      uiTextColor: normalizeColorSetting(settings.uiTextColor),
      terminalTextColor: normalizeColorSetting(settings.terminalTextColor),
    },
    updatedAt: Date.now(),
  };
  await writeVault(next);
  return publicVault(next);
});

ipcMain.handle('dialog:select-key', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select private key',
    properties: ['openFile'],
    defaultPath: app.getPath('home'),
  });
  if (result.canceled || !result.filePaths.length) return '';
  return result.filePaths[0];
});

ipcMain.handle('sync:push', async (_event, { syncUrl, syncToken, passphrase }) => {
  const vault = await readVault();
  const blob = encryptedBlobFromVault(vault, passphrase);
  const response = await fetch(`${normalizeBaseUrl(syncUrl)}/vault`, {
    method: 'PUT',
    headers: authHeaders(syncToken),
    body: JSON.stringify({
      updatedAt: Date.now(),
      blob,
    }),
  });

  if (!response.ok) {
    throw new Error(`Push failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
});

ipcMain.handle('sync:pull', async (_event, { syncUrl, syncToken, passphrase }) => {
  const response = await fetch(`${normalizeBaseUrl(syncUrl)}/vault`, {
    method: 'GET',
    headers: authHeaders(syncToken),
  });

  if (!response.ok) {
    throw new Error(`Pull failed: ${response.status} ${await response.text()}`);
  }

  const remote = await response.json();
  if (!remote.blob) throw new Error('Remote server does not have a vault yet.');
  const decrypted = vaultFromEncryptedBlob(remote.blob, passphrase);
  const vault = await readVault();
  const next = {
    ...vault,
    hosts: decrypted.hosts.map((host) => normalizeHost(host, host)),
    updatedAt: Date.now(),
  };
  await writeVault(next);
  return publicVault(next);
});

ipcMain.handle('ssh:connect', async (_event, { sessionId, hostId, password, keyPassphrase, rememberPassword, cols, rows }) => {
  const vault = await readVault();
  const host = vault.hosts.find((item) => item.id === hostId);
  if (!host) throw new Error('Host not found.');
  if (!sessionId) throw new Error('Session ID is required.');

  if (sessions.has(sessionId)) {
    sessions.get(sessionId).conn.end();
    sessions.delete(sessionId);
  }

  const conn = new Client();
  const config = {
    host: host.hostname,
    port: host.port || 22,
    username: host.username,
    keepaliveInterval: 15000,
    readyTimeout: 20000,
  };
  let requestedPassword = '';
  let shouldRememberPassword = false;

  if (host.authMethod === 'password') {
    requestedPassword = String(password || '');
    shouldRememberPassword = Boolean(rememberPassword);
    const resolvedPassword = requestedPassword || decryptSecret(host.passwordSecret);
    if (!resolvedPassword) throw new Error('Password is required for this host.');
    config.password = resolvedPassword;
  } else if (host.authMethod === 'key') {
    if (!host.keyPath) throw new Error('Private key path is required for this host.');
    config.privateKey = await fs.readFile(host.keyPath, 'utf8');
    if (keyPassphrase) config.passphrase = keyPassphrase;
  } else {
    if (!process.env.SSH_AUTH_SOCK) {
      throw new Error('SSH agent is not available. Use password or private key auth.');
    }
    config.agent = process.env.SSH_AUTH_SOCK;
  }

  const initialSize = normalizeTerminalSize(cols, rows);
  sessions.set(sessionId, { conn, stream: null, hostId, ...initialSize });

  conn.on('banner', (message) => {
    send('ssh:data', { sessionId, data: `\r\n${message}\r\n` });
  });

  conn.on('ready', () => {
    send('ssh:status', { sessionId, status: 'connected' });
    recordConnectedHost(host, requestedPassword, shouldRememberPassword, sessionId).catch((error) => {
      send('ssh:error', { sessionId, message: `Connected, but login history was not recorded: ${error.message}` });
    });
    conn.shell(
      {
        term: 'xterm-256color',
        cols: initialSize.cols,
        rows: initialSize.rows,
      },
      (error, stream) => {
        if (error) {
          send('ssh:error', { sessionId, message: error.message });
          return;
        }
        const session = sessions.get(sessionId);
        if (session) {
          session.stream = stream;
          stream.setWindow(session.rows, session.cols, 0, 0);
        }

        stream.on('close', () => {
          send('ssh:status', { sessionId, status: 'closed' });
          conn.end();
          sessions.delete(sessionId);
        });
        stream.on('data', (data) => {
          send('ssh:data', { sessionId, data: data.toString('utf8') });
        });
        stream.stderr.on('data', (data) => {
          send('ssh:data', { sessionId, data: data.toString('utf8') });
        });
      },
    );
  });

  conn.on('error', (error) => {
    send('ssh:error', { sessionId, message: error.message });
    sessions.delete(sessionId);
  });

  conn.on('close', () => {
    send('ssh:status', { sessionId, status: 'closed' });
    sessions.delete(sessionId);
  });

  send('ssh:status', { sessionId, status: 'connecting' });
  conn.connect(config);
  return { ok: true };
});

ipcMain.handle('ssh:write', async (_event, { sessionId, data }) => {
  const session = sessions.get(sessionId);
  if (!session || !session.stream) return { ok: false };
  session.stream.write(data);
  return { ok: true };
});

ipcMain.handle('ssh:resize', async (_event, { sessionId, cols, rows }) => {
  const session = sessions.get(sessionId);
  if (!session) return { ok: false };
  const size = normalizeTerminalSize(cols, rows);
  session.cols = size.cols;
  session.rows = size.rows;
  if (!session.stream) return { ok: true, pending: true };
  session.stream.setWindow(size.rows, size.cols, 0, 0);
  return { ok: true };
});

ipcMain.handle('ssh:disconnect', async (_event, sessionId) => {
  const session = sessions.get(sessionId);
  if (session) {
    session.conn.end();
    sessions.delete(sessionId);
  }
  return { ok: true };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  for (const session of sessions.values()) {
    session.conn.end();
  }
  sessions.clear();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
