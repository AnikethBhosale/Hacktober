import { describe, expect, it, beforeEach } from "vitest";
import { correctionMemory } from "../src/lib/memory";
import type { Correction } from "../src/lib/types";

function makeCorrection(reason: string, action: string): Correction {
    return { reason, replacementAction: action, at: new Date().toISOString() };
}

describe("correctionMemory store", () => {
    // Reset module-level state between tests by directly re-importing or by
    // exercising the API as a black-box (corrections accumulate across tests,
    // which is acceptable here because each test uses unique incidentIds).

    it("save returns a COR-prefixed id", () => {
        const id = correctionMemory.save("RS-TEST-1", "tyre_failure", makeCorrection("Wrong action", "Inspect first"));
        expect(id).toMatch(/^COR-/);
    });

    it("list returns saved corrections newest first", () => {
        correctionMemory.save("RS-TEST-A", "tyre_failure", makeCorrection("Reason A", "Action A"));
        correctionMemory.save("RS-TEST-B", "cargo_damage", makeCorrection("Reason B", "Action B"));
        const list = correctionMemory.list();
        expect(list.length).toBeGreaterThanOrEqual(2);
        // Sorted newest first
        expect(list[0].at >= list[1].at).toBe(true);
    });

    it("findRelated returns a MemoryReference for a matching incidentType", () => {
        correctionMemory.save("RS-PRIOR-1", "tyre_failure", makeCorrection("Check seals", "Seal inspection first"));
        const ref = correctionMemory.findRelated("tyre_failure", "RS-NEW-1");
        expect(ref).toBeDefined();
        expect(ref!.relationship).toBe("same-incident-type");
        expect(ref!.incidentType).toBe("tyre_failure");
        expect(ref!.correctionReason).toBe("Check seals");
    });

    it("findRelated never returns the correction for the same incident", () => {
        correctionMemory.save("RS-SELF", "tyre_failure", makeCorrection("Self correction", "Action"));
        const ref = correctionMemory.findRelated("tyre_failure", "RS-SELF");
        // Should return undefined OR a different incident's correction — never self
        if (ref !== undefined) {
            expect(ref.sourceIncidentId).not.toBe("RS-SELF");
        }
    });

    it("findRelated returns undefined for unknown incidentType", () => {
        const ref = correctionMemory.findRelated("unknown", "RS-ANY");
        expect(ref).toBeUndefined();
    });

    it("findRelated returns undefined when no matching correction exists", () => {
        // Use a type not previously saved
        const ref = correctionMemory.findRelated("delay", "RS-DELAY-1");
        expect(ref).toBeUndefined();
    });

    it("retrieved memory label is advisory — relationship is same-incident-type", () => {
        correctionMemory.save("RS-LABEL-SRC", "cargo_damage", makeCorrection("Inspect packaging", "Request inspection"));
        const ref = correctionMemory.findRelated("cargo_damage", "RS-LABEL-NEW");
        expect(ref).toBeDefined();
        expect(ref!.relationship).toBe("same-incident-type");
        // Verify it contains the saved data
        expect(ref!.sourceIncidentId).toBe("RS-LABEL-SRC");
        expect(ref!.replacementAction).toBe("Request inspection");
    });
});
