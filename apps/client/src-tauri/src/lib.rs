use selfterm_core::{
    domain::{AppearanceSettings, CredentialRef, Host},
    storage::Storage,
    vault::{PublicVault, VaultService},
};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{Emitter, Manager, State};
use uuid::Uuid;
use zeroize::Zeroizing;

struct VaultWorker {
    vault: VaultService,
    last_active: std::time::Instant,
}
type Service = Arc<Mutex<VaultWorker>>;
type Protection = Arc<AtomicBool>;

fn device_entry(id: Uuid) -> selfterm_core::Result<keyring::Entry> {
    keyring::Entry::new("dev.selfterm.client", &format!("vault-{id}"))
        .map_err(|_| selfterm_core::Error::InvalidInput("OS secure storage unavailable"))
}
fn store_device_key(id: Uuid, secret: &[u8]) -> selfterm_core::Result<()> {
    let entry = device_entry(id)?;
    entry
        .set_secret(secret)
        .map_err(|_| selfterm_core::Error::InvalidInput("OS secure storage write failed"))?;
    let read = Zeroizing::new(
        entry
            .get_secret()
            .map_err(|_| selfterm_core::Error::InvalidInput("OS secure storage read failed"))?,
    );
    if read.as_slice() != secret {
        return Err(selfterm_core::Error::InvalidInput(
            "OS secure storage verification failed",
        ));
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    id: Uuid,
    password_enabled: bool,
    unlocked: bool,
}

#[tauri::command]
async fn vault_bootstrap(
    state: State<'_, Service>,
    protection: State<'_, Protection>,
) -> Result<Bootstrap, String> {
    let protection = protection.inner().clone();
    work(state, move |vault| {
        let ids = vault.vault_ids()?;
        if ids.is_empty() {
            // No user passphrase is requested. A fresh native key goes to the OS store
            // before the encrypted envelope is committed to SQLite.
            let internal = Zeroizing::new(format!("{}{}", Uuid::new_v4(), Uuid::new_v4()));
            let mut staged_id = None;
            let result = vault.create_with(&internal, |id, key| {
                staged_id = Some(id);
                store_device_key(id, &key.device_secret())
            });
            let (view, _) = match result {
                Ok(created) => created,
                Err(error) => {
                    if let Some(id) = staged_id {
                        if let Ok(entry) = device_entry(id) {
                            let _ = entry.delete_credential();
                        }
                    }
                    return Err(error);
                }
            };
            protection.store(false, Ordering::SeqCst);
            return Ok(Bootstrap {
                id: view.id,
                password_enabled: false,
                unlocked: true,
            });
        }
        if ids.len() != 1 {
            return Err(selfterm_core::Error::InvalidInput(
                "multiple local vaults need explicit selection",
            ));
        }
        let id = ids[0];
        match device_entry(id)?.get_secret() {
            Ok(secret) => {
                let secret = Zeroizing::new(secret);
                vault.unlock_device(id, &secret)?;
                protection.store(false, Ordering::SeqCst);
                Ok(Bootstrap {
                    id,
                    password_enabled: false,
                    unlocked: true,
                })
            }
            Err(keyring::Error::NoEntry) => {
                protection.store(true, Ordering::SeqCst);
                Ok(Bootstrap {
                    id,
                    password_enabled: true,
                    unlocked: false,
                })
            }
            Err(_) => Err(selfterm_core::Error::InvalidInput(
                "OS secure storage read failed",
            )),
        }
    })
    .await
}

#[tauri::command]
fn vault_protection(protection: State<'_, Protection>) -> bool {
    protection.load(Ordering::SeqCst)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProtectionChanged {
    password_enabled: bool,
    recovery_key: Option<String>,
}

#[tauri::command]
async fn vault_set_protection(
    state: State<'_, Service>,
    protection: State<'_, Protection>,
    enabled: bool,
    passphrase: Option<String>,
) -> Result<ProtectionChanged, String> {
    let protection = protection.inner().clone();
    let passphrase = passphrase.map(Zeroizing::new);
    work(state, move |vault| {
        let id = vault.view()?.id;
        if enabled {
            let password = passphrase
                .as_ref()
                .ok_or(selfterm_core::Error::InvalidInput("enter a password"))?;
            let recovery = vault.set_passphrase(password)?;
            match device_entry(id)?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(_) => {
                    return Err(selfterm_core::Error::InvalidInput(
                        "OS secure storage deletion failed; automatic unlock remains enabled",
                    ))
                }
            }
            protection.store(true, Ordering::SeqCst);
            Ok(ProtectionChanged {
                password_enabled: true,
                recovery_key: Some(recovery.to_string()),
            })
        } else {
            store_device_key(id, &vault.device_secret()?)?;
            protection.store(false, Ordering::SeqCst);
            Ok(ProtectionChanged {
                password_enabled: false,
                recovery_key: None,
            })
        }
    })
    .await
}

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
            let protection = Arc::new(AtomicBool::new(true));
            app.manage(protection.clone());
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(30));
                if let Ok(mut worker) = service.lock() {
                    if protection.load(Ordering::SeqCst)
                        && !worker.vault.is_locked()
                        && worker.last_active.elapsed().as_secs() >= 900
                    {
                        worker.vault.lock();
                        let _ = handle.emit("vault-locked", ());
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_bootstrap,
            vault_protection,
            vault_set_protection,
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
