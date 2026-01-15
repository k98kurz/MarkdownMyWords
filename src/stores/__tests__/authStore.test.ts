/**
 * Auth Store Tests
 *
 * Tests for authentication state management.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { useAuthStore } from '../authStore';
import { gunService } from '../../services/gunService';
import { encryptionService } from '../../services/encryptionService';

describe('AuthStore', () => {
  beforeAll(async () => {
    // Initialize GunDB and SEA before all tests
    try {
      gunService.initialize();
      await encryptionService.initializeSEA();
    } catch (error) {
      console.warn('GunDB initialization failed in test environment:', error);
    }
  });

  describe('Authentication', () => {
    it('should handle authentication when ack.ok is 0 but user.is is set (regression test)', async () => {
      // REGRESSION TEST: This test prevents the issue where GunDB returns
      // { ok: 0 } when authenticating, but the user is actually authenticated
      // (user.is is set). Previously, the service would reject with
      // "Authentication returned not ok" even though authentication succeeded.
      //
      // Expected behavior:
      // - If ack.ok is 0, check if user.is is set (poll if needed)
      // - If user.is is set with pub, treat as success
      // - Only reject if user.is is not set after multiple attempts

      const gun = gunService.getGun();
      if (!gun) {
        console.warn('Skipping test: GunDB not initialized');
        return;
      }

      // Test with a unique username to avoid conflicts
      const testUsername = `testuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const testPassword = 'testpass123';

      try {
        // First, create the user using the auth store
        const { register } = useAuthStore.getState();
        await register(testUsername, testPassword);

        // Logout to test authentication
        const { logout } = useAuthStore.getState();
        logout();

        // Wait a bit for logout to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Now try to authenticate using the auth store
        // This might return ok: 0 but still authenticate the user
        const { login } = useAuthStore.getState();
        await login(testUsername, testPassword);

        // Verify user was authenticated successfully
        const { user, isAuthenticated } = useAuthStore.getState();
        expect(isAuthenticated).toBe(true);
        expect(user).toBeDefined();

        // Verify user.is is actually set in GunDB
        const gunUser = gun.user();
        expect(gunUser.is).toBeDefined();
        expect(gunUser.is?.pub).toBeTruthy();
      } catch (error: any) {
        // If error occurs, check that it's not the regression we're testing for
        if (error.code === 'AUTHENTICATION_FAILED' &&
            error.message === 'Authentication returned not ok') {
          // Check if user is actually authenticated despite the error
          const gunUser = gun.user();
          if (gunUser.is && gunUser.is.pub) {
            // This is the regression - user is authenticated but we rejected
            throw new Error(
              'REGRESSION: Service rejected authentication even though user.is is set. ' +
              'This indicates the fix for handling ack.ok === 0 with user.is has been broken.'
            );
          }
        }
        // Other errors are acceptable (e.g., network issues, GunDB not available)
        throw error;
      }
    }, 30000); // 30 second timeout for GunDB operations
  });

  describe('User Registration', () => {
    it('should handle user creation when ack.ok is 0 but pub exists (regression test)', async () => {
      // REGRESSION TEST: This test prevents the issue where GunDB returns
      // { ok: 0, pub: '...' } when user already exists or was created.
      // Previously, the service would reject with "User creation returned not ok"
      // even though the user was successfully created.
      //
      // Expected behavior:
      // - If ack.pub exists, treat as success (user was created or exists)
      // - If user.is is not set, authenticate the user
      // - Return user data with pub key

      const gun = gunService.getGun();
      if (!gun) {
        console.warn('Skipping test: GunDB not initialized');
        return;
      }

      // Test with a unique username to avoid conflicts
      const testUsername = `testuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const testPassword = 'testpass123';

      try {
        // First, try to create the user
        // This might succeed with ok: 1 or return ok: 0 if user already exists
        const { register } = useAuthStore.getState();
        await register(testUsername, testPassword);

        // Verify user was created successfully
        const { user, isAuthenticated } = useAuthStore.getState();
        expect(isAuthenticated).toBe(true);
        expect(user).toBeDefined();

        // Now try to create the same user again
        // This should handle the case where ack.ok is 0 but pub exists
        await register(testUsername, testPassword);

        // Should still be authenticated even if user already exists
        const { isAuthenticated: isAuth2, user: user2 } = useAuthStore.getState();
        expect(isAuth2).toBe(true);
        expect(user2).toBeDefined();
      } catch (error: any) {
        // If error occurs, check that it's not the regression we're testing for
        if (error.code === 'USER_CREATION_FAILED' &&
            error.message === 'User creation returned not ok' &&
            error.details?.pub) {
          // This is the regression - fail the test
          throw new Error(
            'REGRESSION: Service rejected user creation even though pub key exists. ' +
            'This indicates the fix for handling ack.ok === 0 with ack.pub has been broken.'
          );
        }
        // Other errors are acceptable (e.g., network issues, GunDB not available)
        throw error;
      }
    }, 30000); // 30 second timeout for GunDB operations
  });
});
