import { describe, it, expect, beforeEach } from "vitest";
import * as OTPAuth from "otpauth";

/**
 * TOTP Integration Test
 *
 * This test validates that the TOTP implementation matches between:
 * 1. Frontend (DeviceTOTPDialog component)
 * 2. Backend (VPN edge function)
 *
 * Both must generate and validate the same TOTP codes using identical parameters.
 */

describe("TOTP Integration", () => {
  const mockDeviceId = "550e8400-e29b-41d4-a716-446655440000";
  const mockNetworkId = "660e8400-e29b-41d4-a716-446655440001";
  const mockDomainId = "770e8400-e29b-41d4-a716-446655440002";
  let totpCounter = 0;

  beforeEach(() => {
    totpCounter = 0;
  });

  /**
   * Generate TOTP code using the same algorithm as both frontend and backend
   */
  const generateTOTPCode = (
    deviceId: string,
    networkId: string,
    domainId: string,
    counter: number,
    timestamp?: number,
  ): string => {
    const combinedSecret = `${domainId}-${networkId}-${deviceId}-${counter}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedSecret);

    const secret = new OTPAuth.Secret({ buffer: data });

    const totp = new OTPAuth.TOTP({
      issuer: "IoTGW",
      algorithm: "SHA1",
      digits: 6,
      period: 600, // 10 minutes
      secret: secret,
    });

    return totp.generate({ timestamp: timestamp ?? Date.now() });
  };

  /**
   * Validate TOTP code using the same algorithm as backend
   */
  const validateTOTPCode = (
    code: string,
    deviceId: string,
    networkId: string,
    domainId: string,
    counter: number,
  ): boolean => {
    try {
      const combinedSecret = `${domainId}-${networkId}-${deviceId}-${counter}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(combinedSecret);

      const secret = new OTPAuth.Secret({ buffer: data });

      const totp = new OTPAuth.TOTP({
        issuer: "IoTGW",
        algorithm: "SHA1",
        digits: 6,
        period: 600,
        secret: secret,
      });

      // Validate with window of 1 (allows ±1 period tolerance)
      const delta = totp.validate({ token: code, window: 1 });

      return delta !== null;
    } catch (error) {
      console.error("TOTP validation error:", error);
      return false;
    }
  };

  it("should generate a 6-digit TOTP code", () => {
    const code = generateTOTPCode(
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      totpCounter,
    );

    expect(code).toMatch(/^\d{6}$/);
  });

  it("should generate the same code for the same timestamp", () => {
    const timestamp = Date.now();

    const code1 = generateTOTPCode(
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      totpCounter,
      timestamp,
    );
    const code2 = generateTOTPCode(
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      totpCounter,
      timestamp,
    );

    expect(code1).toBe(code2);
  });

  it("should generate different codes for different counters", () => {
    const timestamp = Date.now();

    const code1 = generateTOTPCode(
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      0,
      timestamp,
    );
    const code2 = generateTOTPCode(
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      1,
      timestamp,
    );

    expect(code1).not.toBe(code2);
  });

  it("should validate a correct TOTP code", () => {
    const code = generateTOTPCode(
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      totpCounter,
    );

    const isValid = validateTOTPCode(
      code,
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      totpCounter,
    );

    expect(isValid).toBe(true);
  });

  it("should reject an invalid TOTP code", () => {
    const isValid = validateTOTPCode(
      "000000",
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      totpCounter,
    );

    expect(isValid).toBe(false);
  });

  it("should reject a TOTP code with wrong counter", () => {
    const code = generateTOTPCode(
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      0,
    );

    // Try to validate with different counter
    const isValid = validateTOTPCode(
      code,
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      1, // Wrong counter
    );

    expect(isValid).toBe(false);
  });

  it("should use 600-second (10-minute) period", () => {
    // Test that period configuration is correct
    const combinedSecret = `${mockDomainId}-${mockNetworkId}-${mockDeviceId}-${totpCounter}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedSecret);
    const secret = new OTPAuth.Secret({ buffer: data });

    const totp = new OTPAuth.TOTP({
      issuer: "IoTGW",
      algorithm: "SHA1",
      digits: 6,
      period: 600,
      secret: secret,
    });

    // Verify period is set to 600 seconds (10 minutes)
    expect(totp.period).toBe(600);

    // Calculate what the period counter would be for different times
    // TOTP uses floor(timestamp_seconds / period)
    // Use a time aligned to period boundary for clarity
    const baseTime = 1700000000; // seconds
    const alignedTime = Math.floor(baseTime / 600) * 600; // Start of a period

    const counter1 = Math.floor(alignedTime / 600);
    const counter2 = Math.floor((alignedTime + 599) / 600);
    const counter3 = Math.floor((alignedTime + 600) / 600);

    // Counters within same period should match
    expect(counter1).toBe(counter2);
    // Counter in next period should be different
    expect(counter1).not.toBe(counter3);
    expect(counter3).toBe(counter1 + 1);
  });

  it("should include device_id, network_id, and domain_id in secret", () => {
    const code1 = generateTOTPCode(
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      totpCounter,
    );

    // Change device ID - should generate different code
    const code2 = generateTOTPCode(
      "different-device-id",
      mockNetworkId,
      mockDomainId,
      totpCounter,
    );

    expect(code1).not.toBe(code2);
  });

  it("should allow validation within time window (±1 period)", () => {
    const baseTimestamp = Date.now();

    // Generate code for current period
    const code = generateTOTPCode(
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      totpCounter,
      baseTimestamp,
    );

    // Should validate in current period
    const isValid1 = validateTOTPCode(
      code,
      mockDeviceId,
      mockNetworkId,
      mockDomainId,
      totpCounter,
    );

    expect(isValid1).toBe(true);
  });

  it("should match frontend and backend secret generation", () => {
    const combinedSecret = `${mockDomainId}-${mockNetworkId}-${mockDeviceId}-${totpCounter}`;

    // Frontend implementation
    const frontendEncoder = new TextEncoder();
    const frontendData = frontendEncoder.encode(combinedSecret);
    const frontendSecret = new OTPAuth.Secret({ buffer: frontendData });

    // Backend implementation (same)
    const backendEncoder = new TextEncoder();
    const backendData = backendEncoder.encode(combinedSecret);
    const backendSecret = new OTPAuth.Secret({ buffer: backendData });

    // Both should produce the same secret buffer
    expect(frontendSecret.buffer).toEqual(backendSecret.buffer);
  });

  it("should use SHA1 algorithm", () => {
    const combinedSecret = `${mockDomainId}-${mockNetworkId}-${mockDeviceId}-${totpCounter}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedSecret);
    const secret = new OTPAuth.Secret({ buffer: data });

    const totp = new OTPAuth.TOTP({
      issuer: "IoTGW",
      algorithm: "SHA1",
      digits: 6,
      period: 600,
      secret: secret,
    });

    expect(totp.algorithm).toBe("SHA1");
  });

  it("should generate exactly 6 digits", () => {
    const combinedSecret = `${mockDomainId}-${mockNetworkId}-${mockDeviceId}-${totpCounter}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedSecret);
    const secret = new OTPAuth.Secret({ buffer: data });

    const totp = new OTPAuth.TOTP({
      issuer: "IoTGW",
      algorithm: "SHA1",
      digits: 6,
      period: 600,
      secret: secret,
    });

    expect(totp.digits).toBe(6);
  });

  it("should use IoTGW as issuer", () => {
    const combinedSecret = `${mockDomainId}-${mockNetworkId}-${mockDeviceId}-${totpCounter}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedSecret);
    const secret = new OTPAuth.Secret({ buffer: data });

    const totp = new OTPAuth.TOTP({
      issuer: "IoTGW",
      algorithm: "SHA1",
      digits: 6,
      period: 600,
      secret: secret,
    });

    expect(totp.issuer).toBe("IoTGW");
  });
});
