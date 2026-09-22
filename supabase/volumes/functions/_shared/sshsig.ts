// SSHSIG verification (OpenSSH PROTOCOL.sshsig) on WebCrypto — used by ssh-ca to
// prove RE-enrollment possession of the existing host private key (task-075,
// decision-028 §12). Supports the two host-key types iotgw gateways use:
// ecdsa-sha2-nistp256 (the default from tasks/ssh_ca.yaml) and ssh-ed25519.
//
// Verification is FAIL-CLOSED: any parse/shape/crypto error returns false, so a
// malformed or forged proof can never be mistaken for a valid one.
//
// A gateway produces the input with:
//   ssh-keygen -Y sign -f /etc/ssh/ssh_host_ecdsa_key -n <namespace> <message-file>
// which writes an armored "-----BEGIN SSH SIGNATURE-----" blob.

const td = new TextDecoder();
const te = new TextEncoder();

/** Reader over an SSH wire buffer (uint32-length-prefixed strings). */
function reader(buf: Uint8Array) {
  let o = 0;
  return {
    u32(): number {
      const v = ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
      o += 4;
      return v;
    },
    str(): Uint8Array {
      const n = this.u32();
      if (o + n > buf.length) throw new Error("ssh wire string overrun");
      const s = buf.subarray(o, o + n);
      o += n;
      return s;
    },
  };
}

function b64ToBytes(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

function wireStr(bytes: Uint8Array): Uint8Array {
  const n = bytes.length;
  const out = new Uint8Array(4 + n);
  out[0] = (n >>> 24) & 0xff;
  out[1] = (n >>> 16) & 0xff;
  out[2] = (n >>> 8) & 0xff;
  out[3] = n & 0xff;
  out.set(bytes, 4);
  return out;
}

function concat(arrs: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const a of arrs) n += a.length;
  const out = new Uint8Array(n);
  let p = 0;
  for (const a of arrs) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

/** OpenSSH mpint → fixed-width big-endian (strip sign padding, left-pad). */
function mpToFixed(mp: Uint8Array, len: number): Uint8Array {
  let s = 0;
  while (s < mp.length - 1 && mp[s] === 0) s++;
  const v = mp.subarray(s);
  if (v.length > len) throw new Error("mpint longer than expected");
  const out = new Uint8Array(len);
  out.set(v, len - v.length);
  return out;
}

/**
 * Verify an armored SSHSIG over `message` in `namespace`, signed by the key
 * whose OpenSSH public line is `expectedPubkeyLine`. Returns true only if the
 * signature is valid AND was made by exactly that key in exactly that namespace.
 */
export async function verifySshSig(params: {
  armored: string;
  expectedPubkeyLine: string;
  namespace: string;
  message: Uint8Array;
}): Promise<boolean> {
  const { armored, expectedPubkeyLine, namespace, message } = params;
  try {
    const m = armored.match(
      /-----BEGIN SSH SIGNATURE-----([\s\S]*?)-----END SSH SIGNATURE-----/,
    );
    if (!m) return false;
    const blob = b64ToBytes(m[1]);
    if (td.decode(blob.subarray(0, 6)) !== "SSHSIG") return false;

    const r = reader(blob.subarray(6));
    if (r.u32() !== 1) return false; // SIG_VERSION
    const pub = r.str();
    const ns = r.str();
    r.str(); // reserved
    const hashAlg = td.decode(r.str());
    const sig = r.str();

    if (td.decode(ns) !== namespace) return false;

    // The signer must be exactly the stored key.
    const line = expectedPubkeyLine.trim().split(/\s+/);
    if (line.length < 2) return false;
    if (!bytesEqual(pub, b64ToBytes(line[1]))) return false;

    const pr = reader(pub);
    const ktype = td.decode(pr.str());

    // H(message) per the signature's declared hash algorithm.
    const hAlg = hashAlg === "sha512" ? "SHA-512" : hashAlg === "sha256" ? "SHA-256" : null;
    if (!hAlg) return false;
    const H = new Uint8Array(await crypto.subtle.digest(hAlg, message));

    // The blob the signature actually covers.
    const signed = concat([
      te.encode("SSHSIG"),
      wireStr(te.encode(namespace)),
      wireStr(new Uint8Array(0)), // reserved
      wireStr(te.encode(hashAlg)),
      wireStr(H),
    ]);

    const sr = reader(sig);
    const sigType = td.decode(sr.str());
    const sigBlob = sr.str();

    if (ktype === "ecdsa-sha2-nistp256") {
      if (sigType !== "ecdsa-sha2-nistp256") return false;
      pr.str(); // curve id ("nistp256")
      const q = pr.str(); // 0x04 || X || Y
      const key = await crypto.subtle.importKey(
        "raw",
        q,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      const s2 = reader(sigBlob);
      const rr = mpToFixed(s2.str(), 32);
      const ss = mpToFixed(s2.str(), 32);
      return await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        concat([rr, ss]),
        signed,
      );
    }

    if (ktype === "ssh-ed25519") {
      if (sigType !== "ssh-ed25519") return false;
      const a = pr.str(); // 32-byte public key
      const key = await crypto.subtle.importKey("raw", a, { name: "Ed25519" }, false, [
        "verify",
      ]);
      return await crypto.subtle.verify({ name: "Ed25519" }, key, sigBlob, signed);
    }

    return false;
  } catch {
    return false; // fail closed
  }
}
