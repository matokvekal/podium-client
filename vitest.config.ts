/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The client had no test config at all until component tests arrived: vitest ran on its
 * defaults, which means environment "node". Every test here was a pure-logic module under
 * src/lib, so nothing missed a DOM.
 *
 * jsdom is applied PER FILE rather than globally. A DOM costs real time to construct for each
 * test file, and the ~24 logic suites do not need one — making it the global environment would
 * slow the whole run down to buy nothing. `environmentMatchGlobs` is deprecated in vitest 4,
 * so the selection is the documented replacement: a docblock in each component test file
 * (`@vitest-environment jsdom`), with node as the default here.
 */
export default defineConfig({
  // The app's own build config is separate (vite.config.ts) and stays the source of truth for
  // building; this file only exists to configure tests. The React plugin is still needed, so
  // JSX in a .tsx test is transformed the same way the app's is.
  plugins: [react()],
  test: {
    environment: "node",
    // React Testing Library's auto-cleanup hooks into these globals; without it a component
    // from one test stays mounted into the next and queries match two copies of everything.
    globals: true,
  },
});
