import fs from "fs-extra";
import path from "path";
import fetch from "node-fetch";
import { logger } from "../utils/logger.js";
import { installPackages } from "../utils/install-packages.js"; // Adjust path if needed

type ComponentFile = {
  path: string;
  content: string;
};

type ComponentJson = {
  files: ComponentFile[];
};

type ClyroConfig = {
  aliases?: Record<string, string>;
  tsx?: boolean;
};

type RegistryComponent = {
  name?: string;
  frameworks: string[];
  deprecated?: boolean;
  status?: string;
  dependencies?: string[]; // ✅ Includes optional dependencies
};

/**
 * Downloads and installs a component and its dependencies.
 */
export async function downloadComponent(
  componentName: string,
  component: RegistryComponent,
  cwd: string
) {
  try {
    // Step 1: Load clyro.json config
    const clyroPath = path.join(cwd, "clyro.json");
    if (!fs.existsSync(clyroPath)) {
      throw new Error("Missing clyro.json. Please run `clyro init` first.");
    }

    const clyroConfig = (await fs.readJSON(clyroPath)) as ClyroConfig;
    const aliases = clyroConfig.aliases || {};
    const useTsx = !!clyroConfig.tsx;

    // Step 2: Install dependencies from registry metadata (NOT the .json file)
    const dependencies = component.dependencies || [];
    if (dependencies.length > 0) {
      logger.info(`📦 Installing dependencies: ${dependencies.join(", ")}`);
      await installPackages(dependencies, {
        cwd,
        dev: false,
      });
    }

    // Step 3: Build component JSON URL (.tsx/.jsx version)
    const extension = useTsx ? "tsx" : "jsx";
    const componentUrl = `https://cdn.jsdelivr.net/gh/DevsToolKit/clyro_testing@main/component_registry/${componentName}/${componentName}.${extension}.json`;

    const res = await fetch(componentUrl);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch component: HTTP ${res.status} ${res.statusText}`
      );
    }

    const componentJson = (await res.json()) as ComponentJson;

    if (!componentJson.files || !Array.isArray(componentJson.files)) {
      throw new Error(
        "Invalid component format: 'files' missing or not an array."
      );
    }

    // Step 4: Write all component files
    for (const file of componentJson.files) {
      const relativePath = file.path;
      const content = file.content;

      // Resolve aliases (e.g. @/lib/utils → src/lib/utils)
      const resolvedPath = Object.entries(aliases).reduce(
        (acc, [alias, actual]) => {
          if (relativePath.startsWith(`${alias}/`)) {
            return relativePath.replace(
              `${alias}/`,
              `${actual.replace(/^@\//, "")}/`
            );
          }
          return acc;
        },
        relativePath
      );

      const filePath = path.join(cwd, "src", resolvedPath);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, content, "utf-8");

      logger.success(`✅ Installed: ${path.relative(cwd, filePath)}`);
    }
  } catch (error) {
    logger.error("❌ Failed to download component:");
    logger.error((error as Error).message);
    throw error;
  }
}
