/**
 * Document Type Definitions
 *
 * Type definitions for document management, error handling, and metadata.
 */

/**
 * Document Error Type
 * Discriminated union for type-safe error handling
 */
export interface DocumentError {
  code:
    | 'NETWORK_ERROR'
    | 'ENCRYPTION_ERROR'
    | 'PERMISSION_DENIED'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR';
  message: string;
  details?: unknown;
}

/**
 * Document Access Entry
 * Represents a user's access to a document with encrypted document key
 */
export interface DocumentAccessEntry {
  userId: string;
  docKey: string;
  senderEpub: string;
}

/**
 * Document
 * Full document model with all fields
 * Storage path: gun.user().get('docs').get(docId)
 */
export interface Document {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  original?: string;
  parent?: string;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  access: DocumentAccessEntry[];
}

/**
 * Document Metadata
 * Minimal document data for listing without full decryption
 * Used for two-phase loading strategy
 */
export interface DocumentMetadata {
  docId: string;
  soul: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  tags?: string[];
}

/**
 * Minimal Document List Item
 * Used for Phase 1 of two-phase loading (no decryption)
 */
export interface MinimalDocListItem {
  docId: string;
  soul: string;
  createdAt: number;
  updatedAt: number;
}
