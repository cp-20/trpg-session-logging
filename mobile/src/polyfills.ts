import * as Crypto from "expo-crypto";

/**
 * React Native / Hermes 環境向けの Web Crypto API ポリフィル。
 * Firebase SDK や @shared/lib/cloud-state が参照する crypto.randomUUID / getRandomValues を補う。
 */
export function ensureCryptoPolyfill(): void {
  const g = globalThis as unknown as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
    };
  };

  if (!g.crypto) {
    g.crypto = {};
  }
  if (typeof g.crypto.randomUUID !== "function") {
    g.crypto.randomUUID = () => Crypto.randomUUID();
  }
  if (typeof g.crypto.getRandomValues !== "function") {
    g.crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      Crypto.getRandomValues(bytes);
      return array;
    };
  }
}

ensureCryptoPolyfill();
