import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// token-store resolves ~/.config/intuit-cli at import time, so each test points
// HOME at a fresh temp dir and re-imports the module.
let home: string;
let dir: string;

async function load() {
  vi.resetModules();
  return import("../lib/token-store.js");
}

const token = { access_token: "at", refresh_token: "rt", realmId: "123" };

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "intuit-cli-test-"));
  dir = path.join(home, ".config", "intuit-cli");
  vi.stubEnv("HOME", home);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(home, { recursive: true, force: true });
});

describe("tokenStore", () => {
  it("round-trips a token through the key file", async () => {
    const { tokenStore } = await load();
    tokenStore.set(token, "sandbox");
    expect(tokenStore.get("sandbox")).toEqual(token);
  });

  it("keeps the key in a 0600 file next to the token file", async () => {
    const { tokenStore } = await load();
    tokenStore.set(token, "sandbox");
    const keyFile = path.join(dir, "sandbox.key");
    expect(fs.statSync(keyFile).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.join(dir, "sandbox.tokens.enc.json")).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(keyFile, "utf-8").trim()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("decrypts after a fresh process (the key survives a module reload)", async () => {
    (await load()).tokenStore.set(token, "sandbox");
    expect((await load()).tokenStore.get("sandbox")).toEqual(token);
  });

  it("reuses the key across writes", async () => {
    const { tokenStore } = await load();
    tokenStore.set(token, "sandbox");
    const key = fs.readFileSync(path.join(dir, "sandbox.key"), "utf-8");
    tokenStore.set({ ...token, access_token: "at2" }, "sandbox");
    expect(fs.readFileSync(path.join(dir, "sandbox.key"), "utf-8")).toBe(key);
    expect(tokenStore.get("sandbox")?.access_token).toBe("at2");
  });

  it("returns null when there is no token file", async () => {
    const { tokenStore } = await load();
    expect(tokenStore.get("sandbox")).toBeNull();
  });

  it("throws, without creating a new key, when the key file is missing", async () => {
    const { tokenStore } = await load();
    tokenStore.set(token, "sandbox");
    fs.rmSync(path.join(dir, "sandbox.key"));
    expect(() => tokenStore.get("sandbox")).toThrow(/key file .*sandbox\.key is missing/);
    expect(fs.existsSync(path.join(dir, "sandbox.key"))).toBe(false);
  });

  it("throws when the key doesn't match the token file", async () => {
    const { tokenStore } = await load();
    tokenStore.set(token, "sandbox");
    fs.writeFileSync(path.join(dir, "sandbox.key"), "ab".repeat(32));
    expect(() => tokenStore.get("sandbox")).toThrow(/wrong key or corrupt file/);
  });

  it("throws when the key file is malformed", async () => {
    const { tokenStore } = await load();
    tokenStore.set(token, "sandbox");
    fs.writeFileSync(path.join(dir, "sandbox.key"), "abc");
    expect(() => tokenStore.get("sandbox")).toThrow(/malformed/);
  });

  it("leaves no temp files behind after a write", async () => {
    const { tokenStore } = await load();
    tokenStore.set(token, "sandbox");
    tokenStore.set(token, "sandbox");
    expect(fs.readdirSync(dir).sort()).toEqual(["sandbox.key", "sandbox.tokens.enc.json"]);
  });

  it("clear removes both the token file and the key file", async () => {
    const { tokenStore } = await load();
    tokenStore.set(token, "sandbox");
    tokenStore.clear("sandbox");
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
