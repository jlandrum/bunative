import { ClangCompilePlugin } from "./src/clang/plugin";
import { KonanCompilePlugin } from "./src/konan/plugin";
import { RustCompilePlugin } from "./src/rust/plugin";

export const clang = ClangCompilePlugin;
export const konan = KonanCompilePlugin;
export const rust = RustCompilePlugin;
