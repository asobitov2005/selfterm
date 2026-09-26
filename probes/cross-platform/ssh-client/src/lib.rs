pub struct PinnedHostKey {
    expected_sha256: String,
}

impl PinnedHostKey {
    pub fn new(expected_sha256: impl Into<String>) -> Self {
        Self {
            expected_sha256: expected_sha256.into(),
        }
    }

    pub fn accepts(&self, presented_sha256: &str) -> bool {
        !self.expected_sha256.is_empty() && self.expected_sha256 == presented_sha256
    }
}

/// Concatenates transport chunks without interpreting UTF-8 or terminal controls.
pub fn assemble_raw_chunks(chunks: &[Vec<u8>]) -> Vec<u8> {
    let total_len = chunks.iter().map(Vec::len).sum();
    let mut output = Vec::with_capacity(total_len);
    for chunk in chunks {
        output.extend_from_slice(chunk);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::{assemble_raw_chunks, PinnedHostKey};

    #[test]
    fn split_invalid_utf8_and_escape_bytes_are_preserved_in_order() {
        let chunks = [
            vec![0x1b, b'[', b'3'],
            vec![b'1', b'm', 0xe2],
            vec![0x82, 0xac, 0xff, 0x00],
        ];

        assert_eq!(
            assemble_raw_chunks(&chunks),
            [0x1b, b'[', b'3', b'1', b'm', 0xe2, 0x82, 0xac, 0xff, 0x00]
        );
    }

    #[test]
    fn unknown_or_changed_host_key_is_rejected() {
        let trusted = PinnedHostKey::new("SHA256:expected-fixture-key");
        assert!(trusted.accepts("SHA256:expected-fixture-key"));
        assert!(!trusted.accepts("SHA256:attacker-key"));
        assert!(!PinnedHostKey::new("").accepts("SHA256:any-key"));
    }
}
