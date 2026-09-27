use selfterm_core::{
    domain::{AppearanceSettings, CredentialRef, Host},
    storage::Storage,
    vault::{PublicVault, VaultService},
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use uuid::Uuid;
use zeroize::Zeroizing;

struct VaultWorker {
    vault: VaultService,
    last_active: std::time::Instant,
}
type Service = Arc<Mutex<VaultWorker>>;

// KDF and SQLite work run on a blocking worker, never on the WebView event loop.
async fn work<T: Send + 'static>(
    state: State<'_, Service>,
    operation: impl FnOnce(&mut VaultService) -> selfterm_core::Result<T> + Send + 'static,
) -> Result<T, String> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut service = service
            .lock()
            .map_err(|_| "vault worker unavailable".to_string())?;
        service.last_active = std::time::Instant::now();
        operation(&mut service.vault).map_err(|error| error.to_string())
    })
    .await
    .map_err(|_| "vault worker unavailable".to_string())?
}

#[tauri::command]
async fn vault_ids(state: State<'_, Service>) -> Result<Vec<Uuid>, String> {
    work(state, |s| s.vault_ids()).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedVault {
    vault: PublicVault,
    recovery_key: String,
}

#[tauri::command]
async fn vault_create(
    state: State<'_, Service>,
    passphrase: String,
) -> Result<CreatedVault, String> {
    let passphrase = Zeroizing::new(passphrase);
    work(state, move |s| {
        if !s.vault_ids()?.is_empty() {
            return Err(selfterm_core::Error::InvalidInput(
                "a vault already exists; unlock it first",
            ));
        }
        let (vault, recovery) = s.create(&passphrase)?;
        // Recovery material is disclosed once to the creation screen for offline storage.
        Ok(CreatedVault {
            vault,
            recovery_key: recovery.to_string(),
        })
    })
    .await
}

#[tauri::command]
async fn vault_unlock(
    state: State<'_, Service>,
    id: Uuid,
    passphrase: String,
) -> Result<PublicVault, String> {
    let passphrase = Zeroizing::new(passphrase);
    work(state, move |s| s.unlock(id, &passphrase)).await
}
#[tauri::command]
async fn vault_lock(state: State<'_, Service>) -> Result<(), String> {
    work(state, |s| {
        s.lock();
        Ok(())
    })
    .await
}
#[tauri::command]
async fn vault_recover(
    state: State<'_, Service>,
    id: Uuid,
    recovery_key: String,
) -> Result<PublicVault, String> {
    let recovery_key = Zeroizing::new(recovery_key);
    work(state, move |s| s.recover(id, &recovery_key)).await
}
#[tauri::command]
async fn vault_get(state: State<'_, Service>) -> Result<PublicVault, String> {
    work(state, |s| s.view()).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveHost {
    host: Host,
    secret: Option<String>,
}
#[tauri::command]
async fn vault_save_host(
    state: State<'_, Service>,
    input: SaveHost,
) -> Result<PublicVault, String> {
    let secret = input.secret.map(|s| Zeroizing::new(s.into_bytes()));
    // Local filesystem bindings are handled by a separate native adapter.
    if matches!(input.host.auth, CredentialRef::LocalKey { .. }) {
        return Err("local key binding is not configured".into());
    }
    work(state, move |s| s.save_host(input.host, secret)).await
}
#[tauri::command]
async fn vault_delete_host(state: State<'_, Service>, id: Uuid) -> Result<PublicVault, String> {
    work(state, move |s| s.delete_host(id)).await
}
#[tauri::command]
async fn vault_save_appearance(
    state: State<'_, Service>,
    appearance: AppearanceSettings,
) -> Result<PublicVault, String> {
    work(state, move |s| s.save_appearance(appearance)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                if let Some(service) = window.try_state::<Service>() {
                    if let Ok(mut worker) = service.inner().lock() {
                        worker.vault.lock();
                    }
                }
            }
        })
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("selfterm.sqlite3");
            let service = Arc::new(Mutex::new(VaultWorker {
                vault: VaultService::new(Storage::open(&path)?),
                last_active: std::time::Instant::now(),
            }));
            app.manage(service.clone());
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(30));
                if let Ok(mut worker) = service.lock() {
                    if !worker.vault.is_locked() && worker.last_active.elapsed().as_secs() >= 900 {
                        worker.vault.lock();
                        let _ = handle.emit("vault-locked", ());
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_ids,
            vault_create,
            vault_unlock,
            vault_recover,
            vault_lock,
            vault_get,
            vault_save_host,
            vault_delete_host,
            vault_save_appearance
        ])
        .run(tauri::generate_context!())
        .expect("SelfTerm application failed to start");
}
