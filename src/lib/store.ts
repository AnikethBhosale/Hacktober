import { seededIncidents } from "./seed";
import type { Incident } from "./types";

// Replace this development adapter with PrismaIncidentStore for multi-process deployments.
// The interface deliberately keeps immutable event data on the incident record.
const incidents = new Map(seededIncidents.map((incident) => [incident.id, structuredClone(incident)]));
export const incidentStore = {
  list: () => [...incidents.values()].map((incident) => structuredClone(incident)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  get: (id: string) => {
    const incident = incidents.get(id);
    return incident && structuredClone(incident);
  },
  createId: () => {
    let id: string;
    do { id = `RS-${crypto.randomUUID()}`; } while (incidents.has(id));
    return id;
  },
  save: (incident: Incident) => incidents.set(incident.id, structuredClone(incident))
};
