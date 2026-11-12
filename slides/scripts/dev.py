#!/usr/bin/env python3
"""Restart only this deck's exact Linux Slidev listener, then exec Slidev."""
import fcntl
import os
from pathlib import Path
import select
import shutil
import signal
import socket
import sys

ROOT = Path(__file__).resolve().parents[1]
PORT = 48763
NODE = Path(shutil.which('node') or '/missing-node').resolve()
CLI = (ROOT / 'node_modules/@slidev/cli/bin/slidev.mjs').resolve()
DECK = ROOT / 'slides.md'
ARGS = [str(NODE), str(CLI), str(DECK), '--port', str(PORT), '--remote', '--bind', '0.0.0.0']


def listeners():
    result = set()
    for table in ('tcp', 'tcp6'):
        for row in Path('/proc/net', table).read_text().splitlines()[1:]:
            fields = row.split()
            if fields[3] == '0A' and int(fields[1].split(':')[1], 16) == PORT:
                result.add(f'socket:[{fields[9]}]')
    return result


def owns_deck(pid):
    proc = Path('/proc', str(pid))
    try:
        args = proc.joinpath('cmdline').read_bytes().rstrip(b'\0').decode().split('\0')
        return proc.joinpath('cwd').resolve() == ROOT and proc.joinpath('exe').resolve() == NODE and args == ARGS
    except (OSError, UnicodeError):
        return False


def restart_owned():
    sockets = listeners()
    if not sockets:
        return
    owners = {}
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit():
            continue
        try:
            held = {os.readlink(fd) for fd in proc.joinpath('fd').iterdir()} & sockets
        except OSError:
            continue
        if held:
            owners[int(proc.name)] = held
    # Verify every listener and every visible owner before sending any signal.
    covered = set().union(*owners.values()) if owners else set()
    if covered != sockets or any(not owns_deck(pid) for pid in owners):
        raise RuntimeError(f'Port {PORT} belongs to another or unidentified process. No process stopped.')
    handles = []
    try:
        for pid in owners:
            fd = os.pidfd_open(pid)
            handles.append((pid, fd))
            if not owns_deck(pid):
                raise RuntimeError('Listener identity changed. No process stopped.')
        for pid, fd in handles:
            print(f'Stopping previous instance of this deck (PID {pid}).', flush=True)
            signal.pidfd_send_signal(fd, signal.SIGTERM)
        for pid, fd in handles:
            if not select.select([fd], [], [], 5)[0]:
                # pidfd always refers to the original process, even after PID reuse.
                signal.pidfd_send_signal(fd, signal.SIGKILL)
                if not select.select([fd], [], [], 3)[0]:
                    raise RuntimeError(f'Previous instance {pid} did not stop.')
    finally:
        for _, fd in handles:
            os.close(fd)


def main():
    if sys.platform != 'linux' or not hasattr(os, 'pidfd_open'):
        raise RuntimeError('This safe launcher requires Linux/WSL with pidfd support.')
    if not CLI.is_file() or not NODE.is_file():
        raise RuntimeError('Install Node.js and run pnpm install first.')
    os.chdir(ROOT)
    state = ROOT / '.slidev'
    state.mkdir(exist_ok=True)
    # Serialize simultaneous starts. The lock closes automatically on exec.
    with (state / 'dev-start.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        restart_owned()
        # Include inaccessible listeners and non-listening port reservations.
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(('0.0.0.0', PORT))
            except OSError as error:
                raise RuntimeError(f'Port {PORT} unavailable. No other process stopped: {error}') from error
        print(f'Starting this deck on 0.0.0.0:{PORT} (all hostnames).', flush=True)
        os.execve(NODE, ARGS, {**os.environ, 'EDITOR': 'true'})


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as error:
        print(f'Dev start refused: {error}', file=sys.stderr)
        sys.exit(1)
