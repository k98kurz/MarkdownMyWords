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
export type UserCallback = (user: User | null) => void;

/**
 * Unsubscribe function returned by subscription methods
 */
export type Unsubscribe = () => void;
