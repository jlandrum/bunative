import { RustNativeModule, SourceExport } from "../../types";

import { FFIType } from "bun:ffi";
import { mkdirSync } from "node:fs";
import { relative } from "node:path";
import { checkHash } from "../difftrack";

import Log from "../log";
import colors from 'colors';

/**
 * Builds a Rust source file as a library
 * 
 * @param source The path to the source
 * @param options Additional options to control the compile process
 * @returns The filename of the compiled object
 */
export async function compileSource(
  source: string,
  config: RustNativeModule
): Promise<string> {
  const fileName = source.split(/(\\|\/)/).toReversed()[0];
  const outfile = config?.out || `./out/${fileName}.o`;
  const outpath = outfile.split('/').toReversed().slice(1).toReversed().join('/');
  const buildArgs = ['rustc', '--crate-type', 'cdylib'];

  // Ensure out directory exist
  Log.debug(`Ensuring ${outpath} exists.`);
  mkdirSync(outpath, { recursive: true });

  // Check if file is up to date, build if not.
  const upToDate = false; // await checkHash(source);

  if (upToDate) {
    Log.log(`Skipping ${relative('./', source)} -- up to date.`);
    return outfile;
  }

  Log.debug(`Compiling ${relative('./', source)} into ${outfile}.`);

  // Set o flag
  if (config?.optimize) {
    buildArgs.push(`-C`, `opt-level=${config.optimize}`);
  }

  // Enable generating debug files
  if (config?.debug) {
    buildArgs.push('-g');
  }

  // Add source file
  buildArgs.push(source);

  // Set output file
  buildArgs.push('-o', outfile);

  Log.log(colors.green('Building...'));
  Log.debug('Executing:', buildArgs.join(' '));

  // Compiling...
  await Bun.spawn(buildArgs).exited;

  // Write hash
  await checkHash(source, true);

  Log.log(`Successfully built ${outfile}`);
  return outfile;
}

export async function inferArgSignature(fromSignature: string): Promise<[string, FFIType] | undefined> {
  const type = fromSignature.split(' ').reverse().slice(1).reverse().join(' ');
  const name = fromSignature.split(' ').reverse()[0];

  if (!name) return undefined;
  return [name, RTypeToFFI(type)];
}

/**
 * Pulls Rust methods from a source file and collects available
 * methods from the file.
 * 
 * Currently, it expects the definition be on one line and
 * marked extern "C".
 * @param source The path of the source file to read.
 * @returns 
 */
export async function getMethods(source: string): Promise<SourceExport[]> {
  Log.debug(`Collecting methods from ${relative('./', source)}`);

  const methods: SourceExport[] = [];
  const file = Bun.file(source);

  const regex = /extern\s+"C".*?fn\s*(\w+)\s*\s*\((.*?)\)\s*->\s*(\w+)/gs;

  if (!await file.exists()) {
    throw new Error(`Could not find file with name ${source}`);
  }

  const sourceText = await file.text();

  for (const match of [...sourceText.matchAll(regex)]) {    
    const [, methodName, methodArgs, returnType] = match;

    const args = methodArgs.trim().split(',')
      .filter(a => a)
      .map(arg => {
        const keys = arg.trim().split(':');
        return [
          keys.toReversed().slice(1).toReversed().join(' ').trim(),
          keys.toReversed()[0].trim(),
        ] as [string, string];
      });

    methods.push({
      returnType,
      methodName,
      methodArgs: args
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

/**
 * Given a type from rust, return the corresponding FFIType.
 * @param type The rust type to convert
 * @returns An FFIType
 */
export function RTypeToFFI(type: string): FFIType {
  const RTypeToFFIMap = {
    'i8': FFIType.i8,
    'u8': FFIType.u8,
    'i16': FFIType.i16,
    'u16': FFIType.u16,
    'i32': FFIType.i32,
    'u32': FFIType.u32,
    'i64': FFIType.i64,
    'u64': FFIType.u64,
    'f32': FFIType.f32,
    'f64': FFIType.f64,
    'usize': FFIType.u64,
    'float': FFIType.float,
    'double': FFIType.double,
    'CStr': FFIType.cstring
  } as { [key: string]: FFIType };
  return RTypeToFFIMap?.[type] || FFIType.void;
}

/** Given a type from rust, return the js type */
export function inferJSArgType(fromType: string): string {
  Log.debug(`Inferring JS Arg type from ${fromType}`);
  if (/(CStr)/.test(fromType)) return 'Buffer';
  if (/([iu](8|16|32|64))|(float)|(double)|(usize)/.test(fromType)) return 'number';
  return 'unknown';
}

export function inferJSReturnType(fromType: string): string {
  if (/(CStr)/.test(fromType)) return 'string';
  if (/([iu](8|16|32|64))|(float)|(double)|(usize)/.test(fromType)) return 'number';
  return 'unknown';
}