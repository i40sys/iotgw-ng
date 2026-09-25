// Unit tests for `_shared/sshsig.ts`'s `verifySshSig`, exercised through the
// exact shape `ssh-ca`'s "renew" action uses (task-132.04 / decision-033 §5):
// SSHSIG namespace "iotgw-renew" over `${device_id}\n${host_pubkey}\n${ts}`.
//
// The fixture below was generated once with a real OpenSSH client:
//
//   ssh-keygen -t ecdsa -b 256 -N "" -f test_host_key
//   printf '%s\n%s\n%s' "$DEVICE_ID" "$HOST_PUBKEY_LINE" "$TS" > msg.txt
//   ssh-keygen -Y sign -n iotgw-renew -f test_host_key msg.txt
//
// so this test proves interop with what the gateway's `ssh-keygen -Y sign`
// actually produces, not just with our own signer (`_shared` has none).
//
// Run: deno test supabase/volumes/functions/_shared/sshsig_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.177.1/testing/asserts.ts";
import { verifySshSig } from "./sshsig.ts";

const HOST_PUBKEY_LINE =
  "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBJz5SCHgwBIJB3hksd1Y+5Zf6FRqAJprCEQI5XRJLZd9s1Lnk27RxXuB+g2aLJYkf4CF6NG7k4zvAPCQTL3WVn8= oriol@d0";

// Normalized the way `normalizeHostPubkey` in ssh-ca/index.ts does: type +
// base64 only, comment stripped.
const HOST_PUBKEY_NORMALIZED =
  "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBJz5SCHgwBIJB3hksd1Y+5Zf6FRqAJprCEQI5XRJLZd9s1Lnk27RxXuB+g2aLJYkf4CF6NG7k4zvAPCQTL3WVn8=";

const DEVICE_ID = "iotgw-test1@aaaaaaaa";
const TS = "1758800000";

const ARMORED_SIG = `-----BEGIN SSH SIGNATURE-----
U1NIU0lHAAAAAQAAAGgAAAATZWNkc2Etc2hhMi1uaXN0cDI1NgAAAAhuaXN0cDI1NgAAAE
EEnPlIIeDAEgkHeGSx3Vj7ll/oVGoAmmsIRAjldEktl32zUueTbtHFe4H6DZosliR/gIXo
0buTjO8A8JBMvdZWfwAAAAtpb3Rndy1yZW5ldwAAAAAAAAAGc2hhNTEyAAAAZQAAABNlY2
RzYS1zaGEyLW5pc3RwMjU2AAAASgAAACEAnp82Z1oAkDZpw/YjbgdUKItJiW9UHitPHZh0
Rb3feP4AAAAhAPyQpolWluRrau0RgzdmawOvg5prgAzHhFofnVez7Xec
-----END SSH SIGNATURE-----`;

function renewMessage(deviceId: string, hostPubkey: string, ts: string): Uint8Array {
  return new TextEncoder().encode(`${deviceId}\n${hostPubkey}\n${ts}`);
}

Deno.test("verifySshSig - valid renew signature, correct namespace and key, verifies", async () => {
  const ok = await verifySshSig({
    armored: ARMORED_SIG,
    expectedPubkeyLine: HOST_PUBKEY_LINE,
    namespace: "iotgw-renew",
    message: renewMessage(DEVICE_ID, HOST_PUBKEY_NORMALIZED, TS),
  });
  assert(ok, "a genuine ssh-keygen -Y sign renew signature must verify");
});

Deno.test("verifySshSig - stale/tampered ts changes the message and fails", async () => {
  const ok = await verifySshSig({
    armored: ARMORED_SIG,
    expectedPubkeyLine: HOST_PUBKEY_LINE,
    namespace: "iotgw-renew",
    // Same signature, different ts — the signed message no longer matches.
    message: renewMessage(DEVICE_ID, HOST_PUBKEY_NORMALIZED, "1758800001"),
  });
  assertEquals(ok, false);
});

Deno.test("verifySshSig - wrong device_id in the message fails", async () => {
  const ok = await verifySshSig({
    armored: ARMORED_SIG,
    expectedPubkeyLine: HOST_PUBKEY_LINE,
    namespace: "iotgw-renew",
    message: renewMessage("someone-elses-device@bbbbbbbb", HOST_PUBKEY_NORMALIZED, TS),
  });
  assertEquals(ok, false);
});

Deno.test("verifySshSig - wrong namespace fails", async () => {
  const ok = await verifySshSig({
    armored: ARMORED_SIG,
    expectedPubkeyLine: HOST_PUBKEY_LINE,
    namespace: "iotgw-reenroll", // the old (now-removed) continuity namespace
    message: renewMessage(DEVICE_ID, HOST_PUBKEY_NORMALIZED, TS),
  });
  assertEquals(ok, false);
});

Deno.test("verifySshSig - signature from a different key than expected fails", async () => {
  const otherKey =
    "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBIbogus0IdontMatchAnything0000000000000000000000000000000000000000000000000000000=";
  const ok = await verifySshSig({
    armored: ARMORED_SIG,
    expectedPubkeyLine: otherKey,
    namespace: "iotgw-renew",
    message: renewMessage(DEVICE_ID, HOST_PUBKEY_NORMALIZED, TS),
  });
  assertEquals(ok, false);
});

Deno.test("verifySshSig - malformed armor fails closed, does not throw", async () => {
  const ok = await verifySshSig({
    armored: "not an ssh signature at all",
    expectedPubkeyLine: HOST_PUBKEY_LINE,
    namespace: "iotgw-renew",
    message: renewMessage(DEVICE_ID, HOST_PUBKEY_NORMALIZED, TS),
  });
  assertEquals(ok, false);
});
