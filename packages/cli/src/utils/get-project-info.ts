// utils/get-project-info.ts

import path from "path";
import fg from "fast-glob";
import fs from "fs-extra";
import { loadConfig } from "tsconfig-paths";
import { z } from "zod";
import { FRAMEWORKS, Framework } from "./frameworks.js";

export type TailwindVersion = "v3" | "v4" | null;

export type ProjectInfo = {
  framework: {
    name: string;
    label: string;
    links: {
      installation: string;
      tailwind: string;
    };
  };
  tailwindVersion: string | null;
  tailwindConfigFile?: string;
  tailwindCssFile?: string;
  aliasPrefix?: string;
  isSrcDir: boolean;
  isRSC: boolean;
  isTsx: boolean;
  
};

const PROJECT_SHARED_IGNORE = [
  "**/node_modules/**",
  ".next",
  "public",
  "dist",
  "build",
];

// const TS_CONFIG_SCHEMA = z.object({
//   compilerOptions: z.object({
//     paths: z.record(z.string().or(z.array(z.string()))),
//   }),
// });

// --- Main ---
export async function getProjectInfo(cwd: string): Promise<ProjectInfo> {
  const [
    configFiles,
    isSrcDir,
    isTsx,
    tailwindConfigFile,
    tailwindCssFile,
    tailwindVersion,
    aliasPrefix,
    packageJson,
  ] = await Promise.all([
    fg.glob(
      "**/{next,vite,astro,app}.config.*|gatsby-config.*|composer.json|react-router.config.*",
      {
        cwd,
        deep: 3,
        ignore: PROJECT_SHARED_IGNORE,
      }
    ),
    fs.pathExists(path.resolve(cwd, "src")),
    isTypeScriptProject(cwd),
    getTailwindConfigFile(cwd),
    getTailwindCssFile(cwd),
    getTailwindVersion(cwd),
    getTsConfigAliasPrefix(cwd),
    getPackageInfo(cwd),
  ]);

  const isUsingAppDir = await fs.pathExists(
    path.resolve(cwd, `${isSrcDir ? "src/" : ""}app`)
  );

  // Default fallback framework
  let selectedFramework: Framework | undefined;
  let isRSC = false;

  // --- Next.js detection ---
  if (configFiles.find((f) => f.startsWith("next.config."))) {
    selectedFramework = isUsingAppDir
      ? FRAMEWORKS["next-app"]
      : FRAMEWORKS["next-pages"];
    isRSC = isUsingAppDir;
  }
  // --- Astro ---
  else if (configFiles.find((f) => f.startsWith("astro.config."))) {
    selectedFramework = FRAMEWORKS["astro"];
  }
  // --- Gatsby ---
  else if (configFiles.find((f) => f.startsWith("gatsby-config."))) {
    selectedFramework = FRAMEWORKS["gatsby"];
  }
  // --- Laravel ---
  else if (configFiles.find((f) => f.startsWith("composer.json"))) {
    selectedFramework = FRAMEWORKS["laravel"];
  }
  // --- Remix ---
  else if (
    Object.keys(packageJson?.dependencies ?? {}).find((dep) =>
      dep.startsWith("@remix-run/")
    )
  ) {
    selectedFramework = FRAMEWORKS["remix"];
  }
  // --- TanStack Start ---
  else if (
    [
      ...Object.keys(packageJson?.dependencies ?? {}),
      ...Object.keys(packageJson?.devDependencies ?? {}),
    ].find((dep) => dep.startsWith("@tanstack/react-start"))
  ) {
    selectedFramework = FRAMEWORKS["tanstack-start"];
  }
  // --- React Router ---
  else if (configFiles.find((f) => f.startsWith("react-router.config."))) {
    selectedFramework = FRAMEWORKS["react-router"];
  }
  // --- Vite ---
  else if (
    configFiles.find((f) => f.startsWith("vite.config.")) ||
    "vite" in (packageJson?.dependencies ?? {}) ||
    "vite" in (packageJson?.devDependencies ?? {})
  ) {
    selectedFramework = FRAMEWORKS["vite"];
  }
  // --- Create React App (CRA) ---
  else if (
    "react-scripts" in (packageJson?.dependencies ?? {}) ||
    "react-scripts" in (packageJson?.devDependencies ?? {})
  ) {
    selectedFramework = FRAMEWORKS["cra"];
  }
  // --- Vinxi-based ---
  else {
    const appConfig = configFiles.find((f) => f.startsWith("app.config"));
    if (appConfig?.length) {
      const contents = await fs.readFile(path.resolve(cwd, appConfig), "utf8");
      if (contents.includes("defineConfig")) {
        selectedFramework = FRAMEWORKS["vite"];
      }
    }
  }
  // --- Expo ---
  if (packageJson?.dependencies?.expo) {
    selectedFramework = FRAMEWORKS["expo"];
  }

  if (!selectedFramework) {
    selectedFramework = FRAMEWORKS["manual"];
  }

  return {
    framework: selectedFramework,
    isSrcDir: isSrcDir ?? false,
    isRSC,
    isTsx,
    tailwindConfigFile: tailwindConfigFile ?? undefined,
    tailwindCssFile: tailwindCssFile ?? undefined,
    tailwindVersion,
    aliasPrefix: aliasPrefix ?? undefined,
  };
}

