const fs = require('fs');
const path = require('path');

/**
 * Copy non-TypeScript assets to the dist folder
 * This includes JSON files (ABIs), Prisma schema, etc.
 */

const srcDir = path.join(__dirname, '../src');
const distDir = path.join(__dirname, '../dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

/**
 * Recursively copy directory structure
 */
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Skip generated Prisma folder (it's already generated)
      if (entry.name === 'generated') {
        continue;
      }
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      // Copy JSON files (ABIs, configs, etc.)
      if (entry.name.endsWith('.json')) {
        fs.copyFileSync(srcPath, destPath);
        console.log(
          `Copied: ${path.relative(srcDir, srcPath)} -> ${path.relative(
            distDir,
            destPath,
          )}`,
        );
      }
    }
  }
}

try {
  console.log('Copying assets to dist folder...');
  copyDir(srcDir, distDir);
  console.log('✅ Assets copied successfully');
} catch (error) {
  console.error('❌ Error copying assets:', error);
  process.exit(1);
}
