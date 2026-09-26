use tauri::ipc::{Channel, Response};

const CHUNK_SIZE: usize = 16 * 1024;
const CHUNK_COUNT: usize = 64;
const TERMINAL_SAMPLE: &[u8] = b"SelfTerm\0\x1b[32mRust \xf0\x9f\x8c\x90\x1b[0m \xff ";

#[tauri::command]
async fn stream_probe(output: Channel<Response>) -> Result<(), String> {
    let mut offset = 0usize;
    for _ in 0..CHUNK_COUNT {
        let chunk: Vec<u8> = (0..CHUNK_SIZE)
            .map(|index| TERMINAL_SAMPLE[(offset + index) % TERMINAL_SAMPLE.len()])
            .collect();
        output
            .send(Response::new(chunk))
            .map_err(|error| error.to_string())?;
        offset += CHUNK_SIZE;
    }
    println!("probe: sent 1048576 output bytes across 64 raw IPC messages");
    Ok(())
}

#[tauri::command]
fn echo_input(input: Vec<u8>, output: Channel<Response>) -> Result<(), String> {
    let byte_count = input.len();
    output
        .send(Response::new(input))
        .map_err(|error| error.to_string())
        .map(|()| println!("probe: echoed {byte_count} input bytes"))
}

#[tauri::command]
async fn secure_store_probe() -> Result<&'static str, String> {
    tauri::async_runtime::spawn_blocking(|| {
        eprintln!("probe: starting synthetic OS credential-store check");
        let account = format!("probe-{}", uuid::Uuid::new_v4());
        let entry = keyring::Entry::new("dev.selfterm.probe", &account)
            .map_err(|error| format!("OS credential-store adapter unavailable: {error}"))?;
        let expected = [0x00, 0x01, 0x7f, 0x80, 0xff];
        eprintln!("probe: attempting synthetic OS credential write");
        entry
            .set_secret(&expected)
            .map_err(|error| format!("OS credential-store write failed: {error}"))?;
        eprintln!("probe: synthetic OS credential write completed");
        let readback = entry.get_secret();
        let cleanup = entry.delete_credential();

        match (readback, cleanup) {
            (Ok(actual), Ok(())) if actual == expected => {
                println!("probe: synthetic OS credential write/read/delete passed");
                Ok("store/read/delete passed")
            }
            (Ok(_), Ok(())) => Err("OS credential store changed probe bytes".into()),
            (Err(read_error), Ok(())) => {
                Err(format!("OS credential-store read failed: {read_error}"))
            }
            (_, Err(delete_error)) => {
                Err(format!("probe credential cleanup failed: {delete_error}"))
            }
        }
    })
    .await
    .map_err(|error| format!("OS credential-store worker failed: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            stream_probe,
            echo_input,
            secure_store_probe
        ])
        .run(tauri::generate_context!())
        .expect("failed to run cross-platform feasibility probe");
}
