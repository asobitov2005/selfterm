import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import App from './App.jsx';
import { nativeClient, vaultCommands } from './nativeBridge.js';
import { listen } from '@tauri-apps/api/event';

export default function NativeRoot() {
  const [ready, setReady] = useState(!nativeClient);
  const [id, setId] = useState('');
  const [protectedVault, setProtectedVault] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!nativeClient) return;
    let alive = true;
    vaultCommands.bootstrap().then((result) => {
      if (alive) { setId(result.id); setProtectedVault(result.passwordEnabled); setReady(result.unlocked); }
    }).catch((err) => { if (alive) setError(String(err)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!nativeClient) return;
    const subscription = listen('vault-locked', () => { setReady(false); setPassword(''); });
    const protectionChanged = (event) => setProtectedVault(event.detail);
    window.addEventListener('selfterm-protection-changed', protectionChanged);
    return () => { subscription.then((off) => off()); window.removeEventListener('selfterm-protection-changed', protectionChanged); };
  }, []);

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (recovering) await vaultCommands.recover(id, password);
      else await vaultCommands.unlock(id, password);
      setReady(true); setPassword('');
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }

  if (ready) return <><App />{nativeClient && protectedVault && <button className="native-lock-button" aria-label="Lock vault" onClick={async () => {
    try { await vaultCommands.lock(); setReady(false); } catch (err) { setError(String(err)); }
  }}><Lock size={14} /> Lock vault</button>}</>;
  if (!protectedVault && !error) return <div aria-busy="true" />;
  return <main className="vault-gate" data-theme="termius-dark">
    <section className="modal vault-gate-card" aria-labelledby="vault-title">
      <div className="vault-gate-brand"><ShieldCheck size={26} /><strong>SelfTerm</strong></div>
      <div className="modal-head"><div><h2 id="vault-title">{protectedVault ? 'Unlock workspace' : 'Could not open workspace'}</h2></div></div>
      {protectedVault && <form onSubmit={submit}>
        <label className="wide-field">{recovering ? 'Recovery key' : 'Password'}<input type="password" autoFocus autoComplete={recovering ? 'off' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button className="primary-button full" disabled={busy}><Lock size={16} />{busy ? 'Opening…' : 'Unlock workspace'}</button>
        <button className="vault-recovery-toggle" type="button" disabled={busy} onClick={() => { setRecovering(!recovering); setPassword(''); setError(''); }}>{recovering ? 'Use password instead' : 'Use recovery key'}</button>
      </form>}
      {error && <p className="vault-error" role="alert">{error}</p>}
    </section>
  </main>;
}
