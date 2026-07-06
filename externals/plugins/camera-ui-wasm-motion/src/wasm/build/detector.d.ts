declare namespace __AdaptedExports {
  /** Exported memory */
  export const memory: WebAssembly.Memory;
  // Exported runtime interface
  export function __new(size: number, id: number): number;
  export function __pin(ptr: number): number;
  export function __unpin(ptr: number): void;
  export function __collect(): void;
  export const __rtti_base: number;
  /**
   * assembly/console/log
   * @param s `~lib/string/String`
   */
  export function log(s: string): void;
  /**
   * assembly/index/initialize
   * @param w `i32`
   * @param h `i32`
   */
  export function initialize(w: number, h: number): void;
  /**
   * assembly/index/detectMotion
   * @param inputFrame `~lib/typedarray/Uint8Array`
   * @param threshold `i32`
   * @param radius `i32`
   * @param dilationSize `i32`
   * @param minArea `i32`
   * @returns `~lib/typedarray/Int32Array`
   */
  export function detectMotion(inputFrame: Uint8Array, threshold: number, radius: number, dilationSize: number, minArea: number): Int32Array;
  /**
   * assembly/index/getNumBoxes
   * @returns `i32`
   */
  export function getNumBoxes(): number;
  /** assembly/index/Uint8Array_ID */
  export const Uint8Array_ID: {
    /** @type `u32` */
    get value(): number
  };
}
/** Instantiates the compiled WebAssembly module with the given imports. */
export declare function instantiate(module: WebAssembly.Module, imports: {
  console: unknown,
  env: unknown,
}): Promise<typeof __AdaptedExports>;
