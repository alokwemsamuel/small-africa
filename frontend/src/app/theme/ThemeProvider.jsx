import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMe, useUpdateProfile } from '@/hooks/useAuth';
import { ThemeContext } from './context';
import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  systemPrefersLight,
  watchSystemTheme,
} from './theme';

/**
 * Owns the appearance preference. Sources, in order: the signed-in user's profile (follows
 * them across devices), then localStorage, then Dark. Changes are saved locally and, for
 * signed-in users, to their profile.
 */
export function ThemeProvider({ children }) {
  const [preference, setPref] = useState(readStoredPreference);
  const [prefersLight, setPrefersLight] = useState(systemPrefersLight);
  const resolved = resolveTheme(preference, prefersLight);

  const { data: user } = useMe();
  const updateProfile = useUpdateProfile();
  const adoptedForUser = useRef(null);

  // Follow live OS changes (only matters while "System" is selected, but cheap to keep).
  useEffect(() => watchSystemTheme(setPrefersLight), []);

  useEffect(() => applyTheme(resolved, preference), [resolved, preference]);

  // On sign-in, adopt the preference saved on the profile once per user.
  useEffect(() => {
    if (!user || adoptedForUser.current === user.id) return;
    adoptedForUser.current = user.id;
    if (user.themePreference && user.themePreference !== preference) {
      setPref(user.themePreference);
      storePreference(user.themePreference);
    }
  }, [user, preference]);

  const { mutate } = updateProfile;
  const setPreference = useCallback(
    (next) => {
      setPref(next);
      storePreference(next);
      if (user && user.themePreference !== next) {
        // Best effort: the choice already applies locally if the request fails.
        mutate({ theme_preference: next });
      }
    },
    [user, mutate],
  );

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
