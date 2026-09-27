#!/usr/bin/env python3
"""Measure packaged SelfTerm process trees on Linux, using isolated empty profiles.

CPU 100% means one logical core. PSS includes shared mappings proportionally.
The desktop session and OS credential store are inherited; personal app profiles
are never read or changed. Run after builds finish, not during compilation.
"""
import argparse
import ctypes as c
import json
import os
from pathlib import Path
import signal
import statistics
import subprocess
import tempfile
import time


def processes():
    rows = {}
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            fields = (path / 'stat').read_text().rsplit(')', 1)[1].split()
            rows[int(path.name)] = {
                'parent': int(fields[1]), 'start': int(fields[19]),
                'ticks': int(fields[11]) + int(fields[12]),
            }
        except (OSError, ValueError, IndexError):
            continue
    return rows


def tree(root):
    rows = processes()
    ids = {root}
    while True:
        children = {pid for pid, row in rows.items() if row['parent'] in ids}
        if children <= ids:
            return {pid: rows[pid] for pid in ids if pid in rows}
        ids |= children


def snapshot(root):
    rows = tree(root)
    memory = {'rss_kib': 0, 'pss_kib': 0, 'private_kib': 0}
    for pid in rows:
        try:
            values = {}
            for line in Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines()[1:]:
                key, value = line.split(':', 1)
                values[key] = int(value.split()[0])
            memory['rss_kib'] += values.get('Rss', 0)
            memory['pss_kib'] += values.get('Pss', 0)
            memory['private_kib'] += values.get('Private_Clean', 0) + values.get('Private_Dirty', 0)
        except (OSError, ValueError):
            continue
    return rows, memory


def resize_window(pid):
    """Request a 1280x820 client area and record actual X11 dimensions."""
    x = c.CDLL('libX11.so.6')
    x.XOpenDisplay.argtypes = [c.c_char_p]
    x.XOpenDisplay.restype = c.c_void_p
    x.XDefaultRootWindow.argtypes = [c.c_void_p]
    x.XDefaultRootWindow.restype = c.c_ulong
    x.XInternAtom.argtypes = [c.c_void_p, c.c_char_p, c.c_int]
    x.XInternAtom.restype = c.c_ulong
    x.XGetWindowProperty.argtypes = [c.c_void_p, c.c_ulong, c.c_ulong, c.c_long, c.c_long, c.c_int, c.c_ulong, c.POINTER(c.c_ulong), c.POINTER(c.c_int), c.POINTER(c.c_ulong), c.POINTER(c.c_ulong), c.POINTER(c.POINTER(c.c_ubyte))]
    x.XResizeWindow.argtypes = [c.c_void_p, c.c_ulong, c.c_uint, c.c_uint]
    x.XSync.argtypes = [c.c_void_p, c.c_int]
    x.XGetGeometry.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong), c.POINTER(c.c_int), c.POINTER(c.c_int), c.POINTER(c.c_uint), c.POINTER(c.c_uint), c.POINTER(c.c_uint), c.POINTER(c.c_uint)]
    x.XFree.argtypes = [c.c_void_p]
    x.XCloseDisplay.argtypes = [c.c_void_p]
    display = x.XOpenDisplay(None)
    if not display:
        raise RuntimeError('An X11 desktop session is required')
    root = x.XDefaultRootWindow(display)

    def property_values(window, name):
        atom = x.XInternAtom(display, name.encode(), 0)
        kind, length, remaining = c.c_ulong(), c.c_ulong(), c.c_ulong()
        fmt, data = c.c_int(), c.POINTER(c.c_ubyte)()
        x.XGetWindowProperty(display, window, atom, 0, 4096, 0, 0, c.byref(kind), c.byref(fmt), c.byref(length), c.byref(remaining), c.byref(data))
        result = []
        if data:
            if fmt.value == 32:
                values = c.cast(data, c.POINTER(c.c_ulong))
                result = [values[i] for i in range(length.value)]
            x.XFree(data)
        return result

    result = None
    for window in property_values(root, '_NET_CLIENT_LIST'):
        if property_values(window, '_NET_WM_PID') == [pid]:
            x.XResizeWindow(display, window, 1280, 820)
            x.XSync(display, 0)
            w, h, border, depth = c.c_uint(), c.c_uint(), c.c_uint(), c.c_uint()
            px, py, child_root = c.c_int(), c.c_int(), c.c_ulong()
            x.XGetGeometry(display, window, c.byref(child_root), c.byref(px), c.byref(py), c.byref(w), c.byref(h), c.byref(border), c.byref(depth))
            result = [w.value, h.value]
            break
    x.XCloseDisplay(display)
    return result


def stop(process):
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)


