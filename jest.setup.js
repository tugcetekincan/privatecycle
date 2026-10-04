// Global Jest setup: mock native/Expo modules so service and component tests
// run headlessly without a device, a database, or a file system.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-sqlite', () => {
  const noop = async () => undefined;
  const database = {
    execAsync: noop,
    runAsync: noop,
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
    withTransactionAsync: async (fn) => fn(),
  };
  return {
    openDatabaseAsync: async () => database,
  };
});

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///document/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ''),
  readDirectoryAsync: jest.fn(async () => []),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
