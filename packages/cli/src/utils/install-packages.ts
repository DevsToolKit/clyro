import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { logger } from "./logger.js";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export const detectPackageManager = (cwd: string): PackageManager => {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(cwd, "bun.lockb"))) return "bun";
  return "npm"; // default
};

export interface InstallOptions {
  cwd: string;
  silent?: boolean;
  dev?: boolean;
}

export const installPackages = async (
  packages: string[],
  options: InstallOptions
) => {
  if (!packages.length) return;

  const pkgManager = detectPackageManager(options.cwd);
  const devFlag = options.dev
    ? pkgManager === "npm"
      ? "--save-dev"
      : "-D"
    : "";

  let command = pkgManager;
  let args: string[] = [];

  switch (pkgManager) {
    case "pnpm":
      args = ["add", devFlag, ...packages].filter(Boolean);
      break;
    case "yarn":
      args = ["add", ...(options.dev ? ["--dev"] : []), ...packages];
      break;
    case "bun":
      args = ["add", devFlag, ...packages].filter(Boolean);
      break;
    default:
      args = ["install", devFlag, ...packages].filter(Boolean);
  }

  // ✅ Only show the essential info
  logger.info(`📦 Installing: ${packages.join(", ")}`);

  try {
    await execa(command, args, {
      cwd: options.cwd,
      stdio: "inherit", // show npm's own output
      shell: process.platform === "win32", // Windows fix
    });
    logger.info("✅ Installation complete");
  } catch (err: any) {
    logger.error(`❌ Failed to install: ${packages.join(", ")}`);
    if (!options.silent) console.error(err.shortMessage || err.message || err);
  }
};
