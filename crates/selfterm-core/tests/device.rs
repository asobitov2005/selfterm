use selfterm_core::{storage::Storage, vault::VaultService, Error};

#[test]
fn optional_password_preserves_device_unlock_and_secure_store_failure_does_not_commit() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vault.sqlite3");
    let mut vault = VaultService::new(Storage::open(&path).unwrap());
    assert!(vault
        .create_with("internal fixture", |_, _| Err(Error::Random))
        .is_err());
    assert!(vault.vault_ids().unwrap().is_empty());
    assert!(vault.is_locked());
    let mut device_key = None;
    let (view, _) = vault
        .create_with("internal fixture", |_, key| {
            device_key = Some(key.device_secret());
            Ok(())
        })
        .unwrap();
    let id = view.id;
    let device_key = device_key.unwrap();
    drop(vault);
    let mut vault = VaultService::new(Storage::open(&path).unwrap());
    assert!(vault.unlock_device(id, &[0; 32]).is_err());
    assert!(vault.is_locked());
    vault.unlock_device(id, &device_key).unwrap();
    let recovery = vault.set_passphrase("1").unwrap();
    vault.lock();
    assert!(vault.unlock(id, "internal fixture").is_err());
    vault.unlock(id, "1").unwrap();
    vault.lock();
    vault.recover(id, &recovery).unwrap();
    vault.lock();
    vault.unlock_device(id, &device_key).unwrap();
    assert_eq!(vault.view().unwrap().id, id);
}
