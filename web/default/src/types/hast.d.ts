declare module 'hast' {
  /** Minimal local shape needed by the Shiki line-number transformer. */
  export interface Element {
    children: Array<unknown>
    [key: string]: unknown
  }
}
