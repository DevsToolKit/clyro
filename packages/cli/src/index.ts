#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "module";
import { init } from "./commands/init.js";
import { add } from "./commands/add.js";
import { showWatermark } from "./utils/watermark.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

async function main() {
  const program = new Command();

  program
    .name("clyro")
    .description("clyro CLI - initialize and manage UI components")
    .version(
      packageJson.version || "0.1.0-beta.1",
      "-v, --version",
      "Show version"
    )
    .addCommand(init)
    .addCommand(add) // ✅ Step 2: Register the `add` command
    .showHelpAfterError();

  const args = process.argv.slice(2);

  if (args.length === 0) {
    showWatermark();
    program.outputHelp();
    return;
  }

  program.parse(process.argv);
}

main();
