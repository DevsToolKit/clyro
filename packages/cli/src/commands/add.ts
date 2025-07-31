// commands/add.ts

import fs from "fs-extra";
import path from "path";
import { spinner } from "../utils/spinner.js";
import { logger } from "../utils/logger.js";
import { preFlightAdd } from "../preflights/preflight-add.js";
import { downloadComponent } from "../utils/download-component.js"; // ✅ fixed relative import
import { Command } from "commander";

const add = new Command()
  .name("add")
  .description("Add a component from the registry")
  .argument("<component>", "Name of the component to add")
  .action(async (componentName: string) => {
    const cwd = process.cwd();

    // Step 1: Preflight check
    const result = await preFlightAdd(componentName, cwd);
    if (!result.ok) {
      result.errors.forEach((err) => logger.error(err));
      process.exit(1);
    }

    const { component } = result;

    // Step 2: Download component file
    const downloadSpinner = spinner(
      `Downloading component "${componentName}"...`
    ).start();

    try {
      await downloadComponent(componentName, component, cwd); // ✅ pass full component object
      downloadSpinner.succeed(`Component "${componentName}" added.`);
    } catch (err) {
      downloadSpinner.fail(`Failed to download component "${componentName}".`);
      logger.error((err as Error).message);
      process.exit(1);
    }

    // Step 3: Update clyro.json
    const clyroPath = path.join(cwd, "clyro.json");
    const config = await fs.readJSON(clyroPath);
    config.components = config.components || [];

    if (!config.components.includes(componentName)) {
      config.components.push(componentName);
    }

    await fs.writeJSON(clyroPath, config, { spaces: 2 });

    logger.success(
      `✅ Component "${componentName}" successfully added to clyro.json.`
    );
  });

export { add };
