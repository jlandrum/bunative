export { KonanCompilePlugin as konan } from "./src/konan/plugin";
export { ClangCompilePlugin as clang } from "./src/clang/plugin";
export { RustCompilePlugin as rust } from "./src/rust/plugin";

export interface NativeModule {

  /** Overrides the output filename/path. */
  out?: string
}

export interface ClangNativeModule extends NativeModule {

  /** Sets the optimization level */
  optimize?: 0 | 1 | 2 | 3 | 'fast' | 's' | 'z' | 'g';

  /** Specifies which libraries to include */
  libraries?: string[];

  /** Specified which frameworks to include */
  frameworks?: string[];

  /** Generate debug headers */
  debug?: boolean;

  /** Search paths for headers */
  headerSearchPaths?: string[];

  /** Search paths for libraries */
  libSearchPaths?: string[];

  /** Additional source files to include */
  additionalSources?: string[];

  /** Uses the specified header to build the function map, 
 * relative to the source directory */
  useHeader?: string;
}

export interface KonanNativeModule extends NativeModule {

  /** Sets the optimization level */
  optimize?: boolean;

  /** Specifies which libraries to include */
  libraries?: string[];

  /** Generate debug headers */
  debug?: boolean;

  /** Additional source files to include */
  additionalSources?: string[];
}

export interface RustNativeModule extends NativeModule {

  /** Sets the optimization level */
  optimize?: 0 | 1 | 2 | 3 | 's' | 'z';

  /** Generate debug headers */
  debug?: boolean;
}

export interface NativeModuleConfigSet<T extends NativeModule> {
  /**
   * Global build settings will always be included
   * for all targets.
   */
  global?: Omit<T, 'out', 'useHeader'>;

  /**
   * Specifies overrides / target specific properties
   * for a given source file.
   * The source should match the import name, excluding
   * the path.
   */
  [source: string]: T;
}

export interface SourceExport {

  /** The return type of the method, as a TS type. */
  returnType: string;

  /** The name of the method */
  methodName: string;

  /** The arguments for the method */
  methodArgs: [string, string][];
}

