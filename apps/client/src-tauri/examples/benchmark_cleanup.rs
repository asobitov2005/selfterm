//! Remove only device-key entries belonging to an isolated benchmark profile.
use std::{error::Error, path::PathBuf};

fn main() -> Result<(), Box<dyn Error>> {
    let root = PathBuf::from(
        std::env::args_os()
            .nth(1)
            .ok_or("benchmark profile path required")?,
    )
    .canonicalize()?;
    let temporary = std::env::temp_dir().canonicalize()?;
    if root.parent() != Some(temporary.as_path())
        || !root
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|name| name.starts_with("selfterm-benchmark-"))
    {
        return Err("only a temporary SelfTerm benchmark profile is allowed".into());
    }
    let database = root
        .join("tauri/data/dev.selfterm.client/selfterm.sqlite3")
        .canonicalize()?;
    if !database.starts_with(&root) {
        return Err("benchmark database escaped its profile".into());
    }
    let storage = selfterm_core::storage::Storage::open(&database)?;
    let ids = storage.vault_ids()?;
    for id in &ids {
        let entry = keyring::Entry::new("dev.selfterm.client", &format!("vault-{id}"))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(error.into()),
        }
    }
    println!(
        "Removed {} synthetic benchmark device-key entries",
        ids.len()
    );
    Ok(())
}
