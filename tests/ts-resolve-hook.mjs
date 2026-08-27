/**
 * Module resolution hook for the test runner.
 *
 * Application code imports siblings the way a bundler expects — `from "./dates"` — while Node's ESM
 * resolver requires a full specifier. Rather than write `./dates.ts` throughout src/ to satisfy the
 * tests (which would make the source answer to the test runner instead of the other way round),
 * the tests install this hook: an extensionless relative specifier that fails to resolve is retried
 * with `.ts`.
 *
 * Registered by tests/register-hooks.mjs, which the `test:*` scripts pass via `node --import`.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[a-z0-9]+$/i.test(specifier);
    if (isRelative && !hasExtension) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
