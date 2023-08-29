import {API, Collection, FileInfo, Options} from 'jscodeshift';
import path from 'path';
import fs from 'fs';

export type TransformFrom = 'none' | 'any' | string;
export type TransformTo = 'none' | 'any' | string;
export type ImportTypes = 'any' | 'relative' | 'alias';

const base = process.cwd();
export default function transformer(
  file: FileInfo,
  { jscodeshift: j }: API,
  options: Options,
) {

  const tf = options.transformFrom as string | undefined;
  if(tf === undefined) {
    throw new Error(`arg '--transformFrom' must be defined.`);
  }
  const transformFrom = tf.split(',').map(x => x.toLocaleLowerCase()) as TransformFrom[];
  const tfIsAny = transformFrom.includes('any');

  const tt = options.transformTo as string | undefined;
  if(tt === undefined) {
    throw new Error(`arg '--transformTo' must be defined.`);
  }
  const transformTo = tt.split(',').map(x => x.toLocaleLowerCase()) as TransformTo[];

  if(transformTo.length > 1 && transformFrom.length !== transformTo.length) {
    throw new Error('When more than one Transform To is specified then number of Transform From arguments must match');
  }

  const itypes = options.importTypes as string | undefined;
  if(itypes === undefined) {
    throw new Error(`arg '--importTypes' must be defined.`);
  }
  const importTypes = itypes.split(',').map(x => x.toLocaleLowerCase()) as ImportTypes[];
  const importsIsAny = importTypes.includes('any');

  const fileDir = path.dirname(path.join(base, file.path));
  const processingFilePath = file.path;
  console.log(`Processing => ${processingFilePath}`);
  let source: Collection<any>;
  try {
    source = j(file.source);
  } catch (e) {
    console.error(`Failed to parse ${processingFilePath}, will skip`);
    console.error(e);
  }

  const imports = source.find(j.ImportDeclaration)
  imports.forEach((x) => {
    const importPath = x.value.source.value as string;
    const importPathPrefix = `${importPath.padEnd(60, ' ')} =>`;
    
    const pathInfo = path.parse(importPath);
    const hasNoExt = pathInfo.ext === '';
    let filenameFromDir: string;
    if(tfIsAny || (hasNoExt && transformFrom.includes('none')) || (transformFrom.includes(pathInfo.ext.replace('.', '').toLocaleLowerCase()))) {
      const pathFull = path.join(fileDir, importPath);
      const dir = path.dirname(pathFull);
      const normalExt = pathInfo.ext.replace('.', '');
      let isRelative: boolean | undefined;
      let dirExists: boolean | undefined;
      let fileExists: boolean | undefined;
      try {
        // is dir path real?
        fs.realpathSync(dir);
        dirExists = true;
      } catch (e) {
        isRelative = false;
        dirExists = false;
      }

      if(isRelative === undefined) {
          // if extension is none we need to check for any file in dir with this name
          if(hasNoExt) {
            const dirFiles = fs.readdirSync(dir)
            filenameFromDir = dirFiles.find(x => path.parse(x).name === pathInfo.name);
            if(filenameFromDir !== undefined) {
              fileExists = false;
              isRelative = false;
            } else {
              fileExists = true;
              isRelative = true;
            }
          } else {
            try {
              // does a file exist?
              fs.realpathSync(pathFull);
              isRelative = true;
            } catch (e) {
              isRelative = false;
              fileExists = false;
            }
          }
      }

      if(!importsIsAny) {
        if(!isRelative && !importTypes.includes('alias')) {
          console.log(`${importPathPrefix} Import looks like an alias ${dirExists ? '(dir exists, file does not)' : '(dir does not exist)'} but import types does specify alias`);
          return;
        } else if(isRelative && !importTypes.includes('relative')) {
          console.log(`${pathFull} => Import is relative but import types does not specify relative`);
          return;
        }
      }

      // determine transformTo

      // if there is only one TO then use it
      let derivedTT: undefined | string = transformTo.length === 1 ? transformTo[0] : undefined;
      if(derivedTT === undefined) {
        // otherwise we find the TO by using the same index as the matching FROM extension type
        const tfIndex = transformFrom.findIndex((x) => {
          if(x === 'any') {
            return true;
          }
          if(x === 'none' && hasNoExt) {
            return true;
          }
          if(x === normalExt) {
            return true;
          }
        });
        if(tfIndex === -1) {
          console.warn(`${importPathPrefix} did not match a Transform From type. Will not transform`);
          return;
        }
        derivedTT = transformTo[tfIndex];
      }

      let transformPrefix = ` --> ${hasNoExt ? '(None)' : normalExt} TO ${derivedTT} <--`;

      let transformedImport: string;

      switch(derivedTT) {
        case 'none':
          if(hasNoExt) {
            console.log(`${importPathPrefix} ${transformPrefix} => Import already has no extension, nothing to do`);
            return;
          }
          transformedImport = combineDirFile(pathInfo.dir, pathInfo.name); // path.join(pathInfo.root, pathInfo.dir, pathInfo.name);
          break;
        case 'any':
          if(hasNoExt && filenameFromDir) {
            transformedImport = filenameFromDir;
          } else {
            const otherFilename = fs.readdirSync(dir).find(x => {
              const pinfo = path.parse(x);
              return pinfo.name === pathInfo.name && pinfo.ext !== pathInfo.ext;
            });
            if(otherFilename === undefined) {
              console.warn(`${importPathPrefix} ${transformPrefix} => Could not find another file in directory that had same name but different extension. Will not transform.`);
              return;
            }
            transformedImport = combineDirFile(pathInfo.dir, otherFilename); // path.join(pathInfo.root, dir, otherFilename);
            transformPrefix = `${transformPrefix} (${path.parse(otherFilename).ext})`
          }
          break;
        default:
          transformedImport = combineDirFile(pathInfo.dir, `.${derivedTT}`); // path.join(pathInfo.root, dir, pathInfo.name, `.${derivedTT}`);
          break;
      }

      console.log(`${importPathPrefix} ${transformPrefix} => Replacing with ${transformedImport}`);
      j(x).replaceWith(
          j.importDeclaration(
              x.node.specifiers,
              j.stringLiteral(transformedImport)
          )
      );

    } else {
      console.log(`${importPathPrefix} Import did not match transformFrom ('${tf}')`);
      return;
    }
  });

  /**
   * Early exit condition
   * -----
   * It is often good practice to exit early and return the original source file
   * if it does not contain code relevant to the codemod.
   * See this page for more information:
   * https://codeshiftcommunity.github.io/CodeshiftCommunity/docs/your-first-codemod#output
   */
  // if (/* Some condition here */ true) {
  //   return file.source;
  // }

  /**
   * Codemod logic goes here 👇
   * -----
   * This is where the core logic for your codemod will go,
   * consider grouping specific actions into 'motions' and running them in sequence
   *
   * See this page for more information:
   * https://codeshiftcommunity.github.io/CodeshiftCommunity/docs/authoring#motions
   */
  //source.findVariableDeclarators('foo').renameTo('bar');

  /**
   * Return your modified AST here 👇
   * -----
   * This is where your modified AST will be transformed back into a string
   * and written back to the file.
   */
  return source.toSource(options.printOptions);
}

const combineDirFile = (dir: string, file: string) => {
  if(dir === '') {
    return file;
  }
  return `${dir}${path.sep}${file}`;
}