// --- Helpers ---
export async function getPackageInfo(cwd: string) {
  const pkgPath = path.resolve(cwd, "package.json");
  if (!(await fs.pathExists(pkgPath))) return null;
  return fs.readJSON(pkgPath);
}

export async function getTailwindVersion(
  cwd: string
): Promise<TailwindVersion> {
  const pkg = await getPackageInfo(cwd);

  if (!pkg) return null;
  const tw =
    pkg.dependencies?.tailwindcss ?? pkg.devDependencies?.tailwindcss ?? null;

  if (!tw) return null;
  if (/^3(\.\d+)?/.test(tw)) return "v3";
  return "v4";
}

export async function getTailwindCssFile(cwd: string) {
  const [files] = await Promise.all([
    fg.glob(["**/*.css", "**/*.scss"], {
      cwd,
      deep: 5,
      ignore: PROJECT_SHARED_IGNORE,
    }),
  ]);

  if (!files.length) return null;

  for (const file of files) {
    const content = await fs.readFile(path.resolve(cwd, file), "utf8");
    if (
      content.includes("@tailwind base") ||
      content.includes('@import "tailwindcss"') ||
      content.includes("@import 'tailwindcss'")
    ) {
      return file;
    }
  }

  return null;
}

export async function getTailwindConfigFile(cwd: string) {
  const files = await fg.glob("tailwind.config.*", {
    cwd,
    deep: 3,
    ignore: PROJECT_SHARED_IGNORE,
  });
  return files[0] ?? null;
}

export async function getTsConfigAliasPrefix(cwd: string) {
  const tsConfig = await loadConfig(cwd);

  if (
    tsConfig?.resultType === "failed" ||
    !Object.entries(tsConfig?.paths).length
  ) {
    return null;
  }

  for (const [alias, paths] of Object.entries(tsConfig.paths)) {
    if (
      paths.includes("./*") ||
      paths.includes("./src/*") ||
      paths.includes("./app/*") ||
      paths.includes("./resources/js/*")
    ) {
      return alias.replace(/\/\*$/, "") ?? null;
    }
  }

  return Object.keys(tsConfig?.paths)?.[0].replace(/\/\*$/, "") ?? null;
}

export async function isTypeScriptProject(cwd: string) {
  const files = await fg.glob("tsconfig.*", {
    cwd,
    deep: 1,
    ignore: PROJECT_SHARED_IGNORE,
  });
  return files.length > 0;
}
