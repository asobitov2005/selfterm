import { invoke, isTauri } from '@tauri-apps/api/core';

export const nativeClient = isTauri();
const subscribers = new Set();
let current = null;

function present(view) {
  current = view;
  return {
    version: 2,
    settings: { syncUrl: '', syncToken: '', ...view.appearance },
    history: [],
    hosts: view.hosts.map((host) => ({
      ...host,
      authMethod: host.auth.kind === 'password' ? 'password' : host.auth.kind === 'agent' ? 'agent' : 'key',
      keyPath: '',
      hasSavedPassword: host.auth.kind === 'password',
    })),
  };
}

async function changed(command, args) {
  const vault = present(await invoke(command, args));
  for (const listener of subscribers) listener(vault);
  return vault;
}

const unavailable = (feature) => async () => { throw new Error(`${feature} is not yet connected in the Rust migration build.`); };

if (nativeClient) {
  window.selfterm = {
    getVault: async () => present(await invoke('vault_get')),
    saveHost: async (input) => {
      const previous = current?.hosts.find((host) => host.id === input.id);
      let auth;
      if (input.authMethod === 'password') {
        if (input.clearSavedPassword && !input.password) throw new Error('Enter a replacement password before clearing the saved credential.');
        auth = previous?.auth.kind === 'password' ? previous.auth : { kind: 'password', secretId: crypto.randomUUID() };
        if (!input.password && previous?.auth.kind !== 'password') throw new Error('Enter the host password.');
      } else if (input.authMethod === 'agent') {
        auth = { kind: 'agent' };
      } else {
        throw new Error('Key import is not yet connected in the Rust migration build.');
      }
      const now = Date.now();
      const host = {
        id: input.id || crypto.randomUUID(), label: input.label || input.hostname,
        hostname: input.hostname, port: Number(input.port), username: input.username,
        group: input.group || '', color: input.color || '', notes: input.notes || '', auth,
        createdAt: previous?.createdAt ?? now, updatedAt: now,
      };
      return changed('vault_save_host', { input: { host, secret: input.password || null } });
    },
    deleteHost: (id) => changed('vault_delete_host', { id }),
    saveSettings: (settings) => {
      if (settings.syncUrl || settings.syncToken) return unavailable('Synchronization settings')();
      const { theme, uiFont, terminalFont, uiFontSize, terminalFontSize, uiTextColor, terminalTextColor } = settings;
      return changed('vault_save_appearance', { appearance: { theme, uiFont, terminalFont, uiFontSize, terminalFontSize, uiTextColor, terminalTextColor } });
    },
    selectKey: unavailable('Key import'),
    syncPush: unavailable('Synchronization'), syncPull: unavailable('Synchronization'),
    connect: unavailable('SSH'), write: unavailable('SSH input'),
    resize: async () => {}, disconnect: async () => {},
    onData: () => () => {}, onStatus: () => () => {}, onError: () => () => {},
    onVaultChanged: (listener) => { subscribers.add(listener); return () => subscribers.delete(listener); },
  };
}

export const vaultCommands = {
  bootstrap: () => invoke('vault_bootstrap'),
  protection: () => invoke('vault_protection'),
  setProtection: async (enabled, passphrase) => {
    const result = await invoke('vault_set_protection', { enabled, passphrase: passphrase || null });
    window.dispatchEvent(new CustomEvent('selfterm-protection-changed', { detail: result.passwordEnabled }));
    return result;
  },
  list: () => invoke('vault_ids'),
  create: (passphrase) => invoke('vault_create', { passphrase }),
  unlock: (id, passphrase) => invoke('vault_unlock', { id, passphrase }),
  recover: (id, recoveryKey) => invoke('vault_recover', { id, recoveryKey }),
  lock: () => invoke('vault_lock'),
};
