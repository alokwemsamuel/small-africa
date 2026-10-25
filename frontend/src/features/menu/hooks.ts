import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DishDetail, MenuData, SiteInfo } from './types';

// Public content is keyed under 'public' so it survives sign-out cache clearing.
export function useMenu() {
  return useQuery({
    queryKey: ['public', 'menu'],
    queryFn: ({ signal }) => api<MenuData>('/menu', { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useDish(slug: string) {
  return useQuery({
    queryKey: ['public', 'dish', slug],
    queryFn: ({ signal }) =>
      api<{ dish: DishDetail }>(`/menu/${encodeURIComponent(slug)}`, { signal }).then((r) => r.dish),
    staleTime: 5 * 60_000,
  });
}

export function useSite() {
  return useQuery({
    queryKey: ['public', 'site'],
    queryFn: ({ signal }) => api<SiteInfo>('/site', { signal }),
    staleTime: 10 * 60_000,
  });
}
