import React, { useEffect, useState } from 'react';
import { Lock, Palette, X } from 'lucide-react';
import { vaultCommands } from './nativeBridge.js';

export default function SecurityDrawer({ onClose, onAppearance }) {
  const [enabled, setEnabled] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    vaultCommands.protection().then((value) => { if (alive) setEnabled(value); }).catch((err) => { if (alive) setError(String(err)); });
    return () => { alive = false; };
  }, []);

  async function change(enable) {
    setError('');
    if (enable && password !== confirmation) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = await vaultCommands.setProtection(enable, password);
      setEnabled(result.passwordEnabled); setRecovery(result.recoveryKey || '');
      setPassword(''); setConfirmation(''); setSettingUp(false);
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }

  return <div className="drawer-wrap"><aside className="sync-drawer">
    <div className="modal-head"><div><h2>Settings</h2><p>Workspace preferences.</p></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><X size={17} /></button></div>
    <div className="drawer-section"><div className="drawer-label">Appearance</div><button className="ghost-button" onClick={onAppearance}><Palette size={16} /> Theme and fonts</button></div>
    <div className="drawer-section"><div className="drawer-label">Password protection · optional</div>
      <p className="vault-hint">{enabled ? 'A password is required when opening this workspace. Idle locking is enabled.' : 'Your workspace opens automatically. Local data stays encrypted using this device’s secure storage.'}</p>
      {enabled ? <button className="ghost-button" disabled={busy} onClick={() => change(false)}>Turn off password protection</button> : !settingUp && <button className="ghost-button" disabled={busy || enabled === null} onClick={() => setSettingUp(true)}><Lock size={16} /> Enable password protection</button>}
      {settingUp && <form onSubmit={(event) => { event.preventDefault(); change(true); }}>
        <label>Password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
        <button type="submit" className="primary-button full" disabled={busy}>{busy ? 'Saving…' : 'Enable protection'}</button>
        <button type="button" className="ghost-button" disabled={busy} onClick={() => { setSettingUp(false); setPassword(''); setConfirmation(''); }}>Cancel</button>
      </form>}
      {recovery && <><p className="vault-hint">Save this recovery key offline in case you forget your password.</p><pre className="vault-recovery">{recovery}</pre></>}
      {error && <p className="vault-error" role="alert">{error}</p>}
    </div>
  </aside></div>;
}
