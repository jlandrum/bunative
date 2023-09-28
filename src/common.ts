import { FFIType } from "bun:ffi";
import Log from "./log";

/**
 * Given an FFI type, return the TypeScript type for it.
 * @param type The type to convert
 * @returns A string representation of the FFIType in TypeScript
 */
export function FFITypeToTSType(type: FFIType): string {
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
