import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock electron in tests
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
  },
}));

// Setup process.env for tests
process.env.VITE_API_URL = 'http://localhost:3000';
