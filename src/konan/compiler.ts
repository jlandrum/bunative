import { KonanNativeModule, SourceExport } from "bunative";

import { checkHash } from "../difftrack";
import { mkdirSync } from "node:fs";
import { relative } from "node:path";
import { FFIType } from "bun:ffi";

import colors from 'colors';
import Log from "../log";

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
  config: KonanNativeModule
): Promise<string> {
  const fileName = source.split(/(\\|\/)/).toReversed()[0];
  // TODO: Address konan's forced output names
  const outfile = /* config?.out || */`./out/lib${fileName}.a`;
  const outpath = outfile.split('/').toReversed().slice(1).toReversed().join('/');
  const buildArgs = ['konanc', '-nomain', '-produce', 'static'];

  // Ensure out directory exist
  Log.debug(`Ensuring ${outpath} exists.`);
  mkdirSync(outpath, { recursive: true });

  // Check if file is up to date, build if not.
  const upToDate = await checkHash(source);

  if (upToDate) {
    Log.log(`Skipping ${relative('./', source)} -- up to date.`);
    return `${outfile}.o`;
  }

  // Fetch methods
  const methods = await getMethods(source);

  Log.debug(`Compiling ${relative('./', source)} into ${outfile}.`);

  // Set o flag
  if (config?.optimize) {
    buildArgs.push(`-opt`);
  }

  // Enable generating debug files
  if (config?.debug) {
    buildArgs.push('-g');
  }

  // Add frameworks, libraries and paths
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
  await Bun.spawn(buildArgs).exited;

  // Generate C wrapper intermediate
  Log.log(colors.green('Creating C wrapper intermediate...'));
  const wrapper = `
#include "${outfile.replace('.a','_api.h')}"
extern "C" {
` 
    + methods.map((m) => `${KTypeToC(m.returnType)} ${m.methodName}(${m.methodArgs.map((arg) => `${KTypeToC(arg[1])} ${arg[0]}`).join(',')}) { return lib${fileName.split('.')[0]}_kt_symbols()->kotlin.root.${m.methodName}(${m.methodArgs.map((arg) => `${arg[0]}`).join(',')}); }`).join('\n') 
+ `
}`.trim();
  Log.debug('Generated wrapper:', wrapper);
  const wrapperArgs = ['clang++', '-c', '-x', 'c++', '-o', `${outfile}.intermediate.o`, '-'];
  Log.debug('Executing:', wrapperArgs.join(' '));
  const buildWrapper = Bun.spawn(wrapperArgs, {stdin: 'pipe'});
  buildWrapper.stdin.write(wrapper);
  buildWrapper.stdin.end();
  await buildWrapper.exited;

  Log.log(colors.green('Creating C wrapper...'));
  // TODO: Currently, macos only
  const finalWrapperArgs = ['clang++', '-shared', `${outfile}.intermediate.o`, `${outfile}`, '-o', `${outfile}.o`, '-framework', 'Cocoa', '-framework', 'CoreFoundation'];
  Log.debug('Executing:', finalWrapperArgs.join(' '));
  await Bun.spawn(finalWrapperArgs).exited;

  // Write hash
  await checkHash(source, true);

  Log.log(`Successfully built ${outfile} with C wrapper ${outfile}.o`);
  return `${outfile}.o`;
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

/**
 * TODO: This needs a LOT of work...
 * @param path 
 * @returns 
 */
export async function getMethods(source: string): Promise<SourceExport[]>  {
  Log.debug(`Collecting methods from ${relative('./', source)}`);

  const methods: SourceExport[] = [];
  const file = Bun.file(source);
  const kfun = /fun\s+(\w+)\s*\((.*?)\)\s*:?\s*([\w\.<>,? ]+)?/gm;

  if (!await file.exists()) {
    throw new Error(`Could not find file with name ${source}`);
  }

  const sourceText = await file.text();

  let match;
  while ((match = kfun.exec(sourceText)) !== null) {
    if (!match[3]) {
      throw Error('To use Konan, all methods must have a return type.');
    }
    const returnType = match[3]?.trim();
    const methodName = match[1].trim();
    const methodArgs = match[2].split(',')
      .filter(a => a)
      .map(arg => {
        return arg.trim().split(':').map(a=>a.trim()) as [string, string];
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
 * Given a type from Kotlin, return the corresponding FFIType.
 * @param type The C type to convert
 * @returns An FFIType
 */
export function KTypeToFFI(type: string): FFIType {
  const CTypeToFFIMap = {
    'String': FFIType.cstring,
    'Number': FFIType.int,
    'Int': FFIType.int,
    'Byte': FFIType.char,
    'Short': FFIType.i16,
    'Long': FFIType.i64,
    'Char': FFIType.char,
    'Boolean': FFIType.bool,
    'Float': FFIType.float,
    'Double': FFIType.double,
    'CFunction': FFIType.function,
  } as { [key: string]: FFIType };
  Log.debug('Mapping', type, 'to', CTypeToFFIMap?.[type]);
  return CTypeToFFIMap?.[type] || FFIType.void;
}

/**
 * Given a type from Kotlin, return the corresponding C Type.
 * @param type The C type to convert
 * @returns An FFIType
 */
export function KTypeToC(type: string): string {
  const CTypeToFFIMap = {
    'String': 'const char*',
    'Number': 'int',
    'Int': 'int',
    'Byte': 'char',
    'Short': 'short',
    'Long': 'long',
    'Char': 'char',
    'Boolean': 'bool',
    'Float': 'float',
    'Double': 'double',
    'CFunction': 'void*',
  } as { [key: string]: string };
  Log.debug('Mapping', type, 'to', CTypeToFFIMap?.[type]);
  return CTypeToFFIMap?.[type] || 'void';
}

export function inferJSArgType(fromType: string): string {
  Log.debug(`Inferring JS Arg type from ${fromType}`);
  if (/(String)/.test(fromType)) return 'Buffer';
  if (/(Int|Long|Float)/.test(fromType)) return 'number';
  return 'unknown';
}

export function inferJSReturnType(fromType: string): string {
  if (/(String)/.test(fromType)) return 'string';
  if (/(Int|Long|Float)/.test(fromType)) return 'number';
  return 'unknown';
}