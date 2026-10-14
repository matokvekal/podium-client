// Test-only helper: a spy shared between a test file and its vi.mock factory (vi.mock is hoisted
// above ordinary consts, so the spy has to live in a module).
import { vi } from "vitest";

export const upsertSpy = vi.fn();
