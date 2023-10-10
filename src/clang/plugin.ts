import { BunPlugin, plugin } from "bun";
import { FFIFunction, FFIType, Narrow, dlopen } from "bun:ffi";
import { CTypeToFFI, compileSource, generateTypes, getMethods } from "./compiler";
import Log from '../log';
import { relative, dirname } from "path";
import colors from 'colors';
import { NativeModuleConfigSet, ClangNativeModule } from "bunative";

export interface ClangCompileConfig {

  /** Specifies verbosity */
  verbosity?: Verbosity;

  /** The config set to load. */
  buildConfig?: NativeModuleConfigSet<ClangNativeModule>;
}

export const ClangCompilePlugin = ({
  buildConfig = {},
  verbosity = undefined
}: ClangCompileConfig) => ({
  name: "c/obj-c loader",
  setup(build) {
    Log.verbosity = verbosity;

    build.onLoad({ filter: /\.(c|cpp|cxx|cc|C|m|mm)/ }, async ({ path }) => {      
      const symbolMap: Record<string, Narrow<FFIFunction>> = {};
      const moduleName = path.split('/').reverse()[0];

      Log.log(colors.green(`Loading module ${relative('./', path)}`));

      const activeConfig = {
        ...(buildConfig?.global || {}),
        ...(buildConfig?.[moduleName] || {})
      } as ClangNativeModule;

      Log.debug(`Using build config:`);
      Log.debug(JSON.stringify(activeConfig, null, 2));

      // Collects methods
      const methods = await getMethods(
        activeConfig.useHeader 
          ? `${dirname(path)}/${activeConfig.useHeader}` 
          : path
      );
      
      // Compiles the input      
      const object = await compileSource(path, activeConfig);
      
      // Maps the methods 
      methods.forEach((m) => {
        const args = m.methodArgs.map(a => CTypeToFFI(a[1]));
        const returns = CTypeToFFI(m.returnType);

        symbolMap[m.methodName] = {
          args,
          returns,
        }
      });

      // Get the native symbols
      const {
        symbols
      } = dlopen(object, symbolMap);

      // Generate types
      const typedef = await generateTypes(methods);
      const importTypes = 
        `declare module "*/${moduleName}" {\n` +
          typedef + '\n' +
        '}\n\n';
      Bun.write(`./${dirname(object)}/${moduleName.replaceAll('.','_')}.d.ts`, importTypes);

      return {
        exports: symbols,
        loader: "object"
      }
    })

  }
}) as BunPlugin;

