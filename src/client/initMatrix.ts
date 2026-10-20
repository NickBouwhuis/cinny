import { createClient, MatrixClient, IndexedDBStore, IndexedDBCryptoStore } from 'matrix-js-sdk';

import { cryptoCallbacks } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { pushSessionToSW } from '../sw-session';
import {
  getActiveSession,
  getSessionStoreName,
  getSessions,
  isAddingAccount,
  putSession,
  removeSession,
  Session,
  setActiveSession,
  setAddingAccount,
} from '../app/state/sessions';

export const initClient = async (session: Session): Promise<MatrixClient> => {
  const storeName = getSessionStoreName(session);

  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: storeName.sync,
  });

  // legacy crypto store is only needed to migrate old (pre rust crypto) sessions
  const legacyCryptoStore = session.fallbackSdkStores
    ? new IndexedDBCryptoStore(global.indexedDB, storeName.crypto)
    : undefined;

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as any,
    verificationMethods: ['m.sas.v1'],
  });

  await indexedDBStore.startup();
  await mx.initRustCrypto({ cryptoDatabasePrefix: storeName.rustCryptoPrefix });

  mx.setMaxListeners(50);

  return mx;
};

export const startClient = async (mx: MatrixClient) => {
  await mx.startClient({
    lazyLoadMembers: true,
  });
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  mx.stopClient();
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  window.location.reload();
};

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve) => {
    const req = window.indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

/**
 * Delete all IndexedDB databases owned by given session.
 */
export const deleteSessionStores = async (session: Session) => {
  const storeName = getSessionStoreName(session);
  const rustPrefix = storeName.rustCryptoPrefix ?? 'matrix-js-sdk';
  await Promise.all(
    [
      `matrix-js-sdk:${storeName.sync}`,
      storeName.crypto,
      `${rustPrefix}::matrix-sdk-crypto`,
      `${rustPrefix}::matrix-sdk-crypto-meta`,
    ].map(deleteDatabase)
  );
};

/**
 * Remove session data and reload into next available account (or login).
 */
const removeSessionAndReload = (userId: string) => {
  clearNavToActivePathStore(userId);
  const next = removeSession(userId);
  if (!next) {
    window.localStorage.clear();
  }
  window.location.reload();
};

export const switchAccount = (userId: string) => {
  setActiveSession(userId);
  setAddingAccount(false);
  window.location.reload();
};

export const logoutClient = async (mx: MatrixClient) => {
  pushSessionToSW();
  mx.stopClient();
  try {
    await mx.logout();
  } catch {
    // ignore if failed to logout
  }
  const session = getSessions().find((s) => s.userId === mx.getSafeUserId());
  await mx.clearStores({
    cryptoDatabasePrefix: session && getSessionStoreName(session).rustCryptoPrefix,
  });
  removeSessionAndReload(mx.getSafeUserId());
};

/**
 * Remove local data of active session without server logout.
 * Used when client failed to load.
 */
export const clearLoginData = async () => {
  const session = getActiveSession();
  if (session && getSessions().length > 1) {
    await deleteSessionStores(session);
    removeSessionAndReload(session.userId);
    return;
  }

  const dbs = await window.indexedDB.databases();

  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) {
      window.indexedDB.deleteDatabase(name);
    }
  });

  window.localStorage.clear();
  window.location.reload();
};

/**
 * Called when server reports that session was logged out (e.g. from other device).
 */
export const handleSessionLoggedOut = async (mx: MatrixClient) => {
  mx.stopClient();
  const session = getSessions().find((s) => s.userId === mx.getSafeUserId());
  await mx.clearStores({
    cryptoDatabasePrefix: session && getSessionStoreName(session).rustCryptoPrefix,
  });
  removeSessionAndReload(mx.getSafeUserId());
};

/**
 * Store newly logged in session and make it active.
 * Returns true if the page needs a full reload
 * (an account was added while another client was loaded).
 */
export const activateNewSession = async (session: Session): Promise<boolean> => {
  const existing = getSessions().find((s) => s.userId === session.userId);
  if (existing && existing.deviceId !== session.deviceId) {
    await deleteSessionStores(existing);
  }
  const needsReload = isAddingAccount();
  putSession(session);
  setAddingAccount(false);
  return needsReload;
};
