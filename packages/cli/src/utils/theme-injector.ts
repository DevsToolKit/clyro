import fs from "fs-extra";
import path from "path";
import { logger } from "./logger.js";
import { clyro_REACT_THEME_BLOCK } from "../constants/theme-template.js";

// Regex patterns for single-block extractions
const IMPORT_REGEX = /^@import\s+.*?;$/gm;
const ROOT_REGEX = /:root\s*\{([\s\S]*?)\}/m;
const DARK_REGEX = /\.dark\s*\{([\s\S]*?)\}/m;

const REQUIRED_IMPORTS = [
  '@import "tailwindcss";',
  '@import "tw-animate-css";',
];

// ✅ Extract CSS vars from a block
function extractVars(block: string): Record<string, string> {
  const vars: Record<string, string> = {};
  block
    .split("\n")
    .map((line) => line.trim().replace(/\/\*.*?\*\//g, "")) // strip comments
    .forEach((line) => {
      const m = line.match(/^--([\w-]+):\s*(.+);$/);
      if (m) vars[`--${m[1]}`] = m[2].trim();
    });
  return vars;
}

// ✅ Build CSS block from vars
function buildBlock(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([key, val]) => `  ${key}: ${val};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

// ✅ Brace-counting parser to extract a full CSS block
function extractBlock(content: string, keyword: string): string {
  const startIdx = content.indexOf(keyword);
  if (startIdx === -1) return "";

  let openIdx = content.indexOf("{", startIdx);
  if (openIdx === -1) return "";

  let braceCount = 1;
  let i = openIdx + 1;

  while (i < content.length && braceCount > 0) {
    if (content[i] === "{") braceCount++;
    else if (content[i] === "}") braceCount--;
    i++;
  }

  return content.slice(startIdx, i); // full block
}

// ✅ Extracts section from clyro template
function getCoreSection(keyword: string): string {
  return extractBlock(clyro_REACT_THEME_BLOCK, keyword);
}

export async function injectclyroTheme(cssFilePath: string) {
  if (!fs.existsSync(cssFilePath)) {
    logger.warn(`❌ CSS file not found: ${cssFilePath}`);
    return;
  }

  let cssContent = await fs.readFile(cssFilePath, "utf-8");

  /** ── STEP 1: Find all @import lines ── */
  const lines = cssContent.split("\n");
  const importLines: string[] = [];
  let lastImportIndex = -1;

  lines.forEach((line, idx) => {
    if (line.trim().startsWith("@import")) {
      importLines.push(line.trim());
      lastImportIndex = idx;
    }
  });

  // Add REQUIRED_IMPORTS if missing
  REQUIRED_IMPORTS.forEach((req) => {
    if (!importLines.includes(req)) {
      importLines.push(req);
    }
  });

  // Remove ALL imports temporarily for clean content
  let workingContent = cssContent.replace(IMPORT_REGEX, "").trim();

  /** ── STEP 2: Extract clyro template sections ── */
  const coreRootVars = extractVars(
    (clyro_REACT_THEME_BLOCK.match(ROOT_REGEX) || [])[1] || ""
  );
  const coreDarkVars = extractVars(
    (clyro_REACT_THEME_BLOCK.match(DARK_REGEX) || [])[1] || ""
  );

  const coreThemeInline = getCoreSection("@theme inline");
  const coreLayerBase = getCoreSection("@layer base");

  /** ── STEP 3: Extract USER sections ── */
  const userRootVars = extractVars(
    (workingContent.match(ROOT_REGEX) || [])[1] || ""
  );
  const userDarkVars = extractVars(
    (workingContent.match(DARK_REGEX) || [])[1] || ""
  );

  /** ── STEP 4: Merge vars (User > clyro defaults) ── */
  const mergedRootVars = { ...coreRootVars, ...userRootVars };
  const mergedDarkVars = { ...coreDarkVars, ...userDarkVars };

  const mergedRootBlock = buildBlock(":root", mergedRootVars);
  const mergedDarkBlock = buildBlock(".dark", mergedDarkVars);

  /** ── STEP 5: Strip OLD sections from user CSS ── */
  workingContent = workingContent
    .replace(ROOT_REGEX, "")
    .replace(DARK_REGEX, "")
    .replace(extractBlock(workingContent, "@theme inline"), "")
    .replace(extractBlock(workingContent, "@layer base"), "")
    .trim();

  /** ── STEP 6: Compose clyro blocks ── */
  const clyroBlock = [
    coreThemeInline, // always replace fully
    "",
    mergedRootBlock, // merged :root vars
    "",
    mergedDarkBlock, // merged .dark vars
    "",
    coreLayerBase, // always replace fully
  ]
    .filter(Boolean)
    .join("\n\n");

  /** ── STEP 7: Inject AFTER last @import ── */
  // Join imports compactly (single newline between them)
  const compactImports = importLines.join("\n");

  let finalCss = [
    compactImports, // all imports as a single block
    "", // one blank line after imports
    clyroBlock,
    "",
    workingContent, // leftover user CSS
  ]
    .filter(Boolean)
    .join("\n\n"); // only separate major sections with \n\n

  await fs.writeFile(cssFilePath, finalCss.trim() + "\n", "utf-8");

  logger.info(`✔ Smart merged clyro theme into ${path.basename(cssFilePath)}`);
}
