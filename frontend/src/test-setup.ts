// Global test setup: unmount React trees between tests so queries don't see stale DOM.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
