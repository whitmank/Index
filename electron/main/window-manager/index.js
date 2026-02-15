// Author: Claude Code
// Platform-agnostic window manager factory
// Routes to platform-specific implementations

import MacOSWindowManager from './macos.js';
import GenericWindowManager from './generic.js';

// Select the appropriate window manager based on platform
const windowManagerClass = process.platform === 'darwin'
  ? MacOSWindowManager
  : GenericWindowManager;

export default windowManagerClass;
