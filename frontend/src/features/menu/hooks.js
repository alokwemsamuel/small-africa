import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Public content is keyed under 'public' so it survives sign-out cache clearing.
export function useMenu() {
  return useQuery({
    queryKey: ['public', 'menu'],
    queryFn: ({ signal }) => api('/menu', { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useDish(slug) {
  return useQuery({
    queryKey: ['public', 'dish', slug],
    queryFn: ({ signal }) => api(`/menu/${encodeURIComponent(slug)}`, { signal }).then((r) => r.dish),
    staleTime: 5 * 60_000,
  });
}

export function useSite() {
  return useQuery({
    queryKey: ['public', 'site'],
    queryFn: ({ signal }) => api('/site', { signal }),
    staleTime: 10 * 60_000,
  });
}
