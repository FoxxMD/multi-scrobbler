import { copy } from 'fs-extra';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Obtain current file path and directory using ES module APIs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the target directory containing source files to process
const targetDir = path.resolve(__dirname, 'src');

/**
 * Recursively traverse the specified directory and process each TypeScript/TSX file.
 * Only files with a '.ts' or '.tsx' extension are processed.
 *
 * @param dir - Directory to traverse.
 */
async function processDirectory(dir: string): Promise<void> {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      // Recursively process subdirectories
      await processDirectory(fullPath);
    } else if (
      stat.isFile() &&
      (file.endsWith('.ts') || file.endsWith('.tsx'))
    ) {
      // Process individual TypeScript/TSX files
      await updateImportStatements(fullPath);
    }
  }
}

/**
 * Updates import/export statements in the given file.
 * This function only replaces the '.js' extension in module specifiers with the appropriate '.ts' or '.tsx'
 * extension without modifying any other parts of the file (e.g. empty lines or numeric literals).
 *
 * @param filePath - The file to process.
 */
async function updateImportStatements(filePath: string): Promise<void> {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      fileContent,
      ts.ScriptTarget.Latest,
      true,
    );

    // Collect replacements as: { start: number, end: number, newText: string }
    // The replacement is applied only to the inner text of the module specifier literal.
    const replacements: { start: number; end: number; newText: string }[] = [];

    /**
     * Recursively visit AST nodes to find import/export declarations with module specifiers.
     * When a module specifier ends with '.js', determine the correct extension and record the text replacement.
     *
     * @param node - The current AST node.
     */
    function visit(node: ts.Node) {
      if (
        (ts.isImportDeclaration(node) ||
          (ts.isExportDeclaration(node) && node.moduleSpecifier)) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const moduleSpecifier = node.moduleSpecifier;
        const moduleText = moduleSpecifier.text;
        if (moduleText.endsWith('.js')) {
          const newModuleText = getNewExtension(moduleText, filePath);
          // Calculate positions: skip the surrounding quotes to preserve original quote style
          const start = moduleSpecifier.getStart(sourceFile) + 1;
          const end = moduleSpecifier.getEnd() - 1;
          replacements.push({ start, end, newText: newModuleText });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);

    // If no replacements needed, exit early
    if (replacements.length === 0) {
      return;
    }

    // Apply replacements in reverse order to avoid affecting subsequent indices
    let newFileContent = fileContent;
    replacements
      .sort((a, b) => b.start - a.start)
      .forEach((rep) => {
        newFileContent =
          newFileContent.slice(0, rep.start) +
          rep.newText +
          newFileContent.slice(rep.end);
      });

    // Write back the modified content without altering any other parts of the file
    fs.writeFileSync(filePath, newFileContent, 'utf8');
    console.log(`Updated imports/exports in: ${filePath}`);
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

/**
 * Determines the new file extension for a module specifier ending with '.js' by checking the existence
 * of a corresponding '.ts' or '.tsx' file relative to the current file.
 *
 * @param importPath - The original module specifier (ending with '.js').
 * @param filePath - The file path of the current source file.
 * @returns The updated module specifier with the appropriate extension.
 */
function getNewExtension(importPath: string, filePath: string): string {
  const fileDir = path.dirname(filePath);
  const basePath = importPath.replace(/\.js$/, '');
  const tsFilePath = path.resolve(fileDir, basePath + '.ts');
  const tsxFilePath = path.resolve(fileDir, basePath + '.tsx');

  let newExtension = '.ts';
  if (fs.existsSync(tsxFilePath)) {
    newExtension = '.tsx';
  } else if (fs.existsSync(tsFilePath)) {
    newExtension = '.ts';
  }
  return importPath.replace(/\.js$/, newExtension);
}

// Create a backup of the source directory before making any modifications
//await copy(targetDir, path.resolve(__dirname, 'src-backup'));

try {
  // Begin processing the directory to update import/export module specifiers
  await processDirectory(targetDir);
  console.log('All files processed.');
} catch (error) {
  console.error('Error processing files:', error);
}
