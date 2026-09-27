use std::{env, error::Error, path::PathBuf, sync::Arc};

use russh::{
    client::{self, Handler},
    keys::{load_secret_key, ssh_key::HashAlg, PrivateKeyWithHashAlg},
    ChannelMsg, Disconnect,
};
use selfterm_ssh_probe::{assemble_raw_chunks, PinnedHostKey};

struct TrustHandler(PinnedHostKey);

impl Handler for TrustHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        presented: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let fingerprint = format!("{}", presented.public_key().fingerprint(HashAlg::Sha256));
        Ok(self.0.accepts(&fingerprint))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let host = args
        .next()
        .ok_or("usage: ssh-probe HOST PORT USER KEY PIN")?;
    let port: u16 = args.next().ok_or("missing port")?.parse()?;
    let user = args.next().ok_or("missing user")?;
    let key_path = PathBuf::from(args.next().ok_or("missing key path")?);
    let pin = args.next().ok_or("missing SHA256 host-key fingerprint")?;
    if args.next().is_some() {
        return Err("unexpected argument".into());
    }

    let key = load_secret_key(key_path, None)?;
    let config = Arc::new(client::Config::default());
    let mut session = client::connect(
        config,
        (host.as_str(), port),
        TrustHandler(PinnedHostKey::new(pin)),
    )
    .await?;

    let auth = session
        .authenticate_publickey(user, PrivateKeyWithHashAlg::new(Arc::new(key), None))
        .await?;
    if !auth.success() {
        return Err("fixture rejected the Ed25519 key".into());
    }

    let mut channel = session.channel_open_session().await?;
    channel.exec(true, "printf SelfTermSSHProbe").await?;
    let mut chunks = Vec::new();
    let mut exit_status = None;
    while let Some(message) = channel.wait().await {
        match message {
            ChannelMsg::Data { data } => chunks.push(data.to_vec()),
            ChannelMsg::ExitStatus { exit_status: code } => exit_status = Some(code),
            _ => {}
        }
    }
    let output = assemble_raw_chunks(&chunks);
    if output != b"SelfTermSSHProbe" || exit_status != Some(0) {
        return Err("SSH fixture returned an unexpected response".into());
    }

    session
        .disconnect(Disconnect::ByApplication, "probe complete", "en")
        .await?;
    println!("SSH Ed25519, pinned host key, shell output, and teardown: PASS");
    Ok(())
}
