/**
 * TypeScript declarations for @mblaney/holster.
 *
 * Holster doesn't publish type definitions, so we declare only its default
 * export, loosely. The real API types are defined in src/types/holster.ts;
 * holsterService casts the constructor result to HolsterInstance.
 *
 * NOTE: this file must stay a script-scope .d.ts (no top-level imports or
 * exports). An ambient `declare module` for an untyped package is only
 * valid outside module scope — importing types here would turn it into an
 * invalid module augmentation.
 */

declare module '@mblaney/holster/src/holster.js' {
  const holster: (options?: Record<string, unknown>) => unknown;
  export default holster;
}
