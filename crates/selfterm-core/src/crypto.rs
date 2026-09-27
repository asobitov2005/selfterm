use crate::{domain::VaultPayload, Error, Result};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use selfterm_protocol::{decode_fixed, DecimalU64, EnvelopeV2, KeyWrap, PassphraseWrap};
use uuid::Uuid;
use zeroize::Zeroizing;

pub struct VaultKey(Zeroizing<[u8; 32]>);

fn random<const N: usize>() -> Result<[u8; N]> {
    let mut bytes = [0; N];
    getrandom::fill(&mut bytes).map_err(|_| Error::Random)?;
    Ok(bytes)
}
fn aad(label: &str, id: Uuid, epoch: u64) -> Vec<u8> {
    let mut bytes = label.as_bytes().to_vec();
    bytes.extend_from_slice(id.as_bytes());
    bytes.extend_from_slice(&epoch.to_be_bytes());
    bytes
}
fn derive(passphrase: &str, salt: &[u8; 16]) -> Result<Zeroizing<[u8; 32]>> {
    if passphrase.is_empty() || passphrase.len() > 1024 {
        return Err(Error::InvalidInput(
            "passphrase must not be empty or exceed 1024 bytes",
        ));
    }
    let params = Params::new(65536, 3, 4, Some(32)).map_err(|_| Error::CorruptStorage)?;
    let mut key = Zeroizing::new([0; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(passphrase.as_bytes(), salt, &mut *key)
        .map_err(|_| Error::WrongKey)?;
    Ok(key)
}
fn seal(key: &[u8; 32], plaintext: &[u8], associated: &[u8]) -> Result<KeyWrap> {
    let nonce = random::<24>()?;
    let cipher = XChaCha20Poly1305::new(key.into());
    let ciphertext = cipher
        .encrypt(
            &XNonce::from(nonce),
            Payload {
                msg: plaintext,
                aad: associated,
            },
        )
        .map_err(|_| Error::CorruptStorage)?;
    Ok(KeyWrap {
        nonce: URL_SAFE_NO_PAD.encode(nonce),
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
    })
}
fn open(
    key: &[u8; 32],
    nonce: &str,
    ciphertext: &str,
    associated: &[u8],
) -> Result<Zeroizing<Vec<u8>>> {
    let nonce = decode_fixed::<24>(nonce).map_err(|_| Error::CorruptStorage)?;
    let ciphertext = URL_SAFE_NO_PAD
        .decode(ciphertext)
        .map_err(|_| Error::CorruptStorage)?;
    XChaCha20Poly1305::new(key.into())
        .decrypt(
            &XNonce::from(nonce),
            Payload {
                msg: &ciphertext,
                aad: associated,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| Error::WrongKey)
}

pub fn create(
    passphrase: &str,
    payload: &VaultPayload,
) -> Result<(EnvelopeV2, VaultKey, Zeroizing<String>)> {
    payload.validate()?;
    let id = Uuid::new_v4();
    let epoch = 1;
    let salt = random::<16>()?;
    let kek = derive(passphrase, &salt)?;
    let key = VaultKey(Zeroizing::new(random::<32>()?));
    let recovery = Zeroizing::new(random::<32>()?);
    let password_wrap = seal(&kek, &*key.0, &aad("selfterm:v2:passphrase", id, epoch))?;
    let recovery_wrap = seal(&recovery, &*key.0, &aad("selfterm:v2:recovery", id, epoch))?;
    let clear = Zeroizing::new(serde_json::to_vec(payload).map_err(|_| Error::CorruptStorage)?);
    let encrypted = seal(&key.0, &clear, &aad("selfterm:v2:payload", id, epoch))?;
    let envelope = EnvelopeV2 {
        format: "selfterm-vault-v2".into(),
        vault_id: id,
        key_epoch: DecimalU64(epoch),
        cipher: "xchacha20poly1305".into(),
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
        passphrase_wrap: PassphraseWrap {
            kdf: "argon2id-v19".into(),
            memory_ki_b: 65536,
            iterations: 3,
            parallelism: 4,
            salt: URL_SAFE_NO_PAD.encode(salt),
            nonce: password_wrap.nonce,
            ciphertext: password_wrap.ciphertext,
        },
        recovery_wrap,
    };
    Ok((
        envelope,
        key,
        Zeroizing::new(URL_SAFE_NO_PAD.encode(recovery.as_slice())),
    ))
}

pub fn unlock(envelope: &EnvelopeV2, passphrase: &str) -> Result<(VaultKey, VaultPayload)> {
    envelope.validate().map_err(|_| Error::CorruptStorage)?;
    let wrap = &envelope.passphrase_wrap;
    let salt = decode_fixed::<16>(&wrap.salt).map_err(|_| Error::CorruptStorage)?;
    let kek = derive(passphrase, &salt)?;
    unwrap(
        envelope,
        &kek,
        &wrap.nonce,
        &wrap.ciphertext,
        "selfterm:v2:passphrase",
    )
}
pub fn recover(envelope: &EnvelopeV2, recovery: &str) -> Result<(VaultKey, VaultPayload)> {
    envelope.validate().map_err(|_| Error::CorruptStorage)?;
    let kek = Zeroizing::new(decode_fixed::<32>(recovery).map_err(|_| Error::WrongKey)?);
    unwrap(
        envelope,
        &kek,
        &envelope.recovery_wrap.nonce,
        &envelope.recovery_wrap.ciphertext,
        "selfterm:v2:recovery",
    )
}
fn unwrap(
    envelope: &EnvelopeV2,
    kek: &[u8; 32],
    nonce: &str,
    ciphertext: &str,
    label: &str,
) -> Result<(VaultKey, VaultPayload)> {
    let clear = open(
        kek,
        nonce,
        ciphertext,
        &aad(label, envelope.vault_id, envelope.key_epoch.0),
    )?;
    let bytes: [u8; 32] = clear.as_slice().try_into().map_err(|_| Error::WrongKey)?;
    let key = VaultKey(Zeroizing::new(bytes));
    let plaintext = open(
        &key.0,
        &envelope.nonce,
        &envelope.ciphertext,
        &aad(
            "selfterm:v2:payload",
            envelope.vault_id,
            envelope.key_epoch.0,
        ),
    )?;
    let payload: VaultPayload =
        serde_json::from_slice(&plaintext).map_err(|_| Error::CorruptStorage)?;
    payload.validate()?;
    Ok((key, payload))
}
pub fn update(envelope: &EnvelopeV2, key: &VaultKey, payload: &VaultPayload) -> Result<EnvelopeV2> {
    envelope.validate().map_err(|_| Error::CorruptStorage)?;
    payload.validate()?;
    let clear = Zeroizing::new(serde_json::to_vec(payload).map_err(|_| Error::CorruptStorage)?);
    let encrypted = seal(
        &key.0,
        &clear,
        &aad(
            "selfterm:v2:payload",
            envelope.vault_id,
            envelope.key_epoch.0,
        ),
    )?;
    let mut next = envelope.clone();
    next.nonce = encrypted.nonce;
    next.ciphertext = encrypted.ciphertext;
    Ok(next)
}
