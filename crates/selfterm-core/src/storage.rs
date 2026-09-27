use crate::{Error, Result};
use rusqlite::{params, Connection, OptionalExtension};
use selfterm_protocol::EnvelopeV2;
use std::{path::Path, time::Duration};
use uuid::Uuid;

pub struct Storage {
    connection: Connection,
}
impl Storage {
    pub fn vault_ids(&self) -> Result<Vec<Uuid>> {
        let mut statement = self
            .connection
            .prepare("SELECT vault_id FROM local_vaults ORDER BY vault_id")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        rows.map(|row| Uuid::parse_str(&row?).map_err(|_| Error::CorruptStorage))
            .collect()
    }
    pub fn open(path: &Path) -> Result<Self> {
        if path == Path::new(":memory:") || !path.is_absolute() {
            return Err(Error::InvalidInput(
                "persistent absolute database path required",
            ));
        }
        let parent = path
            .parent()
            .ok_or(Error::InvalidInput("database directory"))?;
        std::fs::create_dir_all(parent)?;
        #[cfg(unix)]
        if !path.exists() {
            use std::os::unix::fs::OpenOptionsExt;
            let _file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(path)?;
        }
        let connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        let version: String = connection.query_row("SELECT sqlite_version()", [], |r| r.get(0))?;
        let numbers: Vec<u32> = version.split('.').map(|s| s.parse().unwrap_or(0)).collect();
        if numbers.as_slice() < [3, 51, 3].as_slice() {
            return Err(Error::CorruptStorage);
        }
        let schema: u32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if schema > 1 {
            return Err(Error::CorruptStorage);
        }
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        if schema == 0 {
            // The first schema is created atomically. Future upgrades require a backup before migration.
            connection.execute_batch("BEGIN IMMEDIATE;
                CREATE TABLE local_vaults(vault_id TEXT PRIMARY KEY, envelope_json TEXT NOT NULL, local_generation INTEGER NOT NULL CHECK(local_generation>0));
                CREATE TABLE device_state(vault_id TEXT PRIMARY KEY REFERENCES local_vaults(vault_id), nonce BLOB NOT NULL, ciphertext BLOB NOT NULL);
                CREATE TABLE sync_state(vault_id TEXT PRIMARY KEY REFERENCES local_vaults(vault_id), nonce BLOB NOT NULL, ciphertext BLOB NOT NULL);
                CREATE TABLE import_ledger(source_digest TEXT PRIMARY KEY, imported_at INTEGER NOT NULL);
                PRAGMA user_version=1; COMMIT;")?;
        }
        Ok(Self { connection })
    }
    pub fn load(&self, id: Uuid) -> Result<Option<(EnvelopeV2, u64)>> {
        let row: Option<(String, i64)> = self
            .connection
            .query_row(
                "SELECT envelope_json,local_generation FROM local_vaults WHERE vault_id=?1",
                [id.to_string()],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        row.map(|(json, generation)| {
            if json.len() > 17 * 1024 * 1024 || generation <= 0 {
                return Err(Error::CorruptStorage);
            }
            let envelope: EnvelopeV2 =
                serde_json::from_str(&json).map_err(|_| Error::CorruptStorage)?;
            envelope.validate().map_err(|_| Error::CorruptStorage)?;
            if envelope.vault_id != id {
                return Err(Error::CorruptStorage);
            }
            Ok((envelope, generation as u64))
        })
        .transpose()
    }
    /// Commit only if the caller holds the generation it originally read.
    pub fn save(&mut self, envelope: &EnvelopeV2, expected_generation: u64) -> Result<u64> {
        envelope.validate().map_err(|_| Error::CorruptStorage)?;
        let next = expected_generation
            .checked_add(1)
            .filter(|n| *n <= i64::MAX as u64)
            .ok_or(Error::Conflict)?;
        let json = serde_json::to_string(envelope).map_err(|_| Error::CorruptStorage)?;
        let tx = self
            .connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let count = if expected_generation == 0 {
            tx.execute("INSERT INTO local_vaults(vault_id,envelope_json,local_generation) VALUES(?1,?2,1) ON CONFLICT DO NOTHING", params![envelope.vault_id.to_string(), json])?
        } else {
            tx.execute("UPDATE local_vaults SET envelope_json=?1,local_generation=?2 WHERE vault_id=?3 AND local_generation=?4", params![json, next as i64, envelope.vault_id.to_string(), expected_generation as i64])?
        };
        if count != 1 {
            return Err(Error::Conflict);
        }
        tx.commit()?;
        Ok(next)
    }
}
