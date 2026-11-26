// LOCAL TEST ONLY. Puts a logged-in-looking Firebase user on the client auth
// singleton so fixture pages can call getToken() without a real login.
//
// The stub has to be user-SHAPED, because Firebase itself touches the object:
// assigning `auth.currentUser` runs AuthImpl.directlySetCurrentUser, which calls
// `_stopProactiveRefresh()` on the previous user and `_startProactiveRefresh()`
// on the new one. A plain `{ getIdToken }` object throws there before any export
// ever runs.
export async function installFixtureUser({ name = '王小明' } = {}) {
  const { auth } = await import('../lib/firebase-client');
  // Firebase finishes restoring its own session asynchronously; setting
  // currentUser before that lands would be overwritten with the restored (null)
  // user a moment later. authStateReady resolves once it has settled.
  try {
    await auth.authStateReady();
  } catch {
    // Older SDK: no authStateReady; assigning now is the best available guess.
  }
  auth.currentUser = {
    uid: 'fixture-user',
    email: 'fixture@example.test',
    displayName: name,
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    // Public API used by the app.
    getIdToken: async () => 'fixture-token',
    getIdTokenResult: async () => ({
      token: 'fixture-token',
      expirationTime: new Date(Date.now() + 3_600_000).toISOString(),
      authTime: new Date(0).toISOString(),
      issuedAtTime: new Date(0).toISOString(),
      signInProvider: 'password',
      claims: {},
    }),
    reload: async () => {},
    // Private hooks Firebase's own setters call.
    _startProactiveRefresh: () => {},
    _stopProactiveRefresh: () => {},
    _updateTokensIfNecessary: async () => {},
    _getIdTokenResponse: async () => ({ accessToken: 'fixture-token' }),
    _handleTokenResponse: async () => {},
    _onTokenChange: () => {},
    _clone: function clone() { return this; },
  };
  return auth.currentUser;
}
