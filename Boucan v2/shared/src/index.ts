/**
 * @boucan/shared — the frontend ↔ backend contract of BOUCAN.
 *
 * Single source of truth: the Zod schemas in ./contracts. TypeScript types
 * are inferred from them; JSON Schemas in ../schemas are generated from them
 * (`npm run contract:generate`). Never hand-edit generated files.
 */
export * from './contracts/version';
export * from './contracts/rules';
export * from './contracts/primitives';
export * from './contracts/errors';
export * from './contracts/phases';
export * from './contracts/model';
export * from './contracts/messages';
export * from './rules/rng';
export * from './rules/nickname';
export { containsBannedTerm } from './rules/moderation';
