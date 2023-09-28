import { BunPlugin, plugin } from "bun";
import { FFIFunction, FFIType, Narrow, dlopen } from "bun:ffi";
import { KTypeToFFI, compileSource, generateTypes, getMethods } from "./compiler";
import Log from '../log';
import { relative, dirname } from "path";
import colors from 'colors';

export interface KonanCompileConfig {

  /** Specifies verbosity */
  verbosity?: Verbosity;

  /** The config set to load. */
  buildConfig?: NativeModuleConfigSet<KonanNativeModule>;
}

export const KonanCompilePlugin = ({
  buildConfig = {},
  verbosity = undefined
}: KonanCompileConfig) => ({
  name: "kotlin loader",
  setup(build) {
    Log.verbosity = verbosity;

    build.onLoad({ filter: /\.(kt)/ }, async ({ path }) => {      
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
        const args = m.methodArgs.map(a => KTypeToFFI(a[1]));
        const returns = KTypeToFFI(m.returnType);

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

