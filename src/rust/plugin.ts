import { NativeModuleConfigSet, RustNativeModule, NativeModule } from "../../types";

import { BunPlugin } from "bun";
import { FFIFunction, Narrow, dlopen } from "bun:ffi";
import { RTypeToFFI, compileSource, generateTypes, getMethods } from "./compiler";
import { relative, dirname } from "path";

import Log, { Verbosity } from '../log';
import colors from 'colors';

export interface RustCompileConfig {

  /** Specifies verbosity */
  verbosity?: Verbosity;

  /** The config set to load. */
  buildConfig?: NativeModuleConfigSet<RustNativeModule>;
}

/**
 * Compiles Kotlin Native code to a native binary that
 * can be loaded using bunative.
 * @param param0 The configuration for the plugin
 * @returns A plugin that can be loaded with Bun.plugin
 */
export const RustCompilePlugin = ({
  buildConfig = {},
  verbosity = undefined
}: RustCompileConfig) => ({
  name: "rust loader",
  setup(build) {
    Log.verbosity = verbosity;

    build.onLoad({ filter: /\.(rs)/ }, async ({ path }) => {
      const symbolMap: Record<string, Narrow<FFIFunction>> = {};
      const moduleName = path.split('/').reverse()[0];

      Log.log(colors.green(`Loading module ${relative('./', path)}`));

      const activeConfig = {
        ...(buildConfig?.global || {}),
        ...(buildConfig?.[moduleName] || {})
      } as NativeModule;

      Log.debug(`Using build config:`);
      Log.debug(JSON.stringify(activeConfig, null, 2));

      // Collects methods
      const methods = await getMethods(path);

      // Compiles the input      
      const object = await compileSource(path, activeConfig);

      // Maps the methods 
      methods.forEach((m) => {
        const args = m.methodArgs.map(a => RTypeToFFI(a[1]));
        const returns = RTypeToFFI(m.returnType);

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
      Bun.write(`./${dirname(object)}/${moduleName.replaceAll('.', '_')}.d.ts`, importTypes);

      return {
        exports: symbols,
        loader: "object"
      }
    })

  }
}) as BunPlugin;

