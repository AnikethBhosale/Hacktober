import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function persistEnabled() {
  return process.env.VITEST !== "true";
}

export function readJsonFile<T>(file: string, fallback: T): T {
  if (!persistEnabled() || !existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(file: string, value: unknown) {
  if (!persistEnabled()) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}
