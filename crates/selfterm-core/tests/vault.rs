use selfterm_core::{crypto, domain::VaultPayload, storage::Storage, Error};

#[test]
fn encrypted_vault_survives_reopen_and_rejects_wrong_key_tamper_and_stale_save() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("selfterm.sqlite3");
    let password = "public fixture passphrase";
    let (envelope, key, recovery) = crypto::create(password, &VaultPayload::default()).unwrap();
    let id = envelope.vault_id;
    let mut storage = Storage::open(&path).unwrap();
    assert_eq!(storage.save(&envelope, 0).unwrap(), 1);
    assert!(matches!(storage.save(&envelope, 0), Err(Error::Conflict)));
    drop(storage);
    let mut storage = Storage::open(&path).unwrap();
    let (read, generation) = storage.load(id).unwrap().unwrap();
    let (_, payload) = crypto::unlock(&read, password).unwrap();
    assert_eq!(payload.schema_version, 2);
    assert!(matches!(
        crypto::unlock(&read, "incorrect fixture password"),
        Err(Error::WrongKey)
    ));
    assert_eq!(
        crypto::recover(&read, &recovery).unwrap().1.schema_version,
        2
    );
    let mut changed = read.clone();
    changed.vault_id = uuid::Uuid::new_v4();
    assert!(crypto::unlock(&changed, password).is_err());
    let next = crypto::update(&read, &key, &payload).unwrap();
    assert_ne!(next.nonce, read.nonce);
    assert_eq!(storage.save(&next, generation).unwrap(), 2);
    assert!(matches!(
        storage.save(&read, generation),
        Err(Error::Conflict)
    ));
    assert_eq!(storage.load(id).unwrap().unwrap().1, 2);
}

#[test]
fn unsupported_kdf_is_rejected_before_memory_allocation_and_corrupt_db_is_preserved() {
    let (mut envelope, _, _) =
        crypto::create("public fixture passphrase", &VaultPayload::default()).unwrap();
    envelope.passphrase_wrap.memory_ki_b = u32::MAX;
    assert!(matches!(
        crypto::unlock(&envelope, "public fixture passphrase"),
        Err(Error::CorruptStorage)
    ));
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("selfterm.sqlite3");
    std::fs::write(&path, b"corrupt-original").unwrap();
    assert!(Storage::open(&path).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), b"corrupt-original");
}
