use argon2::{Algorithm, Argon2, Params, Version};
use std::time::Instant;

fn main() {
    // Public synthetic inputs only. Never pass a real vault passphrase to this probe.
    let params = Params::new(64 * 1024, 3, 4, Some(32)).expect("valid probe parameters");
    let kdf = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut previous = None;
    for sample in 1..=3 {
        let mut key = [0u8; 32];
        let started = Instant::now();
        kdf.hash_password_into(b"selfterm-public-probe", b"public-probe-salt", &mut key)
            .expect("synthetic key derivation");
        let elapsed = started.elapsed();
        if let Some(expected) = previous {
            assert_eq!(key, expected, "identical inputs must derive identical keys");
        }
        previous = Some(key);
        println!(
            "Argon2id m=65536 KiB t=3 p=4 sample={sample}: {:.1} ms",
            elapsed.as_secs_f64() * 1000.0
        );
    }
}
