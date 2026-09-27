import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import App from './App.jsx';
import { nativeClient, vaultCommands } from './nativeBridge.js';
import { listen } from '@tauri-apps/api/event';

export default function NativeRoot() {
  const [ids, setIds] = useState(null);
  const [ready, setReady] = useState(!nativeClient);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [selected, setSelected] = useState('');
  const [recovery, setRecovery] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!nativeClient) return;
    let alive = true;
    vaultCommands.list().then((list) => { if (alive) { setIds(list); setSelected(list[0] || ''); } }).catch((err) => { if (alive) setError(String(err)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!nativeClient) return;
    const subscription = listen('vault-locked', () => {
      setReady(false); setPassword(''); setConfirmation(''); setRecovery(''); setSaved(false);
    });
    return () => { subscription.then((off) => off()); };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!ids?.length && password !== confirmation) { setError('Passphrases do not match.'); return; }
    setBusy(true);
    try {
      if (ids.length) {
        if (recovering) await vaultCommands.recover(selected, password);
        else await vaultCommands.unlock(selected, password);
        setReady(true);
      } else {
        const created = await vaultCommands.create(password);
        setIds([created.vault.id]);
        setSelected(created.vault.id);
        setRecovery(created.recoveryKey);
      }
      setPassword('');
      setConfirmation('');
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }

  if (ready) return <><App />{nativeClient && <button className="native-lock-button" aria-label="Lock vault" onClick={async () => {
    try { await vaultCommands.lock(); setReady(false); } catch (err) { setError(String(err)); }
  }}><Lock size={14} /> Lock vault</button>}</>;
  return <main className="vault-gate" data-theme="termius-dark">
    <section className="modal vault-gate-card" aria-labelledby="vault-title">
      <div className="vault-gate-brand"><ShieldCheck size={26} /><strong>SelfTerm</strong></div>
      <div className="modal-head"><div><h2 id="vault-title">{recovery ? 'Keep your recovery key safe' : ids?.length ? 'Unlock your workspace' : 'Create your private workspace'}</h2>
        <p>{recovery ? 'Save this key offline. You can use it to recover your encrypted vault if you forget your passphrase.' : 'Your hosts and credentials stay encrypted on this device. No local server is needed.'}</p></div></div>
      {recovery ? <>
        <pre className="vault-recovery">{recovery}</pre>
        <label className="vault-saved"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} /> I saved my recovery key somewhere safe.</label>
        <button className="primary-button full" disabled={!saved} onClick={() => { setRecovery(''); setReady(true); }}>Open workspace</button>
      </> : <form onSubmit={submit}>
        {ids?.length > 1 && <label className="wide-field">Vault<select value={selected} onChange={(event) => setSelected(event.target.value)}>{ids.map((id) => <option key={id}>{id}</option>)}</select></label>}
        <label className="wide-field">{recovering ? 'Recovery key' : 'Passphrase'}<input type="password" autoFocus autoComplete={recovering ? 'off' : ids?.length ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {!ids?.length && <><p className="vault-hint">Use at least 16 characters. Spaces count and are preserved.</p><label className="wide-field">Confirm passphrase<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label></>}
        <button className="primary-button full" disabled={busy || ids === null}><Lock size={16} />{busy ? 'Opening…' : ids?.length ? 'Unlock workspace' : 'Create encrypted vault'}</button>
        {Boolean(ids?.length) && <button className="vault-recovery-toggle" type="button" disabled={busy} onClick={() => { setRecovering(!recovering); setPassword(''); setError(''); }}>{recovering ? 'Use passphrase instead' : 'Use recovery key'}</button>}
      </form>}
      {error && <p className="vault-error" role="alert">{error}</p>}
    </section>
  </main>;
}
