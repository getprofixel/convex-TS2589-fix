#!/usr/bin/env node
/**
 * Automated fix for TS2589 "Type instantiation is excessively deep" errors
 *
 * This script replaces ES imports of `internal` and `api` from _generated/api
 * with require() pattern to bypass TypeScript's type inference limitations.
 *
 * Usage: node scripts/fix-ts2589.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const convexDir = join(__dirname, '../convex');

// Recursively find all TypeScript files
function findTsFiles(dir, fileList = []) {
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      if (file !== '_generated' && file !== 'node_modules') {
        findTsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts')) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

const files = findTsFiles(convexDir);

let fixedCount = 0;
let skippedCount = 0;

console.log(`Found ${files.length} TypeScript files to check\n`);

for (const filePath of files) {
  const content = readFileSync(filePath, 'utf-8');

  // Skip if already has the fix
  if (content.includes('Bypass TS2589')) {
    skippedCount++;
    continue;
  }

  // Check if file imports internal or api from _generated/api (with or without .js extension)
  const hasInternalImport =
    /^import\s+.*\{\s*internal\s*[,}].*from\s+['"]\.\.?\/?.*\/_generated\/api(\.js)?['"]/m.test(
      content
    );
  const hasApiImport =
    /^import\s+.*\{\s*api\s*[,}].*from\s+['"]\.\.?\/?.*\/_generated\/api(\.js)?['"]/m.test(
      content
    );

  if (!hasInternalImport && !hasApiImport) {
    skippedCount++;
    continue;
  }

  // Calculate relative path to _generated/api.js (force forward slashes for cross-platform)
  const relPath = relative(
    dirname(filePath),
    join(convexDir, '_generated/api.js')
  ).replace(/\\/g, '/');
  const importPath = relPath.startsWith('.') ? relPath : `./${relPath}`;

  let newContent = content;
  let modified = false;

  // Check for combined import: import { internal, api } or import { api, internal }
  const hasCombinedImport = hasInternalImport && hasApiImport;

  if (hasCombinedImport) {
    // Handle combined imports - replace with both require() statements
    const combinedImportRegex =
      /^import\s+\{[^}]*(?:internal|api)[^}]*\}\s+from\s+['"]\.\.?\/?.*\/_generated\/api(\.js)?['"];?\s*$/gm;

    if (combinedImportRegex.test(content)) {
      newContent = newContent.replace(
        combinedImportRegex,
        `// Bypass TS2589 by using require() which doesn't trigger type inference
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const internal = require('${importPath}').internal as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const api = require('${importPath}').api as any;`
      );
      modified = true;
    }
  } else if (hasInternalImport) {
    // Pattern 1: import { internal } from ".../_generated/api" or ".../_generated/api.js"
    const internalImportRegex =
      /^import\s+\{[^}]*internal[^}]*\}\s+from\s+['"]\.\.?\/?.*\/_generated\/api(\.js)?['"];?\s*$/gm;

    if (internalImportRegex.test(content)) {
      newContent = newContent.replace(
        internalImportRegex,
        `// Bypass TS2589 by using require() which doesn't trigger type inference
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const internal = require('${importPath}').internal as any;`
      );
      modified = true;
    }
  } else if (hasApiImport) {
    // Pattern 2: import { api } from ".../_generated/api" or ".../_generated/api.js"
    const apiImportRegex =
      /^import\s+\{[^}]*api[^}]*\}\s+from\s+['"]\.\.?\/?.*\/_generated\/api(\.js)?['"];?\s*$/gm;

    if (apiImportRegex.test(content)) {
      newContent = newContent.replace(
        apiImportRegex,
        `// Bypass TS2589 by using require() which doesn't trigger type inference
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const api = require('${importPath}').api as any;`
      );
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(filePath, newContent, 'utf-8');
    const relativeFilePath = relative(convexDir, filePath);
    console.log(`✅ Fixed: ${relativeFilePath}`);
    fixedCount++;
  } else {
    skippedCount++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Fixed: ${fixedCount} files`);
console.log(`   Skipped: ${skippedCount} files (no imports or already fixed)`);
console.log(`\n✨ Done! Run 'turbo dev' to verify the fixes.`);
