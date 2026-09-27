//! Owns unlocked secrets. Callers receive a public view, never the serialized payload.
use crate::{
    crypto::{self, VaultKey},
    domain::{AppearanceSettings, CredentialRef, Host, Tombstone, VaultPayload, VaultSecret},
    storage::Storage,
    Error, Result,
};
use selfterm_protocol::EnvelopeV2;
use serde::Serialize;
use uuid::Uuid;
use zeroize::Zeroizing;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicVault {
    pub id: Uuid,
    pub hosts: Vec<Host>,
    pub appearance: AppearanceSettings,
}

struct Unlocked {
    envelope: EnvelopeV2,
    generation: u64,
    key: VaultKey,
    payload: VaultPayload,
}

pub struct VaultService {
    storage: Storage,
    unlocked: Option<Unlocked>,
}

impl VaultService {
    pub fn new(storage: Storage) -> Self {
        Self {
            storage,
            unlocked: None,
        }
    }
    pub fn lock(&mut self) {
        self.unlocked = None;
    }
    pub fn is_locked(&self) -> bool {
        self.unlocked.is_none()
    }
    pub fn create(&mut self, passphrase: &str) -> Result<(PublicVault, Zeroizing<String>)> {
        let (envelope, key, recovery) = crypto::create(passphrase, &VaultPayload::default())?;
        let generation = self.storage.save(&envelope, 0)?;
        self.unlocked = Some(Unlocked {
            envelope,
            key,
            generation,
            payload: VaultPayload::default(),
        });
        Ok((self.view()?, recovery))
    }
    pub fn unlock(&mut self, id: Uuid, passphrase: &str) -> Result<PublicVault> {
        self.lock();
        let (envelope, generation) = self.storage.load(id)?.ok_or(Error::CorruptStorage)?;
        let (key, payload) = crypto::unlock(&envelope, passphrase)?;
        self.unlocked = Some(Unlocked {
            envelope,
            generation,
            key,
            payload,
        });
        self.view()
    }
    pub fn view(&self) -> Result<PublicVault> {
        let state = self.unlocked.as_ref().ok_or(Error::Locked)?;
        Ok(PublicVault {
            id: state.envelope.vault_id,
            hosts: state.payload.hosts.clone(),
            appearance: state.payload.appearance.clone(),
        })
    }
    /// Build and persist a candidate before changing the in-memory state.
    fn mutate(
        &mut self,
        apply: impl FnOnce(&mut VaultPayload) -> Result<()>,
    ) -> Result<PublicVault> {
        let state = self.unlocked.as_mut().ok_or(Error::Locked)?;
        let mut candidate = state.payload.clone();
        apply(&mut candidate)?;
        candidate.validate()?;
        let envelope = crypto::update(&state.envelope, &state.key, &candidate)?;
        let generation = self.storage.save(&envelope, state.generation)?;
        state.payload = candidate;
        state.envelope = envelope;
        state.generation = generation;
        self.view()
    }
    pub fn save_host(
        &mut self,
        host: Host,
        secret: Option<Zeroizing<Vec<u8>>>,
    ) -> Result<PublicVault> {
        self.mutate(move |payload| {
            host.validate()?;
            if let Some(bytes) = secret {
                let id = match host.auth {
                    CredentialRef::Password { secret_id }
                    | CredentialRef::ImportedKey { secret_id } => secret_id,
                    _ => return Err(Error::InvalidInput("credential cannot contain a secret")),
                };
                payload.secrets.retain(|s| s.id != id);
                payload.secrets.push(VaultSecret {
                    id,
                    bytes: bytes.to_vec(),
                });
            }
            payload.hosts.retain(|h| h.id != host.id);
            payload.tombstones.retain(|t| t.id != host.id);
            payload.hosts.push(host);
            remove_unused_secrets(payload);
            Ok(())
        })
    }
    pub fn delete_host(&mut self, id: Uuid) -> Result<PublicVault> {
        self.mutate(|payload| {
            if !payload.hosts.iter().any(|h| h.id == id) {
                return Err(Error::InvalidInput("unknown host"));
            }
            payload.hosts.retain(|h| h.id != id);
            payload.tombstones.push(Tombstone { id });
            remove_unused_secrets(payload);
            Ok(())
        })
    }
    pub fn save_appearance(&mut self, appearance: AppearanceSettings) -> Result<PublicVault> {
        self.mutate(|payload| {
            payload.appearance = appearance;
            Ok(())
        })
    }
    /// For native protocol adapters only. This value must never enter renderer IPC.
    pub fn credential(&self, host_id: Uuid) -> Result<Option<Zeroizing<Vec<u8>>>> {
        let state = self.unlocked.as_ref().ok_or(Error::Locked)?;
        let host = state
            .payload
            .hosts
            .iter()
            .find(|h| h.id == host_id)
            .ok_or(Error::InvalidInput("unknown host"))?;
        match host.auth {
            CredentialRef::Password { secret_id } | CredentialRef::ImportedKey { secret_id } => {
                let secret = state
                    .payload
                    .secrets
                    .iter()
                    .find(|s| s.id == secret_id)
                    .ok_or(Error::CorruptStorage)?;
                Ok(Some(Zeroizing::new(secret.bytes.clone())))
            }
            _ => Ok(None),
        }
    }
}

fn remove_unused_secrets(payload: &mut VaultPayload) {
    payload.secrets.retain(|secret| {
        payload.hosts.iter().any(|host| match host.auth {
            CredentialRef::Password { secret_id } | CredentialRef::ImportedKey { secret_id } => {
                secret.id == secret_id
            }
            _ => false,
        })
    });
}
