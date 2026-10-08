import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
const KEY_BYTES = 32;
/** Read the profile's AES key, or null if the key file doesn't exist. */
export function readKey(keyPath) {
    let hex;
    try {
        hex = fs.readFileSync(keyPath, "utf-8").trim();
    }
    catch (err) {
        if (err.code === "ENOENT")
            return null;
        throw err;
    }
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length !== KEY_BYTES * 2) {
        throw new Error(`Key file ${keyPath} is malformed: expected ${KEY_BYTES * 2} hex characters.`);
    }
    return Buffer.from(hex, "hex");
}
/**
 * Read the key, creating it if it doesn't exist. Creation is exclusive, so two
 * processes racing to create the key both end up with the same one.
 */
export function readOrCreateKey(keyPath) {
    const existing = readKey(keyPath);
    if (existing)
        return existing;
    const key = crypto.randomBytes(KEY_BYTES);
    try {
        fs.writeFileSync(keyPath, key.toString("hex") + "\n", { mode: 0o600, flag: "wx" });
    }
    catch (err) {
        if (err.code === "EEXIST")
            return readOrCreateKey(keyPath);
        throw err;
    }
    return key;
}
export function deleteKey(keyPath) {
    fs.rmSync(keyPath, { force: true });
}
/** Write a file so a crash leaves either the old contents or the new, never a partial file. */
export function writeFileAtomic(filePath, contents) {
    const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    const fd = fs.openSync(tmp, "w", 0o600);
    try {
        fs.writeSync(fd, contents);
        fs.fsyncSync(fd);
    }
    finally {
        fs.closeSync(fd);
    }
    try {
        fs.renameSync(tmp, filePath);
    }
    catch (err) {
        fs.rmSync(tmp, { force: true });
        throw err;
    }
    const dir = fs.openSync(path.dirname(filePath), "r");
    try {
        fs.fsyncSync(dir);
    }
    finally {
        fs.closeSync(dir);
    }
}
