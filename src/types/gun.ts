/**
 * GunDB Type Definitions
 *
 * Type definitions for GunDB nodes and operations used throughout the application.
 */

import type { IGunInstance } from 'gun/types';

/**
 * GunDB instance type
 */
export type GunInstance = IGunInstance;

/**
 * User Profile
 */
export interface UserProfile {
  username: string;
  encryptedProfile?: string;
  publicKey?: string;
}

/**
 * User Settings
 */
export interface UserSettings {
  theme: 'light' | 'dark';
  editorSettings?: {
    fontSize?: number;
    wordWrap?: boolean;
    [key: string]: unknown;
  };
  openRouterApiKey?: string; // Encrypted
}

/**
 * User Node
 * Path: {appNamespace}~user~{userId}
 * Example: markdownmywords~user~{userId}
 */
export interface User {
  profile: UserProfile;
  documents?: {
    [docId: string]: {
      docId: string;
      accessLevel: 'owner' | 'write' | 'read';
      addedAt: number;
    };
  };
  settings?: UserSettings;
}

/**
 * Document Metadata
 */
export interface DocumentMetadata {
  title: string;
  createdAt: number;
  updatedAt: number;
  lastModifiedBy: string;
  tags?: string[];
}

/**
 * Document Sharing Configuration
 */
export interface DocumentSharing {
  owner: string;
  isPublic: boolean;
  readAccess: string[];
  writeAccess: string[];
  shareToken?: string;
  documentKey?: {
    [userId: string]: string; // userId -> encrypted key
  };
}

/**
 * Branch Main State (for shared documents)
 */
export interface BranchMain {
  encryptedContent: string;
  contentIV: string;
  mergedAt: number;
  version: number;
}

/**
 * Document Node
 * Path: {appNamespace}~doc~{docId}
 * Example: markdownmywords~doc~{docId}
 */
export interface Document {
  metadata: DocumentMetadata;
  encryptedContent: string;
  contentIV: string;
  sharing: DocumentSharing;
  branches?: {
    main?: BranchMain;
    [branchId: string]: BranchMain | Branch | undefined;
  };
}

/**
 * Branch Status
 */
export type BranchStatus = 'pending' | 'merged' | 'rejected';

/**
 * Branch Node
 * Path: {appNamespace}~branch~{userId}~{timestamp}
 * Example: markdownmywords~branch~{userId}~{timestamp}
 */
export interface Branch {
  encryptedContent: string;
  contentIV: string;
  createdBy: string;
  createdAt: number;
  status: BranchStatus;
  mergedAt?: number;
  mergedBy?: string;
  parentVersion: number;
  description?: string;
}

/**
 * GunDB Node Reference
 */
export type GunNodeRef = ReturnType<GunInstance['get']>;

/**
 * GunDB Error Types
 */
export enum GunErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  SYNC_ERROR = 'SYNC_ERROR',
  OFFLINE = 'OFFLINE',
  STORAGE_ERROR = 'STORAGE_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_DATA = 'INVALID_DATA',
}

/**
 * GunDB Error
 */
export interface GunError {
  code: GunErrorCode;
  message: string;
  details?: unknown;
}

/**
 * GunDB Configuration
 */
export interface GunConfig {
  relayUrl?: string;
  peers?: string[];
  localStorage?: boolean;
  radisk?: boolean;
  /**
   * Application namespace for collision avoidance.
   * All GunDB paths will be prefixed with this namespace.
   * Default: 'markdownmywords'
   * Example: With namespace 'markdownmywords', user paths become 'markdownmywords~user~{userId}'
   */
  appNamespace?: string;
}

/**
 * Subscription Callback Types
 */
export type DocumentCallback = (doc: Document | null) => void;
export type UserCallback = (user: User | null) => void;
export type BranchCallback = (branch: Branch | null) => void;

/**
 * Unsubscribe function returned by subscription methods
 */
export type Unsubscribe = () => void;
