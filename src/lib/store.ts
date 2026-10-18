import { join } from "node:path";
import { persistEnabled, readJsonFile, writeJsonFile } from "./persist.ts";
import { seededIncidents } from "./seed.ts";
import type { Incident } from "./types.ts";

const storeFile = process.env.INCIDENT_STORE_PATH ?? join(process.cwd(), "data", "incidents.json");
const memory = new Map(seededIncidents.map((incident) => [incident.id, structuredClone(incident)]));

function load(): Map<string, Incident> {
  if (!persistEnabled()) return memory;
  const rows = readJsonFile<Incident[]>(storeFile, seededIncidents);
  return new Map(rows.map((incident) => [incident.id, structuredClone(incident)]));
}

function persist(incidents: Map<string, Incident>) {
  if (!persistEnabled()) return;
  writeJsonFile(storeFile, [...incidents.values()]);
}

if (persistEnabled() && readJsonFile<Incident[] | null>(storeFile, null) === null) {
  persist(load());
}

export const incidentStore = {
  list: () => [...load().values()].map((incident) => structuredClone(incident)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  get: (id: string) => {
    const incident = load().get(id);
    return incident && structuredClone(incident);
  },
  createId: () => {
    const incidents = load();
    let id: string;
    do { id = `RS-${crypto.randomUUID()}`; } while (incidents.has(id));
    return id;
  },
  save: (incident: Incident) => {
    const incidents = load();
    incidents.set(incident.id, structuredClone(incident));
    if (!persistEnabled()) {
      memory.clear();
      for (const [key, value] of incidents) memory.set(key, value);
    }
    persist(incidents);
  }
};
