import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { nativeClient } from './nativeBridge.js';
import SecurityDrawer from './SecurityDrawer.jsx';
import {
  Check,
  ChevronDown,
  Cloud,
  DownloadCloud,
  Edit3,
  Folder,
  HardDrive,
  History,
  KeyRound,
  Laptop2,
  Lock,
  MonitorUp,
  Palette,
  PanelLeftClose,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Settings,
  TerminalSquare,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';

const emptyHost = {
  label: '',
  hostname: '',
  port: 22,
  username: '',
  group: '',
  color: '#47c2a8',
  authMethod: 'agent',
  keyPath: '',
  password: '',
  clearSavedPassword: false,
  notes: '',
};

const swatches = ['#47c2a8', '#e3b341', '#e66262', '#6fa8dc', '#b58bdc', '#8fb85e'];

const textColorOptions = [
  { id: 'mint', label: 'Mint', value: '#63d6ba' },
  { id: 'ice', label: 'Ice', value: '#edf7ff' },
  { id: 'amber', label: 'Amber', value: '#ffd17a' },
  { id: 'rose', label: 'Rose', value: '#ff9b9b' },
  { id: 'violet', label: 'Violet', value: '#c8a1f2' },
  { id: 'ink', label: 'Ink', value: '#1c2430' },
];

const uiFonts = {
  system: 'Inter, "SF Pro Text", "Segoe UI", Ubuntu, Cantarell, sans-serif',
  manrope: 'Manrope, "Segoe UI", Ubuntu, sans-serif',
  plex: '"IBM Plex Sans", Manrope, Ubuntu, sans-serif',
  ubuntu: 'Ubuntu, Manrope, "Segoe UI", sans-serif',
  nunito: '"Nunito Sans", Manrope, "Segoe UI", sans-serif',
  geist: '"Geist Sans", Manrope, "Segoe UI", sans-serif',
  dm: '"DM Sans", Manrope, "Segoe UI", sans-serif',
  rubik: 'Rubik, Manrope, "Segoe UI", sans-serif',
  work: '"Work Sans", Manrope, "Segoe UI", sans-serif',
  source: '"Source Sans 3", Manrope, "Segoe UI", sans-serif',
  avenir: '"Nunito Sans", Manrope, "Segoe UI", sans-serif',
};

const terminalFonts = {
  jetbrains: '"JetBrains Mono", "SF Mono", monospace',
  cascadian: '"Cascadia Code", "JetBrains Mono", monospace',
  ubuntuMono: '"Ubuntu Mono", "JetBrains Mono", monospace',
  plexMono: '"IBM Plex Mono", "JetBrains Mono", monospace',
  fira: '"Fira Code", "JetBrains Mono", monospace',
  monaspace: '"Monaspace Neon", "JetBrains Mono", monospace',
  inconsolata: 'Inconsolata, "JetBrains Mono", monospace',
  robotoMono: '"Roboto Mono", "JetBrains Mono", monospace',
  sourceCode: '"Source Code Pro", "JetBrains Mono", monospace',
  spaceMono: '"Space Mono", "JetBrains Mono", monospace',
  mono: '"Fira Code", "JetBrains Mono", monospace',
};

const themeOptions = [
  { id: 'termius-dark', label: 'Termius Dark' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'hacker', label: 'Hacker' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'nord', label: 'Nord' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'solarized-dark', label: 'Solarized Dark' },
  { id: 'grass', label: 'Grass' },
  { id: 'red-sands', label: 'Red Sands' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'carbon', label: 'Carbon' },
  { id: 'amber', label: 'Amber' },
  { id: 'termius-light', label: 'Termius Light' },
  { id: 'paper', label: 'Paper' },
];

const darkTerminalTheme = {
  background: '#090b0d',
  foreground: '#d9e0df',
  cursor: '#47c2a8',
  black: '#141719',
  red: '#e66262',
  green: '#47c2a8',
  yellow: '#e3b341',
  blue: '#6fa8dc',
  magenta: '#b58bdc',
  cyan: '#74c7c7',
  white: '#d9e0df',
  brightBlack: '#50575b',
  brightRed: '#ff7a70',
  brightGreen: '#63d6ba',
  brightYellow: '#f0c85a',
  brightBlue: '#8fc2f2',
  brightMagenta: '#c8a1f2',
  brightCyan: '#90dfdf',
  brightWhite: '#ffffff',
  selectionBackground: '#294b43',
};

const terminalThemes = {
  'termius-dark': { ...darkTerminalTheme, background: '#080a12', cursor: '#19e09d', green: '#19e09d', brightGreen: '#65d7bd' },
  graphite: { ...darkTerminalTheme, background: '#070909' },
  hacker: {
    ...darkTerminalTheme,
    background: '#000402',
    foreground: '#d7ffe2',
    cursor: '#00ff66',
    green: '#00ff66',
    brightGreen: '#70ff9f',
    selectionBackground: '#123a20',
  },
  matrix: {
    ...darkTerminalTheme,
    background: '#000704',
    foreground: '#e2ffe9',
    cursor: '#39ff88',
    green: '#39ff88',
    brightGreen: '#a4ffc2',
    selectionBackground: '#0b3722',
  },
  ocean: { ...darkTerminalTheme, background: '#04101c', cursor: '#20b7ff', green: '#6ee7b7', blue: '#20b7ff', brightBlue: '#65d4ff' },
  nord: { ...darkTerminalTheme, background: '#1d222b', foreground: '#eceff4', cursor: '#88c0d0', blue: '#81a1c1', cyan: '#88c0d0' },
  dracula: { ...darkTerminalTheme, background: '#11121a', foreground: '#f8f8f2', cursor: '#50fa7b', green: '#50fa7b', magenta: '#bd93f9' },
  'solarized-dark': { ...darkTerminalTheme, background: '#001014', foreground: '#eee8d5', cursor: '#2aa198', green: '#859900', yellow: '#b58900', blue: '#268bd2' },
  grass: { ...darkTerminalTheme, background: '#060d07', cursor: '#41c66b', green: '#41c66b', brightGreen: '#72df91' },
  'red-sands': { ...darkTerminalTheme, background: '#120806', cursor: '#ff7048', red: '#ff7048', yellow: '#ffb454' },
  midnight: { ...darkTerminalTheme, background: '#060914', cursor: '#7aa2ff', blue: '#7aa2ff', brightBlue: '#a8c0ff' },
  carbon: { ...darkTerminalTheme, background: '#050505', cursor: '#00d1b2', green: '#00d1b2' },
  amber: { ...darkTerminalTheme, background: '#0e0902', cursor: '#ffb020', yellow: '#ffb020', brightYellow: '#ffd17a' },
  'termius-light': {
    background: '#f8fafb',
    foreground: '#1c2430',
    cursor: '#06a36f',
    black: '#1c2430',
    red: '#c94f50',
    green: '#06a36f',
    yellow: '#a36b00',
    blue: '#2563eb',
    magenta: '#7c3aed',
    cyan: '#0891b2',
    white: '#edf1f3',
    brightBlack: '#7a8794',
    brightRed: '#dc2626',
    brightGreen: '#08c987',
    brightYellow: '#d97706',
    brightBlue: '#3b82f6',
    brightMagenta: '#9333ea',
    brightCyan: '#06b6d4',
    brightWhite: '#ffffff',
    selectionBackground: '#cdeee5',
  },
  paper: {
    background: '#fbfaf4',
    foreground: '#25241f',
    cursor: '#267a5a',
    black: '#25241f',
    red: '#b94b45',
    green: '#267a5a',
    yellow: '#9b6a1a',
    blue: '#315f9d',
    magenta: '#7c4d8a',
    cyan: '#2c7a7b',
    white: '#f0efe9',
    brightBlack: '#8e8676',
    brightRed: '#d65a50',
    brightGreen: '#39a278',
    brightYellow: '#c58b27',
    brightBlue: '#4778c7',
    brightMagenta: '#9b63a8',
    brightCyan: '#3f9698',
    brightWhite: '#ffffff',
    selectionBackground: '#dbe9df',
  },
};

const uiFontOptions = [
  { id: 'system', label: 'System' },
  { id: 'geist', label: 'Geist' },
  { id: 'manrope', label: 'Manrope' },
  { id: 'plex', label: 'IBM Plex' },
  { id: 'ubuntu', label: 'Ubuntu' },
  { id: 'nunito', label: 'Nunito Sans' },
  { id: 'dm', label: 'DM Sans' },
  { id: 'rubik', label: 'Rubik' },
  { id: 'work', label: 'Work Sans' },
  { id: 'source', label: 'Source Sans' },
];

const terminalFontOptions = [
  { id: 'jetbrains', label: 'JetBrains Mono' },
  { id: 'cascadian', label: 'Cascadia Mono' },
  { id: 'monaspace', label: 'Monaspace Neon' },
  { id: 'fira', label: 'Fira Code' },
  { id: 'ubuntuMono', label: 'Ubuntu Mono' },
  { id: 'plexMono', label: 'IBM Plex Mono' },
  { id: 'inconsolata', label: 'Inconsolata' },
  { id: 'robotoMono', label: 'Roboto Mono' },
  { id: 'sourceCode', label: 'Source Code Pro' },
  { id: 'spaceMono', label: 'Space Mono' },
];

function formatDate(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function classNames(...items) {
  return items.filter(Boolean).join(' ');
}

function authLabel(host) {
  if (!host) return '-';
  if (host.authMethod === 'password') return host.hasSavedPassword ? 'password stored' : 'password prompt';
  if (host.authMethod === 'key') return 'private key';
  return 'SSH agent';
}

function hostTags(host) {
  const blocked = new Set([String(host.label || '').trim().toLowerCase()]);
  const tags = [];

  function pushTag(value) {
    const tag = String(value || '').trim();
    const key = tag.toLowerCase();
    if (!tag || blocked.has(key) || tags.some((item) => item.toLowerCase() === key)) return;
    tags.push(tag);
  }

  pushTag(host.username);
  pushTag(host.group);
  if (host.authMethod === 'key') pushTag('key');
  return tags.slice(0, 4);
}

function uiFontStack(fontId) {
  return uiFonts[fontId] || uiFonts.system;
}

function terminalFontStack(fontId) {
  return terminalFonts[fontId] || terminalFonts.jetbrains;
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '';
}

function terminalTheme(themeId, textColor = '') {
  const theme = terminalThemes[themeId] || darkTerminalTheme;
  const foreground = normalizeColor(textColor);
  return foreground ? { ...theme, foreground } : theme;
}

function normalizeUiFont(fontId) {
  return fontId === 'avenir' ? 'nunito' : fontId || 'system';
}

function normalizeTerminalFont(fontId) {
  return fontId === 'mono' ? 'fira' : fontId || 'jetbrains';
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function App() {
  const [vault, setVault] = useState(null);
  const [selectedHostId, setSelectedHostId] = useState('');
  const [query, setQuery] = useState('');
  const [editorHost, setEditorHost] = useState(null);
  const [connectHost, setConnectHost] = useState(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hostsPanelOpen, setHostsPanelOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [syncPassphrase, setSyncPassphrase] = useState('');
  const [toast, setToast] = useState('');
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState('');

  useEffect(() => {
    window.selfterm.getVault().then((nextVault) => {
      setVault(nextVault);
      setSelectedHostId(nextVault.hosts[0]?.id || '');
    });

    return window.selfterm.onVaultChanged((nextVault) => {
      setVault(nextVault);
    });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const hosts = vault?.hosts || [];
  const groupOptions = useMemo(() => {
    const values = new Set();
    for (const host of hosts) values.add(host.group || 'Ungrouped');
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [hosts]);

  const filteredHosts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return hosts.filter((host) => {
      const group = host.group || 'Ungrouped';
      if (groupFilter !== 'all' && group !== groupFilter) return false;
      if (!needle) return true;
      return [host.label, host.hostname, host.username, host.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [groupFilter, hosts, query]);

  const groups = useMemo(() => {
    const grouped = new Map();
    for (const host of filteredHosts) {
      const key = host.group || 'Ungrouped';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(host);
    }
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [filteredHosts]);

  const selectedHost = hosts.find((host) => host.id === selectedHostId) || hosts[0];
  const settings = vault?.settings || {};
  const activeTheme = settings.theme || 'termius-dark';
  const activeUiFont = normalizeUiFont(settings.uiFont);
  const activeTerminalFont = normalizeTerminalFont(settings.terminalFont);
  const activeUiFontSize = clampNumber(settings.uiFontSize, 12, 18, 14);
  const activeTerminalFontSize = clampNumber(settings.terminalFontSize, 11, 22, 13);
  const activeUiTextColor = normalizeColor(settings.uiTextColor);
  const activeTerminalTextColor = normalizeColor(settings.terminalTextColor);

  useEffect(() => {
    if (groupFilter === 'all') return;
    if (!groupOptions.includes(groupFilter)) setGroupFilter('all');
  }, [groupFilter, groupOptions]);

  async function refreshVault(nextVaultPromise) {
    const nextVault = await nextVaultPromise;
    setVault(nextVault);
    if (!selectedHostId && nextVault.hosts[0]) setSelectedHostId(nextVault.hosts[0].id);
    return nextVault;
  }

  function beginConnect(host) {
    if (!host) return;
    if (host.authMethod === 'password' && host.hasSavedPassword) {
      openTab(host, {});
      return;
    }
    if (host.authMethod === 'password' || host.authMethod === 'key') {
      setConnectHost(host);
      return;
    }
    openTab(host, {});
  }

  function openTab(host, secrets) {
    const id = crypto.randomUUID();
    const tab = {
      id,
      hostId: host.id,
      title: host.label || host.hostname,
      subtitle: `${host.username}@${host.hostname}:${host.port || 22}`,
      status: 'new',
      secrets,
      createdAt: Date.now(),
    };
    setTabs((current) => [...current, tab]);
    setActiveTabId(id);
    setConnectHost(null);
    setHostsPanelOpen(false);
  }

  function updateTab(id, patch) {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)));
  }

  async function closeTab(id) {
    await window.selfterm.disconnect(id);
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      const next = current.filter((tab) => tab.id !== id);
      if (activeTabId === id) {
        const replacement = next[index] || next[index - 1] || next[0];
        setActiveTabId(replacement?.id || '');
      }
      return next;
    });
  }

  async function deleteHost(host) {
    if (!host) return;
    const next = await refreshVault(window.selfterm.deleteHost(host.id));
    setSelectedHostId(next.hosts[0]?.id || '');
    setToast('Host deleted');
  }

  async function saveSyncSettings(settings) {
    const next = await refreshVault(window.selfterm.saveSettings(settings));
    setToast('Settings updated');
    return next;
  }

  async function applyAppearanceSettings(nextSettings) {
    setVault((current) =>
      current
        ? {
            ...current,
            settings: {
              ...current.settings,
              ...nextSettings,
            },
          }
        : current,
    );

    try {
      await window.selfterm.saveSettings({
        ...vault.settings,
        ...nextSettings,
      });
    } catch (error) {
      setToast(error.message);
    }
  }

  async function pushVault() {
    try {
      await window.selfterm.syncPush({
        syncUrl: vault.settings.syncUrl,
        syncToken: vault.settings.syncToken,
        passphrase: syncPassphrase,
      });
      setToast('Vault pushed to your server');
    } catch (error) {
      setToast(error.message);
    }
  }

  async function pullVault() {
    try {
      const nextVault = await window.selfterm.syncPull({
        syncUrl: vault.settings.syncUrl,
        syncToken: vault.settings.syncToken,
        passphrase: syncPassphrase,
      });
      setVault(nextVault);
      setSelectedHostId(nextVault.hosts[0]?.id || '');
      setToast('Vault pulled from your server');
    } catch (error) {
      setToast(error.message);
    }
  }

  if (!vault) {
    return (
      <div className="boot-screen">
        <TerminalSquare size={34} />
        <span>Loading SelfTerm vault</span>
      </div>
    );
  }

  return (
    <div
      className={classNames('app-shell', !hostsPanelOpen && 'hosts-collapsed')}
      data-theme={activeTheme}
      style={{
        '--ui-font': uiFontStack(activeUiFont),
        '--terminal-font': terminalFontStack(activeTerminalFont),
        '--ui-font-size': `${activeUiFontSize}px`,
        '--terminal-font-size': `${activeTerminalFontSize}px`,
        '--text': activeUiTextColor || undefined,
      }}
    >
      <aside className="side-rail">
        <div className="rail-logo" title="SelfTerm">
          <TerminalSquare size={22} />
        </div>
        <button
          className={classNames('rail-button', (hostsPanelOpen || !tabs.length) && 'active')}
          title={hostsPanelOpen ? 'Hide hosts' : 'Show hosts'}
          onClick={() => setHostsPanelOpen((value) => !value)}
        >
          <Server size={20} />
        </button>
        <button className="rail-button" title="Sync" onClick={() => setSyncOpen(true)}>
          <Cloud size={20} />
        </button>
        <button className={classNames('rail-button', historyOpen && 'active')} title="History" onClick={() => setHistoryOpen(true)}>
          <History size={20} />
        </button>
        <button className="rail-button" title="Keychain">
          <ShieldCheck size={20} />
        </button>
        <div className="rail-spacer" />
        <button className="rail-button" title="Appearance" onClick={() => setAppearanceOpen(true)}>
          <Palette size={20} />
        </button>
        <button className="rail-button" title="Settings" onClick={() => nativeClient ? setSecurityOpen(true) : setSyncOpen(true)}>
          <Settings size={20} />
        </button>
      </aside>

      <aside className="hosts-panel" aria-hidden={!hostsPanelOpen}>
        <div className="panel-titlebar">
          <div>
            <div className="brand-name">SelfTerm</div>
            <div className="brand-subtitle">Personal vault</div>
          </div>
          <div className="panel-actions">
            <button className="icon-button strong" title="Add host" onClick={() => setEditorHost({ ...emptyHost })}>
              <Plus size={17} />
            </button>
            <button className="icon-button" title="Hide hosts" onClick={() => setHostsPanelOpen(false)}>
              <PanelLeftClose size={17} />
            </button>
          </div>
        </div>

        <div className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
        </div>
        <select className="group-filter panel-filter" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} title="Group filter">
          <option value="all">All groups</option>
          {groupOptions.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>

        <div className="quick-actions">
          <button className="mini-action" onClick={() => setEditorHost({ ...emptyHost })}>
            <Plus size={15} />
            New host
          </button>
          <button className="mini-action" disabled={!selectedHost} onClick={() => beginConnect(selectedHost)}>
            <TerminalSquare size={15} />
            Terminal
          </button>
        </div>

        <div className="host-groups">
          {groups.map(([group, groupHosts]) => (
            <HostGroup
              key={group}
              group={group}
              hosts={groupHosts}
              selectedHostId={selectedHost?.id}
              onSelect={(host) => setSelectedHostId(host.id)}
              onConnect={beginConnect}
              onEdit={(host) => setEditorHost(host)}
              onDelete={deleteHost}
            />
          ))}
        </div>

        <div className="vault-footer">
          <button className="footer-button" onClick={() => setSyncOpen(true)}>
            <Cloud size={16} />
            Sync
          </button>
          <button className="footer-button" onClick={() => setAppearanceOpen(true)}>
            <Palette size={16} />
            Theme
          </button>
        </div>
      </aside>

      <main className="workspace">
        {tabs.length ? (
          <section className="terminal-zone">
            <div className="tab-row">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={classNames('tab-button', activeTabId === tab.id && 'active')}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  <span className={classNames('status-dot', tab.status)} />
                  <span>{tab.title}</span>
                  <X
                    size={14}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                  />
                </button>
              ))}
            </div>

            <div className="terminal-stage">
              {tabs.map((tab) => {
                const host = hosts.find((item) => item.id === tab.hostId);
                return (
                  <TerminalPane
                    key={tab.id}
                    tab={tab}
                    host={host}
                    active={activeTabId === tab.id}
                    appTheme={activeTheme}
                    terminalFont={activeTerminalFont}
                    terminalFontSize={activeTerminalFontSize}
                    terminalTextColor={activeTerminalTextColor}
                    onStatus={(status) => updateTab(tab.id, { status })}
                    onError={(message) => updateTab(tab.id, { status: 'error', error: message })}
                  />
                );
              })}
            </div>
          </section>
        ) : (
          <HostGridView
            hosts={filteredHosts}
            totalHosts={hosts.length}
            query={query}
            groupFilter={groupFilter}
            groupOptions={groupOptions}
            onQuery={setQuery}
            onGroupFilter={setGroupFilter}
            onNew={() => setEditorHost({ ...emptyHost })}
            onEdit={(host) => setEditorHost(host)}
            onConnect={(host) => {
              setSelectedHostId(host.id);
              beginConnect(host);
            }}
          />
        )}
      </main>

      {editorHost && (
        <HostEditor
          host={editorHost}
          onClose={() => setEditorHost(null)}
          onSave={async (host) => {
            const next = await refreshVault(window.selfterm.saveHost(host));
            setSelectedHostId(host.id || next.hosts[0]?.id || '');
            setEditorHost(null);
            setToast('Host updated');
          }}
        />
      )}

      {connectHost && (
        <ConnectDialog host={connectHost} onClose={() => setConnectHost(null)} onConnect={(secrets) => openTab(connectHost, secrets)} />
      )}

      {securityOpen && <SecurityDrawer onClose={() => setSecurityOpen(false)} onAppearance={() => { setSecurityOpen(false); setAppearanceOpen(true); }} />}

      {syncOpen && (
        <SyncDrawer
          settings={vault.settings}
          passphrase={syncPassphrase}
          onPassphrase={setSyncPassphrase}
          onClose={() => setSyncOpen(false)}
          onSave={saveSyncSettings}
          onPush={pushVault}
          onPull={pullVault}
        />
      )}

      {appearanceOpen && (
        <AppearanceDrawer
          settings={vault.settings}
          onClose={() => setAppearanceOpen(false)}
          onApply={applyAppearanceSettings}
        />
      )}

      {historyOpen && (
        <HistoryDrawer
          history={vault.history || []}
          hosts={hosts}
          onClose={() => setHistoryOpen(false)}
          onConnect={(host) => {
            setSelectedHostId(host.id);
            setHistoryOpen(false);
            beginConnect(host);
          }}
        />
      )}

      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function HostGroup({ group, hosts, selectedHostId, onSelect, onConnect, onEdit, onDelete }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="group-block">
      <button className="group-title" onClick={() => setOpen((value) => !value)}>
        <ChevronDown size={15} className={classNames(!open && 'closed')} />
        <span>{group}</span>
        <em>{hosts.length}</em>
      </button>
      {open && (
        <div className="host-list">
          {hosts.map((host) => (
            <button
              key={host.id}
              className={classNames('host-card', selectedHostId === host.id && 'selected')}
              onClick={() => {
                onSelect(host);
                onConnect(host);
              }}
            >
              <span className="host-icon" style={{ '--host-color': host.color }}>
                <HardDrive size={19} />
              </span>
              <span className="host-copy">
                <strong>{host.label}</strong>
                <small>{host.username}@{host.hostname}:{host.port || 22}</small>
                <span className="tag-row">
                  {hostTags(host).map((tag) => (
                    <em key={tag}>{tag}</em>
                  ))}
                </span>
              </span>
              <span className="host-actions">
                <span
                  className="mini-icon"
                  role="button"
                  tabIndex={0}
                  title="Edit"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(host);
                  }}
                >
                  <Edit3 size={14} />
                </span>
                <span
                  className="mini-icon"
                  role="button"
                  tabIndex={0}
                  title="Delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(host);
                  }}
                >
                  <Trash2 size={14} />
                </span>
                <span
                  className="connect-icon"
                  role="button"
                  tabIndex={0}
                  title="Connect"
                  onClick={(event) => {
                    event.stopPropagation();
                    onConnect(host);
                  }}
                >
                  <MonitorUp size={15} />
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HostGridView({ hosts, totalHosts, query, groupFilter, groupOptions, onQuery, onGroupFilter, onNew, onEdit, onConnect }) {
  function handleKey(event, host) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onConnect(host);
  }

  return (
    <section className="hosts-home">
      <div className="home-toolbar">
        <div>
          <h1>Hosts</h1>
          <p>{totalHosts} hosts</p>
        </div>
        <div className="home-actions">
          <div className="search-box home-search">
            <Search size={17} />
            <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search" />
          </div>
          <select className="group-filter" value={groupFilter} onChange={(event) => onGroupFilter(event.target.value)} title="Group filter">
            <option value="all">All groups</option>
            {groupOptions.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
          <button className="primary-button" onClick={onNew}>
            <Plus size={17} />
            New host
          </button>
        </div>
      </div>

      {hosts.length ? (
        <div className="home-grid">
          {hosts.map((host) => (
            <div
              key={host.id}
              className="home-card"
              role="button"
              tabIndex={0}
              onClick={() => onConnect(host)}
              onKeyDown={(event) => handleKey(event, host)}
            >
              <div className="home-card-head">
                <span className="home-host-icon" style={{ '--host-color': host.color }}>
                  <HardDrive size={22} />
                </span>
                <button
                  className="mini-icon"
                  title="Edit"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(host);
                  }}
                >
                  <Edit3 size={14} />
                </button>
              </div>
              <div className="home-card-copy">
                <strong>{host.label}</strong>
                <small>{host.username}@{host.hostname}:{host.port || 22}</small>
              </div>
              <div className="tag-row">
                {hostTags(host).map((tag) => (
                  <em key={tag}>{tag}</em>
                ))}
              </div>
              <div className="home-card-foot">
                <MonitorUp size={16} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="home-empty">
          <Server size={34} />
          <h2>{query ? 'No matches' : 'No hosts'}</h2>
          <button className="primary-button" onClick={onNew}>
            <Plus size={17} />
            New host
          </button>
        </div>
      )}
    </section>
  );
}

function HistoryDrawer({ history, hosts, onClose, onConnect }) {
  const hostById = useMemo(() => new Map(hosts.map((host) => [host.id, host])), [hosts]);

  return (
    <div className="drawer-wrap">
      <aside className="sync-drawer history-drawer">
        <div className="modal-head">
          <div>
            <h2>Login history</h2>
            <p>Recent successful sessions.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        {history.length ? (
          <div className="history-list">
            {history.map((entry) => {
              const host = hostById.get(entry.hostId);
              return (
                <button
                  key={entry.id}
                  className="history-item"
                  disabled={!host}
                  title={host ? 'Open session' : 'Host was removed'}
                  onClick={() => host && onConnect(host)}
                >
                  <span className="history-icon" style={{ '--host-color': entry.color || host?.color || '#47c2a8' }}>
                    <History size={16} />
                  </span>
                  <span className="history-copy">
                    <strong>{entry.label || entry.hostname}</strong>
                    <small>{entry.username}@{entry.hostname}:{entry.port || 22}</small>
                    <em>{entry.group || 'Ungrouped'} - {formatDate(entry.connectedAt)}</em>
                  </span>
                  <MonitorUp size={16} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="history-empty">
            <History size={32} />
            <strong>No history yet</strong>
            <span>Successful logins will appear here.</span>
          </div>
        )}
      </aside>
    </div>
  );
}

function DetailItem({ icon, label, value }) {
  return (
    <div className="detail-item">
      {icon}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function TerminalPane({ tab, host, active, appTheme, terminalFont, terminalFontSize, terminalTextColor, onStatus, onError }) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitRef = useRef(null);
  const connectedRef = useRef(false);
  const onStatusRef = useRef(onStatus);
  const onErrorRef = useRef(onError);
  const secretsRef = useRef(tab.secrets);
  const hostId = host?.id || '';

  useEffect(() => {
    onStatusRef.current = onStatus;
    onErrorRef.current = onError;
  }, [onError, onStatus]);

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: terminalFontStack(terminalFont),
      fontSize: terminalFontSize,
      lineHeight: 1.18,
      letterSpacing: 0,
      scrollback: 10000,
      convertEol: true,
      theme: terminalTheme(appTheme, terminalTextColor),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(containerRef.current);
    const fitTerminal = (delay = 0) => {
      const run = () => {
        if (!terminalRef.current || !fitRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;
        fitRef.current.fit();
        terminalRef.current.scrollToBottom();
        window.selfterm.resize({
          sessionId: tab.id,
          cols: terminalRef.current.cols,
          rows: terminalRef.current.rows,
        });
      };

      if (delay) {
        window.setTimeout(() => requestAnimationFrame(run), delay);
        return;
      }
      requestAnimationFrame(run);
    };
    const settleFit = () => {
      fitTerminal();
      fitTerminal(60);
      fitTerminal(180);
      fitTerminal(360);
    };
    settleFit();
    terminal.focus();
    terminal.writeln(`\x1b[38;5;73mSelfTerm\x1b[0m connecting to ${tab.subtitle}`);

    terminal.onData((data) => {
      window.selfterm.write({ sessionId: tab.id, data });
    });

    terminalRef.current = terminal;
    fitRef.current = fit;

    const resizeObserver = new ResizeObserver(settleFit);
    resizeObserver.observe(containerRef.current);

    const connect = async () => {
      if (!hostId || connectedRef.current) return;
      connectedRef.current = true;
      try {
        await window.selfterm.connect({
          sessionId: tab.id,
          hostId,
          password: secretsRef.current?.password || '',
          keyPassphrase: secretsRef.current?.keyPassphrase || '',
          rememberPassword: Boolean(secretsRef.current?.rememberPassword),
          cols: terminal.cols,
          rows: terminal.rows,
        });
      } catch (error) {
        onErrorRef.current(error.message);
        terminal.writeln(`\r\n\x1b[31m${error.message}\x1b[0m`);
      }
    };

    connect();

    return () => {
      resizeObserver.disconnect();
      window.selfterm.disconnect(tab.id);
      terminal.dispose();
    };
  }, [hostId, tab.id, tab.subtitle]);

  useEffect(() => {
    if (!terminalRef.current) return;
    terminalRef.current.options.theme = terminalTheme(appTheme, terminalTextColor);
    terminalRef.current.refresh(0, Math.max(0, terminalRef.current.rows - 1));
    terminalRef.current.scrollToBottom();
  }, [appTheme, terminalTextColor]);

  useEffect(() => {
    if (!terminalRef.current) return;
    const terminal = terminalRef.current;
    terminal.options.fontFamily = terminalFontStack(terminalFont);
    terminal.options.fontSize = terminalFontSize;

    const refit = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      fitRef.current?.fit();
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
      terminal.scrollToBottom();
      window.selfterm.resize({
        sessionId: tab.id,
        cols: terminal.cols,
        rows: terminal.rows,
      });
    };

    requestAnimationFrame(refit);
    window.setTimeout(refit, 40);
    window.setTimeout(refit, 140);
    window.setTimeout(refit, 320);
  }, [terminalFont, terminalFontSize]);

  useEffect(() => {
    const offData = window.selfterm.onData(({ sessionId, data }) => {
      if (sessionId === tab.id) {
        terminalRef.current?.write(data, () => terminalRef.current?.scrollToBottom());
      }
    });
    const offStatus = window.selfterm.onStatus(({ sessionId, status }) => {
      if (sessionId === tab.id) {
        onStatusRef.current(status);
        if (status === 'connected') terminalRef.current?.writeln('\r\n\x1b[32mConnected\x1b[0m');
        if (status === 'closed') terminalRef.current?.writeln('\r\n\x1b[33mSession closed\x1b[0m');
        terminalRef.current?.scrollToBottom();
      }
    });
    const offError = window.selfterm.onError(({ sessionId, message }) => {
      if (sessionId === tab.id) {
        onErrorRef.current(message);
        terminalRef.current?.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
      }
    });

    return () => {
      offData();
      offStatus();
      offError();
    };
  }, [tab.id]);

  useEffect(() => {
    const resize = () => {
      if (!fitRef.current || !terminalRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      fitRef.current.fit();
      terminalRef.current.scrollToBottom();
      window.selfterm.resize({
        sessionId: tab.id,
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows,
      });
    };
    if (active) {
      requestAnimationFrame(resize);
      window.setTimeout(resize, 60);
      window.setTimeout(resize, 180);
      window.setTimeout(resize, 360);
    }
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [active, tab.id]);

  const isConnecting = tab.status === 'new' || tab.status === 'connecting';

  return (
    <div className={classNames('terminal-pane', active && 'active')}>
      <div ref={containerRef} className="terminal-mount" />
      {isConnecting && (
        <div className="connect-overlay">
          <div className="cloud-loader">
            <Cloud size={22} />
            <span />
          </div>
          <div className="connect-copy">
            <strong>Opening secure shell</strong>
            <small>{tab.subtitle}</small>
          </div>
          <div className="connect-progress">
            <i />
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyTerminal({ host, onConnect, onEdit }) {
  return (
    <div className="empty-terminal">
      <TerminalSquare size={42} />
      <h2>{host ? host.label : 'Create your first host'}</h2>
      <p>{host ? `${host.username}@${host.hostname}:${host.port || 22}` : 'Saved hosts appear as cards in your vault.'}</p>
      <div className="empty-actions">
        <button className="primary-button" disabled={!host} onClick={() => onConnect(host)}>
          <Zap size={17} />
          Connect
        </button>
        <button className="ghost-button" disabled={!host} onClick={() => onEdit(host)}>
          <Edit3 size={16} />
          Edit
        </button>
      </div>
    </div>
  );
}

function HostEditor({ host, onClose, onSave }) {
  const [draft, setDraft] = useState(host);
  const [error, setError] = useState('');

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function pickKey() {
    const keyPath = await window.selfterm.selectKey();
    if (keyPath) update('keyPath', keyPath);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSave(draft);
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <div className="overlay">
      <form className="modal host-editor" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>{draft.id ? 'Edit host' : 'New host'}</h2>
            <p>SSH profile stored in your local vault.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="form-grid">
          <label>
            Label
            <input value={draft.label} onChange={(event) => update('label', event.target.value)} placeholder="Production API" />
          </label>
          <label>
            Group
            <input value={draft.group} onChange={(event) => update('group', event.target.value)} placeholder="Servers" />
          </label>
          <label>
            Hostname
            <input value={draft.hostname} onChange={(event) => update('hostname', event.target.value)} placeholder="10.0.0.12" required />
          </label>
          <label>
            Port
            <input type="number" min="1" value={draft.port} onChange={(event) => update('port', event.target.value)} required />
          </label>
          <label>
            Username
            <input value={draft.username} onChange={(event) => update('username', event.target.value)} placeholder="root" required />
          </label>
          <label>
            Auth
            <select value={draft.authMethod} onChange={(event) => update('authMethod', event.target.value)}>
              <option value="agent">SSH agent</option>
              <option value="key">Private key</option>
              <option value="password">Password</option>
            </select>
          </label>
        </div>

        {draft.authMethod === 'key' && (
          <label className="wide-field">
            Private key path
            <div className="path-picker">
              <input value={draft.keyPath} onChange={(event) => update('keyPath', event.target.value)} placeholder="/home/user/.ssh/id_ed25519" />
              <button type="button" className="ghost-button" onClick={pickKey}>
                <Folder size={16} />
                Browse
              </button>
            </div>
          </label>
        )}

        {draft.authMethod === 'password' && (
          <div className="password-save-block">
            <label className="wide-field">
              Stored password
              <input
                type="password"
                value={draft.password || ''}
                onChange={(event) => update('password', event.target.value)}
                placeholder={draft.hasSavedPassword ? 'Stored password unchanged' : 'Optional, stored after Save host'}
              />
            </label>
            <div className="secret-note">
              <Lock size={15} />
              <span>Password is encrypted with this Linux account keyring.</span>
            </div>
          </div>
        )}

        <label className="wide-field">
          Notes
          <textarea value={draft.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Optional admin notes" />
        </label>

        <div className="swatches">
          {swatches.map((color) => (
            <button
              type="button"
              key={color}
              className={classNames('swatch', draft.color === color && 'selected')}
              style={{ '--host-color': color }}
              onClick={() => update('color', color)}
              title={color}
            />
          ))}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            <Check size={17} />
            Save host
          </button>
        </div>
      </form>
    </div>
  );
}

function ConnectDialog({ host, onClose, onConnect }) {
  const [password, setPassword] = useState('');
  const [keyPassphrase, setKeyPassphrase] = useState('');
  const [rememberPassword, setRememberPassword] = useState(host.authMethod === 'password');

  return (
    <div className="overlay">
      <form
        className="modal connect-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onConnect({ password, keyPassphrase, rememberPassword });
        }}
      >
        <div className="modal-head">
          <div>
            <h2>Connect</h2>
            <p>{host.username}@{host.hostname}:{host.port}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        {host.authMethod === 'password' && (
          <>
            <label>
              Password
              <input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <label className="check-row modal-check">
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={(event) => setRememberPassword(event.target.checked)}
              />
              <span>Remember on this device</span>
            </label>
          </>
        )}

        {host.authMethod === 'key' && (
          <label>
            Key passphrase
            <input autoFocus type="password" value={keyPassphrase} onChange={(event) => setKeyPassphrase(event.target.value)} placeholder="Only if key is encrypted" />
          </label>
        )}

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            <Lock size={17} />
            Open session
          </button>
        </div>
      </form>
    </div>
  );
}

function AppearanceDrawer({ settings, onClose, onApply }) {
  const [draft, setDraft] = useState({
    ...settings,
    theme: settings.theme || 'termius-dark',
    uiFont: normalizeUiFont(settings.uiFont),
    terminalFont: normalizeTerminalFont(settings.terminalFont),
    uiFontSize: clampNumber(settings.uiFontSize, 12, 18, 14),
    terminalFontSize: clampNumber(settings.terminalFontSize, 11, 22, 13),
    uiTextColor: normalizeColor(settings.uiTextColor),
    terminalTextColor: normalizeColor(settings.terminalTextColor),
  });

  function update(field, value) {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      onApply(next);
      return next;
    });
  }

  return (
    <div className="drawer-wrap">
      <aside className="sync-drawer appearance-drawer">
        <div className="modal-head">
          <div>
            <h2>Appearance</h2>
            <p>Theme and type preferences.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="drawer-section">
          <div className="drawer-label">Themes</div>
          <div className="theme-grid">
            {themeOptions.map((theme) => (
              <button
                key={theme.id}
                className={classNames('theme-tile', draft.theme === theme.id && 'selected')}
                data-preview={theme.id}
                onClick={() => update('theme', theme.id)}
              >
                <span>{theme.label}</span>
              </button>
            ))}
          </div>
        </div>

        <SizeControl
          label="UI font size"
          value={draft.uiFontSize}
          min={12}
          max={18}
          onChange={(value) => update('uiFontSize', value)}
        />

        <div className="drawer-section">
          <div className="drawer-label">UI font</div>
          <div className="font-grid">
            {uiFontOptions.map((font) => (
              <button
                key={font.id}
                className={classNames('font-card', draft.uiFont === font.id && 'selected')}
                style={{ fontFamily: uiFontStack(font.id), color: draft.uiTextColor || undefined }}
                onClick={() => update('uiFont', font.id)}
              >
                <strong>Aa Host Vault</strong>
                <span>{font.label}</span>
              </button>
            ))}
          </div>
        </div>

        <TextColorControl
          label="UI font color"
          value={draft.uiTextColor}
          onChange={(value) => update('uiTextColor', value)}
        />

        <SizeControl
          label="Terminal font size"
          value={draft.terminalFontSize}
          min={11}
          max={22}
          onChange={(value) => update('terminalFontSize', value)}
        />

        <div className="drawer-section">
          <div className="drawer-label">Terminal font</div>
          <div className="font-grid">
            {terminalFontOptions.map((font) => (
              <button
                key={font.id}
                className={classNames('font-card mono', draft.terminalFont === font.id && 'selected')}
                style={{ fontFamily: terminalFontStack(font.id), color: draft.terminalTextColor || undefined }}
                onClick={() => update('terminalFont', font.id)}
              >
                <strong>0O1 Il | $ ssh</strong>
                <span>{font.label}</span>
              </button>
            ))}
          </div>
        </div>

        <TextColorControl
          label="Terminal font color"
          value={draft.terminalTextColor}
          onChange={(value) => update('terminalTextColor', value)}
        />
      </aside>
    </div>
  );
}

function TextColorControl({ label, value, onChange }) {
  const current = normalizeColor(value);

  return (
    <div className="drawer-section color-section">
      <div className="drawer-label">{label}</div>
      <div className="color-grid">
        <button
          className={classNames('color-choice default', !current && 'selected')}
          onClick={() => onChange('')}
        >
          <span />
          Default
        </button>
        {textColorOptions.map((color) => (
          <button
            key={color.id}
            className={classNames('color-choice', current === color.value && 'selected')}
            onClick={() => onChange(color.value)}
          >
            <span style={{ '--choice-color': color.value }} />
            {color.label}
          </button>
        ))}
      </div>
      <label className="color-picker-row">
        <span>Custom</span>
        <input type="color" value={current || '#63d6ba'} onChange={(event) => onChange(event.target.value)} />
        <strong>{current || 'Theme default'}</strong>
      </label>
    </div>
  );
}

function SizeControl({ label, value, min, max, onChange }) {
  return (
    <div className="size-control">
      <div className="drawer-label">{label}</div>
      <div className="size-row">
        <button className="size-stepper" onClick={() => onChange(clampNumber(value - 1, min, max, min))}>
          -
        </button>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(clampNumber(event.target.value, min, max, value))}
        />
        <button className="size-stepper" onClick={() => onChange(clampNumber(value + 1, min, max, max))}>
          +
        </button>
        <strong>{value}px</strong>
      </div>
    </div>
  );
}

function SyncDrawer({ settings, passphrase, onPassphrase, onClose, onSave, onPush, onPull }) {
  const [draft, setDraft] = useState(settings);

  return (
    <div className="drawer-wrap">
      <aside className="sync-drawer">
        <div className="modal-head">
          <div>
            <h2>Self-host sync</h2>
            <p>Encrypted vault storage on your own server.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <label>
          Server URL
          <input value={draft.syncUrl} onChange={(event) => setDraft({ ...draft, syncUrl: event.target.value })} placeholder="https://sync.example.com" />
        </label>

        <label>
          Sync token
          <input type="password" value={draft.syncToken} onChange={(event) => setDraft({ ...draft, syncToken: event.target.value })} placeholder="Bearer token" />
        </label>

        <label>
          Vault passphrase
          <input type="password" value={passphrase} onChange={(event) => onPassphrase(event.target.value)} placeholder="Used only for encryption/decryption" />
        </label>

        <button className="ghost-button full" onClick={() => onSave(draft)}>
          <Settings size={16} />
          Save settings
        </button>

        <div className="sync-actions">
          <button className="primary-button" onClick={onPush}>
            <UploadCloud size={17} />
            Push
          </button>
          <button className="ghost-button" onClick={onPull}>
            <DownloadCloud size={17} />
            Pull
          </button>
        </div>

        <div className="sync-note">
          <Lock size={16} />
          The server stores only encrypted ciphertext. Keep the passphrase somewhere safe.
        </div>
      </aside>
    </div>
  );
}

export default App;
