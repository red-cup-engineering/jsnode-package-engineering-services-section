import http from "node:http";

/** Probes the local registry the staged-installation tests install from; resolves true only when it answers. */
export async function localRegistryAvailable(url = "http://127.0.0.1:4873/") {
  return await new Promise((resolve) => {
    const request = http.get(url, { timeout: 1500 }, (response) => { response.resume(); resolve(true); });
    request.on("timeout", () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
  });
}

// A caller may select the real house registry for independent CI receiving.
// The original local developer mode continues to probe localhost:4873.
// Explicit CI selection must never silently skip a dependency refusal.
const hasSelectedRegistry = Object.hasOwn(process.env, "JSNODE_STAGING_REGISTRY");
export const stagedRegistry = hasSelectedRegistry ? process.env.JSNODE_STAGING_REGISTRY : "http://127.0.0.1:4873/";
export const hasLocalRegistry = hasSelectedRegistry ? false : await localRegistryAvailable(stagedRegistry);
export const requiresLocalRegistry = hasSelectedRegistry || hasLocalRegistry ? {} :
  { skip: "requires a local registry at http://127.0.0.1:4873/ (staged dependency installation)" };
