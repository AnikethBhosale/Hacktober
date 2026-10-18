import { join } from "node:path";
import type { Correction, MemoryReference } from "./types.ts";
import { persistEnabled, readJsonFile, writeJsonFile } from "./persist.ts";

interface StoredCorrection {
  id: string;
  incidentId: string;
  incidentType: string;
  reason: string;
  replacementAction: string;
  at: string;
}

type MemoryFile = { seq: number; items: StoredCorrection[] };

const storeFile = process.env.CORRECTION_STORE_PATH ?? join(process.cwd(), "data", "corrections.json");
const memory: MemoryFile = { seq: 1, items: [] };

function load(): MemoryFile {
  if (!persistEnabled()) return memory;
  return readJsonFile<MemoryFile>(storeFile, { seq: 1, items: [] });
}

function persist(state: MemoryFile) {
  if (!persistEnabled()) {
    memory.seq = state.seq;
    memory.items = state.items;
    return;
  }
  writeJsonFile(storeFile, state);
}

export const correctionMemory = {
  save(incidentId: string, incidentType: string, correction: Correction): string {
    const state = load();
    const id = `COR-${String(state.seq++).padStart(3, "0")}`;
    state.items.push({
      id,
      incidentId,
      incidentType,
      reason: correction.reason,
      replacementAction: correction.replacementAction,
      at: correction.at,
    });
    persist(state);
    return id;
  },

  list(): StoredCorrection[] {
    return [...load().items].sort((a, b) => b.at.localeCompare(a.at));
  },

  findRelated(incidentType: string, excludeIncidentId: string): MemoryReference | undefined {
    if (!incidentType || incidentType === "unknown") return undefined;
    const match = load().items
      .filter((c) => c.incidentType === incidentType && c.incidentId !== excludeIncidentId)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    if (!match) return undefined;
    return {
      sourceIncidentId: match.incidentId,
      incidentType: match.incidentType,
      correctionReason: match.reason,
      replacementAction: match.replacementAction,
      relationship: "same-incident-type",
    };
  },
};
