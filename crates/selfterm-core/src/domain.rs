use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum CredentialRef {
    Password { secret_id: Uuid },
    ImportedKey { secret_id: Uuid },
    LocalKey { binding_id: Uuid },
    Agent,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Host {
    pub id: Uuid,
    pub label: String,
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub group: String,
    pub color: String,
    pub notes: String,
    pub auth: CredentialRef,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Host {
    pub fn validate(&self) -> Result<()> {
        if self.id.is_nil() || self.port == 0 {
            return Err(Error::InvalidInput("host identity or port"));
        }
        for (value, max) in [
            (&self.label, 256),
            (&self.hostname, 1024),
            (&self.username, 1024),
            (&self.group, 256),
            (&self.notes, 65536),
            (&self.color, 64),
        ] {
            if value.len() > max {
                return Err(Error::InvalidInput("host field too large"));
            }
        }
        if self.hostname.trim().is_empty() || self.username.trim().is_empty() {
            return Err(Error::InvalidInput("hostname and username required"));
        }
        Ok(())
    }
}

#[derive(Clone, Serialize, Deserialize, zeroize::Zeroize, zeroize::ZeroizeOnDrop)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VaultSecret {
    #[zeroize(skip)]
    pub id: Uuid,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppearanceSettings {
    pub theme: String,
    pub ui_font: String,
    pub terminal_font: String,
    pub ui_font_size: u16,
    pub terminal_font_size: u16,
    pub ui_text_color: String,
    pub terminal_text_color: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Tombstone {
    pub id: Uuid,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VaultPayload {
    pub schema_version: u32,
    pub hosts: Vec<Host>,
    pub secrets: Vec<VaultSecret>,
    pub tombstones: Vec<Tombstone>,
    pub appearance: AppearanceSettings,
}

impl Default for VaultPayload {
    fn default() -> Self {
        Self {
            schema_version: 2,
            hosts: vec![],
            secrets: vec![],
            tombstones: vec![],
            appearance: AppearanceSettings {
                theme: "termius-dark".into(),
                ui_font: "system".into(),
                terminal_font: "jetbrains".into(),
                ui_font_size: 14,
                terminal_font_size: 13,
                ..Default::default()
            },
        }
    }
}

impl VaultPayload {
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != 2 {
            return Err(Error::CorruptStorage);
        }
        if self.hosts.len() > 10000 || self.secrets.len() > 20000 || self.tombstones.len() > 20000 {
            return Err(Error::InvalidInput("vault collection limit"));
        }
        if !(8..=48).contains(&self.appearance.ui_font_size)
            || !(8..=48).contains(&self.appearance.terminal_font_size)
        {
            return Err(Error::InvalidInput("font size"));
        }
        for field in [
            &self.appearance.theme,
            &self.appearance.ui_font,
            &self.appearance.terminal_font,
            &self.appearance.ui_text_color,
            &self.appearance.terminal_text_color,
        ] {
            if field.len() > 128 {
                return Err(Error::InvalidInput("appearance field too large"));
            }
        }
        let mut ids = std::collections::HashSet::new();
        for host in &self.hosts {
            host.validate()?;
            if !ids.insert(host.id) {
                return Err(Error::InvalidInput("duplicate host ID"));
            }
        }
        let mut deleted = std::collections::HashSet::new();
        for tombstone in &self.tombstones {
            if tombstone.id.is_nil() || ids.contains(&tombstone.id) || !deleted.insert(tombstone.id)
            {
                return Err(Error::InvalidInput("invalid tombstone"));
            }
        }
        let mut secret_ids = std::collections::HashSet::new();
        for secret in &self.secrets {
            if secret.id.is_nil()
                || secret.bytes.len() > 256 * 1024
                || !secret_ids.insert(secret.id)
            {
                return Err(Error::InvalidInput("invalid secret"));
            }
        }
        for host in &self.hosts {
            if let CredentialRef::Password { secret_id }
            | CredentialRef::ImportedKey { secret_id } = host.auth
            {
                if !secret_ids.contains(&secret_id) {
                    return Err(Error::InvalidInput("missing secret"));
                }
            }
        }
        Ok(())
    }
}
