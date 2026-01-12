/**
 * Test Setup
 *
 * Global test configuration and setup
 */

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});
