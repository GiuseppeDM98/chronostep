/**
 * Installs the TypeScript resolution hook for the test processes.
 * Passed to node via `--import` so it runs before any test module is resolved.
 */
import { register } from "node:module";

register("./ts-resolve-hook.mjs", import.meta.url);
