use selfterm_core::{
    domain::{CredentialRef, Host},
    storage::Storage,
    vault::VaultService,
    Error,
};
use uuid::Uuid;
use zeroize::Zeroizing;

#[test]
fn secrets_stay_native_and_locked_service_cannot_read_or_mutate() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vault.sqlite3");
    let mut service = VaultService::new(Storage::open(&path).unwrap());
    let (view, recovery) = service.create("public fixture passphrase").unwrap();
    let vault_id = view.id;
    let host_id = Uuid::new_v4();
    let sentinel = b"fixture-password-never-in-renderer-or-database";
    let host = Host {
        id: host_id,
        label: "fixture-private-label".into(),
        hostname: "fixture.invalid".into(),
        port: 22,
        username: "fixture".into(),
        group: String::new(),
        color: String::new(),
        notes: String::new(),
        auth: CredentialRef::Password {
            secret_id: Uuid::new_v4(),
        },
        created_at: 0,
        updated_at: 0,
    };
    let public = service
        .save_host(host, Some(Zeroizing::new(sentinel.to_vec())))
        .unwrap();
    let json = serde_json::to_string(&public).unwrap();
    assert!(!json.contains(std::str::from_utf8(sentinel).unwrap()));
    assert!(!json.contains("\"secrets\""));
    assert!(json.contains("secretId"));
    assert_eq!(
        service.credential(host_id).unwrap().unwrap().as_slice(),
        sentinel
    );
    service.lock();
    assert!(service.is_locked());
    assert!(matches!(service.view(), Err(Error::Locked)));
    assert!(matches!(service.credential(host_id), Err(Error::Locked)));
    assert!(matches!(service.delete_host(host_id), Err(Error::Locked)));
    service
        .unlock(vault_id, "public fixture passphrase")
        .unwrap();
    assert_eq!(service.view().unwrap().hosts.len(), 1);
    service.lock();
    assert!(service.recover(vault_id, "invalid-recovery").is_err());
    assert!(service.is_locked());
    service.recover(vault_id, &recovery).unwrap();
    assert_eq!(
        service.credential(host_id).unwrap().unwrap().as_slice(),
        sentinel
    );
    service.delete_host(host_id).unwrap();
    assert!(service.view().unwrap().hosts.is_empty());
    drop(service);
    for entry in std::fs::read_dir(dir.path()).unwrap() {
        let bytes = std::fs::read(entry.unwrap().path()).unwrap();
        for value in [sentinel.as_slice(), b"fixture-private-label".as_slice()] {
            assert!(!bytes.windows(value.len()).any(|window| window == value));
        }
    }
}
