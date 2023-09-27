interface NativeModule {

  /** Sets the optimization level */
  optimize?: 0|1|2|3|'f'|'s',
  
  /** Specifies which libraries to include */
  libraries?: string[],
  
  /** Specified which frameworks to include */
  frameworks?: string[],
  
  /** Generate debug headers */
  debug?: boolean,
  
  /** Search paths for headers */
  headerSearchPaths?: string[],
  
  /** Search paths for libraries */
  libSearchPaths?: string[],
  
  /** Additional source files to include */
  additionalSources?: string[],
  
  /** Overrides the output filename/path. */
  out?: string

  /** Uses the specified header to build the function map, 
   * relative to the source directory */
  useHeader?: string;
}

interface NativeModuleConfigSet {
  /**
   * Global build settings will always be included
   * for all targets.
   */
  global?: Omit<NativeModule, 'out'>;

  /**
   * Specifies overrides / target specific properties
   * for a given source file.
   * The source should match the import name, excluding
   * the path.
   */
  [source: string]: NativeModule;
}

type Verbosity = undefined | 'v' | 'vv' | 'vvv' | 'vvvv';