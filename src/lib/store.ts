import { seededIncidents } from "./seed";
import type { Incident } from "./types";

// Replace this development adapter with PrismaIncidentStore for multi-process deployments.
// The interface deliberately keeps immutable event data on the incident record.
const incidents = new Map(seededIncidents.map((incident) => [incident.id, structuredClone(incident)]));
export const incidentStore = {
  list: () => [...incidents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  get: (id: string) => incidents.get(id),
  save: (incident: Incident) => incidents.set(incident.id, incident)
};
