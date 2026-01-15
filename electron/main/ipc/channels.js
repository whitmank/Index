/**
 * IPC Channel Constants
 * Defines all communication channels between main and renderer processes
 */

module.exports = {
  // File system operations
  SELECT_DIRECTORY: 'fs:select-directory',
  SELECT_FILE: 'fs:select-file',
  SELECT_PATHS: 'fs:select-paths',
  GET_FILE_METADATA: 'fs:get-file-metadata',
  WATCH_PATH: 'fs:watch-path',
  UNWATCH_PATH: 'fs:unwatch-path',

  // Events (main → renderer)
  FILE_CHANGED: 'fs:file-changed',
  DIRECTORY_CHANGED: 'fs:directory-changed',

  // App operations
  GET_APP_PATH: 'app:get-path',
  GET_USER_DATA_PATH: 'app:get-user-data-path'
};
