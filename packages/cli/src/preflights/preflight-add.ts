// ────────────────────────────────────────────────────────────────
// Preflight check before adding a component
// ────────────────────────────────────────────────────────────────

import fs from "fs-extra";
import path from "path";
import { spinner } from "../utils/spinner.js";
import { logger } from "../utils/logger.js";

const REGISTRY_URL =
  "https://cdn.jsdelivr.net/gh/DevsToolKit/clyro_testing@main/component-registry.json";

type PreflightResult =
  | {
      ok: true;
      component: any;
    }
  | {
      ok: false;
      errors: string[];
    };

export async function preFlightAdd(
  componentName: string,
  cwd: string
): Promise<PreflightResult> {
  const errors: string[] = [];

  // ────────────────────────────────────────────────────────────────
  // Step 1: Check clyro.json exists
  // ────────────────────────────────────────────────────────────────
  const clyroConfigPath = path.join(cwd, "clyro.json");
  if (!fs.existsSync(clyroConfigPath)) {
    errors.push("❌ Missing clyro.json. Run `clyro init` first.");
    return { ok: false, errors };
  }

  // ────────────────────────────────────────────────────────────────
  // Step 2: Load component registry from GitHub (via CDN)
  // ────────────────────────────────────────────────────────────────
  const registrySpinner = spinner("Fetching component registry...").start();
  let registry: any;

  try {
    const res = await fetch(REGISTRY_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    registry = data?.components || {};
    registrySpinner.succeed("✅ Component registry loaded.");
  } catch (err) {
    registrySpinner.fail("❌ Failed to fetch component registry.");
    errors.push("❌ Could not load the component registry.");
    return { ok: false, errors };
  }

  // ────────────────────────────────────────────────────────────────
  // Step 3: Check if the component exists in registry
  // ────────────────────────────────────────────────────────────────
  const component = registry[componentName];
  if (!component) {
    errors.push(`❌ Component "${componentName}" not found in registry.`);
    return { ok: false, errors };
  }

  // ────────────────────────────────────────────────────────────────
  // Step 4: Check if component is deprecated
  // ────────────────────────────────────────────────────────────────
  if (component.deprecated || component.status === "deprecated") {
    errors.push(
      `❌ Component "${componentName}" is deprecated and cannot be added.`
    );
    return { ok: false, errors };
  }

  // ────────────────────────────────────────────────────────────────
  // Step 5: Check if component is already added in clyro.json
  // ────────────────────────────────────────────────────────────────
  const clyroConfig = await fs.readJSON(clyroConfigPath);
  if (clyroConfig.components && Array.isArray(clyroConfig.components)) {
    const alreadyAdded = clyroConfig.components.includes(componentName);
    if (alreadyAdded) {
      errors.push(`⚠️ Component "${componentName}" is already added.`);
      return { ok: false, errors };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Step 6: Detect project framework (react / next)
  // ────────────────────────────────────────────────────────────────
  let detectedFramework: string = "react";
  if (clyroConfig.rsc && clyroConfig.tsx) {
    detectedFramework = "next";
  }

  const supported = component.frameworks.includes(detectedFramework);
  if (!supported) {
    errors.push(
      `❌ Component "${componentName}" does not support the "${detectedFramework}" framework.`
    );
    return { ok: false, errors };
  }

  // ────────────────────────────────────────────────────────────────
  // ✅ Final Result: Preflight passed, return component data
  // ────────────────────────────────────────────────────────────────
  return {
    ok: true,
    component,
  };
}
