import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { echoTerminalInput, streamRustOutput } from "../ui/terminal";
import "./App.css";

function App() {
  const terminalHost = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const [status, setStatus] = useState("Ready for Linux native probe");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!terminalHost.current) return;
    const instance = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "monospace",
      fontSize: 14,
      theme: { background: "#101214", foreground: "#eef2f1" },
    });
    instance.open(terminalHost.current);
    instance.focus();
    instance.writeln("SelfTerm Rust/Tauri feasibility probe");
    instance.writeln("Click stream test, then type Unicode and terminal keys.");
    const input = instance.onData((data) => {
      void echoTerminalInput(instance, data).catch((error: unknown) =>
        setStatus(`Input channel failed: ${String(error)}`),
      );
    });
    terminal.current = instance;
    return () => {
      input.dispose();
      terminal.current = null;
      instance.dispose();
    };
  }, []);

  async function runStream() {
    if (!terminal.current) return;
    setBusy(true);
    setStatus("Streaming 64 × 16 KiB raw bytes…");
    try {
      const elapsedMs = await streamRustOutput(terminal.current);
      console.info(`probe: xterm validated 1048576 raw output bytes in ${elapsedMs.toFixed(1)} ms`);
      setStatus(`1 MiB raw-byte channel passed in ${elapsedMs.toFixed(1)} ms`);
    } catch (error) {
      setStatus(`Raw-byte channel failed: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runSecureStore() {
    setBusy(true);
    let timeout = 0;
    try {
      const result = await Promise.race([
        invoke<string>("secure_store_probe"),
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(() => reject(new Error("Secret Service request timed out")), 15_000);
        }),
      ]);
      setStatus(result);
    } catch (error) {
      setStatus(`Secure-store probe failed: ${String(error)}`);
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        await runStream();
        await runSecureStore();
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="shell">
      <header>
        <div><strong>SelfTerm</strong><span> · Linux feasibility probe</span></div>
        <nav>
          <button disabled={busy} onClick={() => void runStream()}>Test Rust output</button>
          <button disabled={busy} onClick={() => void runSecureStore()}>Test secure storage</button>
        </nav>
      </header>
      <section className="terminal-card">
        <div className="terminal-title">SSH byte-channel stand-in · xterm.js</div>
        <div className="terminal" ref={terminalHost} />
      </section>
      <footer role="status">{status}</footer>
    </main>
  );
}

export default App;
