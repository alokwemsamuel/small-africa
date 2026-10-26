import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMe, useUpdateProfile } from '@/features/auth/hooks';
import { ThemeContext } from './context';
import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  systemPrefersLight,
  watchSystemTheme,
  type ThemePreference,
} from './theme';

/**
 * Owns the appearance preference. Sources, in order: the signed-in user's profile (follows
 * them across devices), then localStorage, then Dark. Changes are saved locally and, for
 * signed-in users, to their profile.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(readStoredPreference);
  const [prefersLight, setPrefersLight] = useState(systemPrefersLight);
  const resolved = resolveTheme(preference, prefersLight);

  const { data: user } = useMe();
  const updateProfile = useUpdateProfile();
  const adoptedForUser = useRef<number | null>(null);

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
    (next: ThemePreference) => {
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
