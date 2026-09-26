#!/usr/bin/env python3
"""Run the Rust SSH probe against a disposable, loopback-only OpenSSH server."""

import getpass
import socket
import subprocess
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
CLIENT = ROOT / "ssh-client/target/debug/selfterm-ssh-probe"


def run() -> None:
    if not CLIENT.exists():
        raise SystemExit("Build first: cargo build --locked --manifest-path ssh-client/Cargo.toml")

    with tempfile.TemporaryDirectory(prefix="selfterm-ssh-probe-") as temporary:
        fixture = Path(temporary)
        fixture.chmod(0o700)
        host_key = fixture / "host_key"
        client_key = fixture / "client_key"
        subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(host_key)], check=True)
        subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(client_key)], check=True)
        authorized = fixture / "authorized_keys"
        authorized.write_text(client_key.with_suffix(".pub").read_text())
        authorized.chmod(0o600)

        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]

        config = fixture / "sshd_config"
        config.write_text(
            "\n".join(
                [
                    f"Port {port}",
                    "ListenAddress 127.0.0.1",
                    f"HostKey {host_key}",
                    f"PidFile {fixture / 'sshd.pid'}",
                    f"AuthorizedKeysFile {authorized}",
                    "StrictModes no",
                    "PubkeyAuthentication yes",
                    "PasswordAuthentication no",
                    "KbdInteractiveAuthentication no",
                    "UsePAM no",
                    f"AllowUsers {getpass.getuser()}",
                    "Subsystem sftp internal-sftp",
                ]
            )
            + "\n"
        )
        log = (fixture / "sshd.log").open("w+")
        subprocess.run(["/usr/sbin/sshd", "-t", "-f", str(config)], check=True)
        server = subprocess.Popen(["/usr/sbin/sshd", "-D", "-e", "-f", str(config)], stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if server.poll() is not None:
                    log.flush()
                    raise RuntimeError(f"sshd exited early: {log.read()}")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("loopback sshd did not become ready")

            fingerprint_result = subprocess.run(
                ["ssh-keygen", "-lf", str(host_key) + ".pub", "-E", "sha256"],
                check=True,
                capture_output=True,
                text=True,
            )
            fingerprint = fingerprint_result.stdout.split()[1]
            base = ["127.0.0.1", str(port), getpass.getuser(), str(client_key)]
            accepted = subprocess.run([str(CLIENT), *base, fingerprint], capture_output=True, text=True)
            if accepted.returncode != 0 or "PASS" not in accepted.stdout:
                raise RuntimeError(f"pinned Ed25519 fixture failed: {accepted.stderr}")

            rejected = subprocess.run(
                [str(CLIENT), *base, "SHA256:wrong-fixture-pin"], capture_output=True, text=True
            )
            if rejected.returncode == 0:
                raise RuntimeError("client accepted a changed host-key fingerprint")

            print(accepted.stdout.strip())
            print("Changed SSH host-key pin rejected before authentication: PASS")
        finally:
            server.terminate()
            try:
                server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
            log.close()


if __name__ == "__main__":
    run()
