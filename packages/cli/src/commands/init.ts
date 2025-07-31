// commands/init.ts

import { Command } from "commander";
import prompts, { PromptObject } from "prompts";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import { preFlightInit } from "../preflights/preflight-init.js";
import path from "path";
import fs from "fs-extra";
// import { spinner } from "@/utils/spinner.js";
import { installPackages } from "../utils/install-packages.js";
import { injectclyroTheme } from "../utils/theme-injector.js";

type Defaults = {
  typescript?: boolean;
  cssVariables?: boolean;
};

type ProjectInfo = Awaited<ReturnType<typeof preFlightInit>>["projectInfo"];

async function promptForConfig(defaults: Defaults = {}) {
  const questions: PromptObject[] = [
    {
      type: "select",
      name: "baseColor",
      message: "Which base color would you like to use?",
      choices: [
        { title: "neutral", value: "neutral" },
        { title: "gray", value: "gray" },
        { title: "zinc", value: "zinc" },
        { title: "stone", value: "stone" },
        { title: "slate", value: "slate" },
      ],
      initial: 0,
    },
  ];

  return await prompts(questions, {
    onCancel: () => {
      logger.info("User cancelled.");
      process.exit(0);
    },
  });
}

const initOptionsSchema = z.object({
  cwd: z.string(),
  yes: z.boolean().default(false),
  defaults: z.boolean().default(false),
  force: z.boolean().default(false),
  silent: z.boolean().default(false),
  cssVariables: z.boolean().default(true),
  isNewProject: z.boolean().default(false),
  template: z.enum(["next", "next-monorepo"]).optional(),
  baseColor: z.enum(["neutral", "gray", "zinc", "stone", "slate"]).optional(),
  components: z.array(z.string()).optional(),
  srcDir: z.boolean().optional(),
});

export const init = new Command()
  .name("init")
  .description("Initialize clyro in your project")
  .argument("[components...]", "names, url or local path to component")
  .option(
    "-t, --template <template>",
    "the template to use. (next, next-monorepo)"
  )
  .option(
    "-b, --base-color <baseColor>",
    "the base color to use. (neutral, gray, zinc, stone, slate)"
  )
  .option("-y, --yes", "skip confirmation prompt")
  .option("-d, --defaults", "use default configuration")
  .option("-f, --force", "force overwrite of existing configuration")
  .option("-c, --cwd <cwd>", "the working directory", process.cwd())
  .option("-s, --silent", "mute output")
  .option("--src-dir", "use the src directory when creating a new project")
  .option(
    "--no-src-dir",
    "do not use the src directory when creating a new project"
  )
  .option("--css-variables", "use css variables for theming")
  .option("--no-css-variables", "do not use css variables for theming")
  .action(async (components, opts) => {
    logger.break();
    logger.info("Starting clyro Init...");
    logger.break();

    const options = initOptionsSchema.parse({
      cwd: process.cwd(),
      yes: false,
      defaults: false,
      force: false,
      silent: false,
      cssVariables: true,
      isNewProject: false,
      ...opts,
      components,
    });

    // Run preflight checks first and print logs
    const preflightResult = await preFlightInit(options);

    if (!preflightResult.ok) {
      logger.error("Preflight checks failed, exiting...");
      process.exit(1);
    }

    logger.info("✔ Preflight checks.");
    logger.info(`✔ Verifying framework. Found ${preflightResult.framework}.`);
    logger.info(
      `✔ Validating Tailwind CSS config. Found ${preflightResult.projectInfo.tailwindVersion}.`
    );
    logger.info("✔ Validating import alias.");

    // Now prompt user for baseColor if not skipping prompt
    let answers = {};
    if (!options.yes && !options.baseColor) {
      answers = await promptForConfig({
        cssVariables: options.cssVariables,
        typescript: true,
      });
    }

    const finalOptions = {
      ...options,
      ...answers,
      baseColor: options.baseColor ?? (answers as any).baseColor ?? "neutral",
    };

    logger.info("✔ Writing components.json.");
    logger.info("✔ Checking registry.");

    // add all the necessary dependencies
    logger.info("✔ Installing dependencies.");
    await addNecessaryDeps(preflightResult.projectInfo, options);

    logger.info(
      `✔ Updating CSS variables in ${
        preflightResult.projectInfo.tailwindCssFile ?? "src/index.css"
      }`
    );

    await injectclyroTheme(
      preflightResult.projectInfo.tailwindCssFile ?? "src/index.css"
    );

    logger.break();

    const clyroJson = {
      $schema: "https://ui.shadcn.com/schema.json",
      style: finalOptions.template || "default",
      rsc: preflightResult.projectInfo.isRSC,
      tsx: preflightResult.projectInfo.isTsx,
      tailwind: {
        config: preflightResult.projectInfo.tailwindConfigFile ?? "",
        css: preflightResult.projectInfo.tailwindCssFile ?? "app/globals.css",
        baseColor: finalOptions.baseColor,
        cssVariables: finalOptions.cssVariables,
      },
      aliases: {
        components: "@/components",
        utils: "@/lib/utils",
        ui: "@/components/ui",
        lib: "@/lib",
        hooks: "@/hooks",
      },
      iconLibrary: "lucide",
    };

    // uncomment for debugging
    console.log(preflightResult, finalOptions);

    await addNecessaryInitFiles(clyroJson, finalOptions);

    logger.info("Success! Project initialization completed.");
    logger.info("You may now add components.");
    logger.info("By running `npx clyro@latest add [component]`");

    logger.break();
  });

const addNecessaryInitFiles = async (clyroJson: any, options: any) => {
  const clyroJsonPath = path.join(options.cwd, "clyro.json");
  await fs.writeFile(clyroJsonPath, JSON.stringify(clyroJson, null, 2));

  // Determine TypeScript usage
  const useTs = clyroJson.tsx ?? true;
  const ext = useTs ? "ts" : "js";

  // Determine if we are using src/ structure
  const isSrcDir =
    options?.isSrcDir ?? clyroJson.tailwind.css?.startsWith("src/");

  // Define target directory and file path
  const utilsDir = path.join(options.cwd, isSrcDir ? "src/lib" : "lib");
  const utilsFilePath = path.join(utilsDir, `utils.${ext}`);

  // Ensure the directory exists
  await fs.ensureDir(utilsDir);

  // Define file content (TypeScript or JS version)
  const utilsFileCode = useTs
    ? `
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`.trim()
    : `
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge Tailwind classes conditionally.
 */
export function cn(...inputs) {
  return twMerge(clsx(...inputs))
}
`.trim();

  // Write the utils file
  await fs.writeFile(utilsFilePath, utilsFileCode);

  // Log success
  logger.info(`✔ Created ${path.relative(options.cwd, utilsFilePath)}`);
};

const addNecessaryDeps = async (projectInfo: ProjectInfo, options: any) => {
  const necessaryPackages = [
    "tailwind-merge",
    "clsx",
    "class-variance-authority",
    "tw-animate-css",
    "lucide-react"
  ];

  if (projectInfo?.tailwindVersion === "v4") {
    necessaryPackages.push("tailwindcss-animate");
  }

  await installPackages(necessaryPackages, {
    cwd: options.cwd,
    silent: options.silent,
    dev: false,
  });
};
