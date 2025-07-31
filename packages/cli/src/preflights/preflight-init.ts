// utils/preflight-init.ts

import fs from "fs-extra";
import path from "path";
import { spinner } from "../utils/spinner.js";
import { getProjectInfo, ProjectInfo } from "../utils/get-project-info.js";
import * as ERRORS from "../utils/errors.js";
import { logger } from "../utils/logger.js";

type PreflightErrors =
  | typeof ERRORS.MISSING_DIR_OR_EMPTY_PROJECT
  | typeof ERRORS.EXISTING_CONFIG
  | typeof ERRORS.UNSUPPORTED_FRAMEWORK
  | typeof ERRORS.TAILWIND_NOT_CONFIGURED
  | typeof ERRORS.IMPORT_ALIAS_MISSING;

type PreflightResult =
  | {
      ok: true;
      projectInfo: ProjectInfo;
      errors: Record<PreflightErrors, false>;
      hasTailwind: boolean;
      hasTsConfig: boolean;
      framework: ProjectInfo["framework"]["name"];
    }
  | {
      ok: false;
      projectInfo: null;
      errors: Partial<Record<PreflightErrors, true>>;
    };

// Helper to get error message by code (you can add more detailed messages here)
function getErrorMessage(code: string) {
  switch (code) {
    case ERRORS.MISSING_DIR_OR_EMPTY_PROJECT:
      return "Project directory or package.json is missing or empty.";
    case ERRORS.EXISTING_CONFIG:
      return "A clyro.json configuration file already exists.";
    case ERRORS.UNSUPPORTED_FRAMEWORK:
      return "Unsupported framework detected.";
    case ERRORS.TAILWIND_NOT_CONFIGURED:
      return "Tailwind CSS is not properly configured.";
    case ERRORS.IMPORT_ALIAS_MISSING:
      return "Missing import alias in tsconfig for TypeScript projects.";
    default:
      return `Unknown error code: ${code}`;
  }
}

export async function preFlightInit(options: {
  cwd: string;
  force?: boolean;
  silent?: boolean;
}): Promise<PreflightResult> {
  const errors: Partial<Record<PreflightErrors, true>> = {};
  const pkgPath = path.join(options.cwd, "package.json");

  // 1. Ensure cwd and package.json exist
  if (!fs.existsSync(options.cwd) || !fs.existsSync(pkgPath)) {
    errors[ERRORS.MISSING_DIR_OR_EMPTY_PROJECT] = true;
    return {
      ok: false,
      errors: errors as Record<PreflightErrors, true>,
      projectInfo: null,
    };
  }

  // 2. Check if clyro.json exists
  const configPath = path.join(options.cwd, "clyro.json");
  if (fs.existsSync(configPath) && !options.force) {
    errors[ERRORS.EXISTING_CONFIG] = true;
    logger.error(getErrorMessage(ERRORS.EXISTING_CONFIG));
    logger.error(`Use \`--force\` to overwrite it.`);
    return {
      ok: false,
      errors: errors as Record<PreflightErrors, true>,
      projectInfo: null,
    };
  }

  // 3. Start spinner
  const preCheckSpinner = spinner("Running preflight checks...", {
    silent: options.silent,
  }).start();

  const projectInfo = await getProjectInfo(options.cwd);

  if (!projectInfo) {
    errors[ERRORS.MISSING_DIR_OR_EMPTY_PROJECT] = true;
    preCheckSpinner.fail("Failed to read project info.");
    return {
      ok: false,
      errors: errors as Record<PreflightErrors, true>,
      projectInfo: null,
    };
  }

  // 4. Framework check
  if (projectInfo.framework.name === "manual") {
    errors[ERRORS.UNSUPPORTED_FRAMEWORK] = true;
    preCheckSpinner.fail(getErrorMessage(ERRORS.UNSUPPORTED_FRAMEWORK));
    return {
      ok: false,
      errors: errors as Record<PreflightErrors, true>,
      projectInfo: null,
    };
  }

  preCheckSpinner.succeed(
    `Framework: ${projectInfo.framework.name} detected successfully.`
  );

  // 5. Tailwind check
  const tailwindSpinner = spinner("Checking Tailwind CSS setup...", {
    silent: options.silent,
  }).start();

  const hasTailwind =
    (projectInfo.tailwindVersion === "v3" &&
      projectInfo.tailwindConfigFile &&
      projectInfo.tailwindCssFile) ||
    (projectInfo.tailwindVersion === "v4" && projectInfo.tailwindCssFile) ||
    false;

  if (!hasTailwind) {
    errors[ERRORS.TAILWIND_NOT_CONFIGURED] = true;
    tailwindSpinner.fail(getErrorMessage(ERRORS.TAILWIND_NOT_CONFIGURED));
  } else {
    tailwindSpinner.succeed("Tailwind CSS is configured.");
  }

  // 6. Import alias check only if project uses TypeScript
  const hasTsConfig = !!projectInfo.aliasPrefix;
  if (projectInfo.isTsx) {
    const aliasSpinner = spinner("Checking tsconfig import aliases...", {
      silent: options.silent,
    }).start();

    if (!hasTsConfig) {
      errors[ERRORS.IMPORT_ALIAS_MISSING] = true;
      aliasSpinner.fail(getErrorMessage(ERRORS.IMPORT_ALIAS_MISSING));
    } else {
      aliasSpinner.succeed(`Found alias: ${projectInfo.aliasPrefix}`);
    }
  }

  // 7. Final status
  if (Object.keys(errors).length > 0) {
    logger.break();
    logger.error("Preflight checks failed with the following issues:");
    for (const code of Object.keys(errors)) {
      logger.error(`❌ Error Code ${code}: ${getErrorMessage(code)}`);
    }
    logger.break();
    return {
      ok: false,
      errors: errors as Record<PreflightErrors, true>,
      projectInfo: null,
    };
  }

  return {
    ok: true,
    projectInfo,
    framework: projectInfo.framework.name,
    hasTailwind: !!hasTailwind,
    hasTsConfig,
    errors: {
      [ERRORS.MISSING_DIR_OR_EMPTY_PROJECT]: false,
      [ERRORS.EXISTING_CONFIG]: false,
      [ERRORS.UNSUPPORTED_FRAMEWORK]: false,
      [ERRORS.TAILWIND_NOT_CONFIGURED]: false,
      [ERRORS.IMPORT_ALIAS_MISSING]: false,
    },
  };
}
