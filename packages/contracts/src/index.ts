/**
 * @authvital/contracts
 *
 * Single source of truth for API contracts across the AuthVital monorepo.
 *
 * This package provides:
 * - Zod schemas for request/response validation
 * - ts-rest contracts for type-safe API communication
 * - Inferred TypeScript types from all schemas
 *
 * @example
 * ```ts
 * // Import schemas for validation
 * import { LoginRequestSchema, UserSchema } from '@authvital/contracts/schemas';
 *
 * // Import contracts for type-safe API calls
 * import { superAdminContract } from '@authvital/contracts/contracts';
 *
 * // Or import everything
 * import { superAdminContract, LoginRequestSchema } from '@authvital/contracts';
 * ```
 *
 * @packageDocumentation
 */

export * from './schemas/index.js';
export * from './contracts/index.js';
