use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DecimalU64(pub u64);

impl Serialize for DecimalU64 {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0.to_string())
    }
}
impl<'de> Deserialize<'de> for DecimalU64 {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        if raw.is_empty()
            || !raw.bytes().all(|b| b.is_ascii_digit())
            || (raw.len() > 1 && raw.starts_with('0'))
        {
            return Err(serde::de::Error::custom(
                "expected canonical decimal u64 string",
            ));
        }
        raw.parse().map(Self).map_err(serde::de::Error::custom)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KeyWrap {
    pub nonce: String,
    pub ciphertext: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PassphraseWrap {
    pub kdf: String,
    pub memory_ki_b: u32,
    pub iterations: u32,
    pub parallelism: u32,
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnvelopeV2 {
    pub format: String,
    pub vault_id: Uuid,
    pub key_epoch: DecimalU64,
    pub cipher: String,
    pub nonce: String,
    pub ciphertext: String,
    pub passphrase_wrap: PassphraseWrap,
    pub recovery_wrap: KeyWrap,
}

#[derive(Debug, thiserror::Error)]
#[error("invalid or unsupported vault envelope")]
pub struct InvalidEnvelope;

pub fn decode_fixed<const N: usize>(value: &str) -> Result<[u8; N], InvalidEnvelope> {
    if value.len() > N.div_ceil(3) * 4 {
        return Err(InvalidEnvelope);
    }
    URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| InvalidEnvelope)?
        .try_into()
        .map_err(|_| InvalidEnvelope)
}

impl EnvelopeV2 {
    pub fn validate(&self) -> Result<(), InvalidEnvelope> {
        let wrap = &self.passphrase_wrap;
        if self.format != "selfterm-vault-v2"
            || self.cipher != "xchacha20poly1305"
            || self.vault_id.is_nil()
            || self.key_epoch.0 == 0
            || wrap.kdf != "argon2id-v19"
            || wrap.memory_ki_b != 65536
            || wrap.iterations != 3
            || wrap.parallelism != 4
            || self.ciphertext.len() > 16 * 1024 * 1024
        {
            return Err(InvalidEnvelope);
        }
        decode_fixed::<24>(&self.nonce)?;
        decode_fixed::<16>(&wrap.salt)?;
        decode_fixed::<24>(&wrap.nonce)?;
        decode_fixed::<48>(&wrap.ciphertext)?;
        decode_fixed::<24>(&self.recovery_wrap.nonce)?;
        decode_fixed::<48>(&self.recovery_wrap.ciphertext)?;
        if URL_SAFE_NO_PAD
            .decode(&self.ciphertext)
            .map_err(|_| InvalidEnvelope)?
            .len()
            < 16
        {
            return Err(InvalidEnvelope);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn counters_preserve_full_u64_and_reject_ambiguous_or_overflow_values() {
        let n = DecimalU64(u64::MAX);
        assert_eq!(
            serde_json::from_str::<DecimalU64>(&serde_json::to_string(&n).unwrap()).unwrap(),
            n
        );
        for bad in ["1", "\"01\"", "\"-1\"", "\"18446744073709551616\""] {
            assert!(serde_json::from_str::<DecimalU64>(bad).is_err());
        }
    }
}
