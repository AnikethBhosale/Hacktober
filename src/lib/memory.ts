import type { Correction, MemoryReference } from "./types";

/**
 * Typed correction memory store.
 * Persists corrections in-process (same lifecycle as incidentStore).
 * Replace with a Prisma adapter for multi-process deployments.
 */
interface StoredCorrection {
    id: string;
    incidentId: string;
    incidentType: string;
    reason: string;
    replacementAction: string;
    at: string;
}

const corrections = new Map<string, StoredCorrection>();
let seq = 1;

export const correctionMemory = {
    /** Save a dispatcher correction keyed by incident and incident type. */
    save(incidentId: string, incidentType: string, correction: Correction): string {
        const id = `COR-${String(seq++).padStart(3, "0")}`;
        corrections.set(id, {
            id,
            incidentId,
            incidentType,
            reason: correction.reason,
            replacementAction: correction.replacementAction,
            at: correction.at,
        });
        return id;
    },

    /** Return all stored corrections, newest first. */
    list(): StoredCorrection[] {
        return [...corrections.values()].sort((a, b) => b.at.localeCompare(a.at));
    },

    /**
     * Find the most recent correction for the same incident type.
     * Returns a MemoryReference if found, undefined otherwise.
     * Never returns the correction for the same incident — only prior ones.
     */
    findRelated(incidentType: string, excludeIncidentId: string): MemoryReference | undefined {
        if (!incidentType || incidentType === "unknown") return undefined;
        const match = [...corrections.values()]
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
