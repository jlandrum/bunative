import { FFIType } from "bun:ffi";
import { mkdirSync } from "node:fs";
import Log from "../log";
import colors from 'colors';
import { relative } from "node:path";
import { checkHash } from "../difftrack";

/**
 * Builds a source file as a library
 * 
 * TODO: Hash the file and track the hash, and skip the build process
 *       if the file has not changed.
 * @param source The path to the source
 * @param options Additional options to control the compile process
 * @returns The filename of the compiled object
 */
export async function compileSource(
  source: string,
  config: ClangNativeModule
  ): Promise<string> {
  const fileName = source.split(/(\\|\/)/).toReversed()[0];
  const outfile = config?.out || `./out/${fileName}.o`;
  const outpath = outfile.split('/').toReversed().slice(1).toReversed().join('/');
  const buildArgs = ['clang', '-shared'];

  // Ensure out directory exist
  Log.debug(`Ensuring ${outpath} exists.`);
  mkdirSync(outpath, { recursive: true });
  
  // Check if file is up to date, build if not.
  const upToDate = await checkHash(source);

  if (upToDate) {
    Log.log(`Skipping ${relative('./',source)} -- up to date.`);
    return outfile;
  }

  Log.debug(`Compiling ${relative('./',source)} into ${outfile}.`);

  // Set o flag
  if (config?.optimize) {
    buildArgs.push(`-o${config.optimize}`);
  }

  // Enable generating debug files
  if (config?.debug) {
    buildArgs.push('-g');
  }

  // Add frameworks, libraries and paths
  config?.frameworks?.forEach?.((framework) => buildArgs.push('-framework', framework));
  config?.headerSearchPaths?.forEach?.((h) => buildArgs.push(`-I${h}`));
  config?.libSearchPaths?.forEach?.((l) => buildArgs.push(`-L${l}`));
  config?.libraries?.forEach?.((l) => buildArgs.push(`-l${l}`));

  // Add source file
  buildArgs.push(source);

  // Add additional sources
  config?.additionalSources?.forEach?.((l) => buildArgs.push(`-l${l}`));

  // Set output file
  buildArgs.push('-o', outfile);

  Log.log(colors.green('Building...'));
  Log.debug('Executing:', buildArgs.join(' '));
  
  // Compiling...
  Bun.spawnSync(buildArgs);
  
  Log.log(`Successfully built ${outfile}`);
  return outfile;
}

/**
 * Given a type from C, return the corresponding FFIType.
 * @param type The C type to convert
 * @returns An FFIType
 */
export function CTypeToFFI(type: string): FFIType 
{
  const CTypeToFFIMap = {
    'char': FFIType.char,
    'unsigned': FFIType.int,
    'unsigned int': FFIType.int,
    'signed': FFIType.int,
    'signed int': FFIType.int,
    'int': FFIType.int,
    'short': FFIType.i16,
    'short int': FFIType.i16,
    'signed short int': FFIType.i16,
    'long': FFIType.i32,
    'long int': FFIType.i32,
    'signed long': FFIType.i32,
    'signed long int': FFIType.i32,
    'long long': FFIType.i64,
    'long long int': FFIType.i64,
    'unsigned long long': FFIType.i64,
    'unsigned long long int': FFIType.i64,
    'signed long long': FFIType.i64,
    'signed long long int': FFIType.i64,
    'float': FFIType.float,
    'long double': FFIType.double,
    'double': FFIType.double,
    'char*': FFIType.cstring,
    'void': FFIType.void,
    'void*': FFIType.ptr,
  } as { [key: string]: FFIType };
  return CTypeToFFIMap?.[type] || FFIType.void;
}

/**
 * Given an FFI type, return the TypeScript type for it.
 * @param type The type to convert
 * @returns A string representation of the FFIType in TypeScript
 */
export function FFITypeToTSType(type: FFIType): string 
{
  switch (type) {
    case FFIType.cstring:
    case FFIType.char: return 'Buffer';
    case FFIType.i16:
    case FFIType.i32:
    case FFIType.i64:
    case FFIType.float:
    case FFIType.double:
    case FFIType.int: return 'number';
    default:
    case FFIType.void: return 'unknown';
  }
}

/** Given a type from C, return the js type */
export function inferJSArgType(fromType: string): string {
  if (/(\*char|char)/.test(fromType)) return 'Buffer';
  if (/(int|long|double|float)/.test(fromType)) return 'number';
  return 'unknown';
}

export function inferJSReturnType(fromType: string): string {
  if (/(\*char|char)/.test(fromType)) return 'string';
  if (/(int|long|double|float)/.test(fromType)) return 'number';
  return 'unknown';
}

export async function inferArgSignature(fromSignature: string): Promise<[string, FFIType] | undefined> {
  const type = fromSignature.split(' ').reverse().slice(1).reverse().join(' ');
  const name = fromSignature.split(' ').reverse()[0];

  if (!name) return undefined;
  return [name, await CTypeToFFI(type)];
}

/**
 * Pulls C methods from a source file and collects available
 * methods from the file.
 * 
 * This method was explicitly developed to work with c
 * source files, and may have issues with cpp or obj-c.
 * @param source The path of the source file to read.
 * @returns 
 */
export async function getMethods(source: string) {
  Log.debug(`Collecting methods from ${relative('./',source)}`);

  const methods: SourceExport[] = [];
  const file = Bun.file(source);

  // TODO: modifiers not being properly picked up
  const cfun = /^([a-zA-Z_][a-zA-Z0-9_*\s]+)\s+([a-zA-Z_][a-zA-Z0-9_*]+)\s*\(((?:[a-zA-Z_][a-zA-Z0-9_*\s]*\s*[a-zA-Z_][a-zA-Z0-9_*]*\s*(?:,\s*)?)*)\)/gm

  if (!await file.exists()) {
    throw new Error(`Could not find file with name ${source}`);
  }

  const sourceText = await file.text();

  let match;
  while ((match = cfun.exec(sourceText)) !== null) {
    const returnType = match[1].trim();
    const methodName = match[2].trim();
    const methodArgs = match[3].split(',')
                               .filter(a => a)
                               .map(arg => {
                                 const keys = arg.trim().split(' ');
                                 return [
                                   keys.toReversed()[0].trim(),
                                   keys.toReversed().slice(1).toReversed().join(' ').trim()
                                 ] as [string, string];
                               });

    methods.push({
      returnType,
      methodName,
      methodArgs: methodArgs
    });
  }

  return methods;
}

/**
 * Generates the types.d.ts file for this module.
 * @param methods The methods as provided by getMethods
 * @returns A string for use with types.d.ts
 */
export async function generateTypes(methods: SourceExport[]) {
  return methods.map((method) => {
    const args = method.methodArgs.map((t) => `${t[0]}: ${inferJSArgType(t[1])}`).join(', ');
    return (` export function ${method.methodName}(${args}): ${inferJSReturnType(method.returnType)};`)
  }).join('\n');
}