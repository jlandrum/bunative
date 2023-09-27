# bunative

A basic Bun plugin for running native code!

Currently supports any clang-compileable language, as
long as it exports c-compatible functions.

## Quickstart Example

* Add `preload = ["./init.ts"]` to your bunfig.toml.
* Add the following to init.ts:
    ```
    import { plugin } from "bun";
    import { clang } from "bunative";
    import clangConfig from './src/c/build';

    plugin(
      clang({
        verbosity: 'vvvv',
        buildConfig: clangConfig,
      })
    );
    ```
* Create the dir `./src/c`
* Create a `build.ts` in `./src/c`
* Add the following to `build.ts`:
    ```
    export default {
      "test.c": {
        out: "./out/test.o",
      },
    } as NativeModuleConfigSet;

    ```
* Create `test.c` inside `./src/c`
* Add methods to `test.c`

Then to use, simply import the test.c file; The first time
you run your code, it will compile and generate type definitions
for your source file.

