import http from "node:http";

/** Probes the local registry the staged-installation tests install from; resolves true only when it answers. */
export async function localRegistryAvailable(url = "http://localhost:18821/") {
  return await new Promise((resolve) => {
    const request = http.get(url, { timeout: 1500 }, (response) => { response.resume(); resolve(true); });
    request.on("timeout", () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
  });
}

// A caller may select the real house registry for independent CI receiving.
// Otherwise the tests probe the local house registry this repository's .npmrc names.
// Explicit CI selection must never silently skip a dependency refusal.
const hasSelectedRegistry = Object.hasOwn(process.env, "JSNODE_STAGING_REGISTRY");
export const stagedRegistry = hasSelectedRegistry ? process.env.JSNODE_STAGING_REGISTRY : "http://localhost:18821/";
export const hasLocalRegistry = hasSelectedRegistry ? false : await localRegistryAvailable(stagedRegistry);
export const requiresLocalRegistry = hasSelectedRegistry || hasLocalRegistry ? {} :
  { skip: "requires a local registry at http://localhost:18821/ (staged dependency installation)" };