def measure(name, executable, profile, settle, duration):
    env = dict(os.environ)
    env['XDG_CONFIG_HOME'] = str(profile / 'config')
    env['XDG_DATA_HOME'] = str(profile / 'data')
    env['XDG_CACHE_HOME'] = str(profile / 'cache')
    profile.mkdir(parents=True, exist_ok=True)
    # The Electron baseline seeds an example host. Explicitly start with the same
    # empty host list and appearance as the Rust default, in this test profile only.
    fixture = {'version': 1, 'updatedAt': 0, 'settings': {'theme': 'termius-dark', 'uiFont': 'system', 'terminalFont': 'jetbrains', 'uiFontSize': 14, 'terminalFontSize': 13, 'uiTextColor': '', 'terminalTextColor': '', 'syncUrl': '', 'syncToken': ''}, 'history': [], 'hosts': []}
    if name == 'electron':
        for app_name in ['selfterm-linux', 'SelfTerm']:
            folder = profile / 'config' / app_name
            folder.mkdir(parents=True, exist_ok=True)
            (folder / 'vault.json').write_text(json.dumps(fixture))
    with (profile / 'app.log').open('a') as log:
        process = subprocess.Popen([str(executable)], env=env, stdout=log, stderr=log, start_new_session=True)
        try:
            observed = {}
            began = time.monotonic()
            geometry = None
            while time.monotonic() - began < settle:
                if process.poll() is not None:
                    raise RuntimeError(f'{name} exited; see {profile / "app.log"}')
                rows = tree(process.pid)
                for pid, row in rows.items():
                    observed[(pid, row['start'])] = row['ticks']
                if time.monotonic() - began >= 3 and geometry != [1280, 820]:
                    geometry = resize_window(process.pid)
                time.sleep(1)
            if geometry != [1280, 820]:
                raise RuntimeError(f'{name}: unexpected client geometry {geometry}')
            startup_ticks = sum(observed.values())
            rows, _ = snapshot(process.pid)
            before = {(pid, row['start']): row['ticks'] for pid, row in rows.items()}
            observed = dict(before)
            samples = []
            steady_start = time.monotonic()
            while time.monotonic() - steady_start < duration:
                if process.poll() is not None:
                    raise RuntimeError(f'{name} exited during measurement')
                rows, memory = snapshot(process.pid)
                for pid, row in rows.items():
                    observed[(pid, row['start'])] = row['ticks']
                samples.append(memory)
                time.sleep(1)
            elapsed = time.monotonic() - steady_start
            rows = tree(process.pid)
            for pid, row in rows.items():
                observed[(pid, row['start'])] = row['ticks']
            cpu_seconds = (sum(observed.values()) - sum(before.values())) / os.sysconf('SC_CLK_TCK')
            return {
                'app': name, 'geometry': geometry, 'samples': samples,
                'duration_seconds': elapsed, 'idle_cpu_percent_one_core': 100 * cpu_seconds / elapsed,
                'startup_cpu_seconds_first_settle_period': startup_ticks / os.sysconf('SC_CLK_TCK'),
                'median_pss_mib': statistics.median(s['pss_kib'] for s in samples) / 1024,
                'peak_pss_mib': max(s['pss_kib'] for s in samples) / 1024,
                'median_rss_mib': statistics.median(s['rss_kib'] for s in samples) / 1024,
                'median_private_mib': statistics.median(s['private_kib'] for s in samples) / 1024,
            }
        finally:
            stop(process)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--electron', type=Path, required=True)
    parser.add_argument('--tauri', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--rounds', type=int, default=3)
    parser.add_argument('--settle', type=int, default=15)
    parser.add_argument('--duration', type=int, default=30)
    args = parser.parse_args()
    root = Path(tempfile.mkdtemp(prefix='selfterm-benchmark-'))
    result = {'profile_root': str(root), 'rounds': args.rounds, 'settle_seconds': args.settle, 'sample_seconds': args.duration, 'cpu_percent_definition': '100% = one logical core', 'runs': []}
    executables = {'electron': args.electron.resolve(), 'tauri': args.tauri.resolve()}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Prepare each profile and warm libraries once. Provisioning is excluded from
    # measured startup CPU and steady-state resource usage.
    for name in executables:
        measure(name, executables[name], root / name, args.settle, 2)
        print(f'{name}: profile prepared', flush=True)
    for round_number in range(args.rounds):
        order = ['electron', 'tauri'] if round_number % 2 == 0 else ['tauri', 'electron']
        for name in order:
            run = measure(name, executables[name], root / name, args.settle, args.duration)
            run['round'] = round_number + 1
            result['runs'].append(run)
            args.output.write_text(json.dumps(result, indent=2) + '\n')
            print(f"{name} round {round_number + 1}: PSS {run['median_pss_mib']:.1f} MiB; idle CPU {run['idle_cpu_percent_one_core']:.2f}%", flush=True)
    result['summary'] = {}
    for name in executables:
        runs = [run for run in result['runs'] if run['app'] == name]
        result['summary'][name] = {key: statistics.median(run[key] for run in runs) for key in ['median_pss_mib', 'peak_pss_mib', 'median_rss_mib', 'median_private_mib', 'idle_cpu_percent_one_core', 'startup_cpu_seconds_first_settle_period']}
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result['summary'], indent=2), flush=True)


if __name__ == '__main__':
    main()
