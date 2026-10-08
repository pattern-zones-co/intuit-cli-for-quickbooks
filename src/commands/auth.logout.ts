import { tokenStore, profileStore } from "../lib/token-store.js";

export function authLogout(profile?: string) {
  const p = profile || profileStore.getActive();
  let authenticated: boolean;
  try {
    authenticated = !!tokenStore.get(p)?.access_token;
  } catch {
    // A token file that can't be decrypted is still something to log out of.
    authenticated = true;
  }

  if (!authenticated) {
    console.log(`Not authenticated (profile: ${p}). Nothing to do.`);
    return;
  }

  tokenStore.clear(p);
  profileStore.remove(p);
  console.log(`Logged out and removed profile "${p}".`);
}
