import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { User } from './types';

export const meKey = ['auth', 'me'] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: ({ signal }) => api<{ user: User | null }>('/auth/me', { signal }).then((r) => r.user),
    staleTime: 60_000,
    retry: 1,
  });
}

type LoginResult = { user?: User; twoFactorRequired?: boolean };

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: { email: string; password: string }) =>
      api<LoginResult>('/auth/login', { method: 'POST', body: values }),
    onSuccess: (r) => {
      if (r.user) qc.setQueryData(meKey, r.user);
    },
  });
}

export function useTwoFactorLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<{ user: User }>('/auth/2fa', { method: 'POST', body: { code } }),
    onSuccess: (r) => qc.setQueryData(meKey, r.user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ user: User }>('/auth/register', { method: 'POST', body }),
    onSuccess: (r) => qc.setQueryData(meKey, r.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.setQueryData(meKey, null);
      // Drop every cached private query (orders, wallet, admin data…).
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' && q.queryKey[0] !== 'public' });
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      api<{ message: string }>('/auth/reset-password', { method: 'POST', body }),
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api<{ message: string }>('/auth/verify-email', { method: 'POST', body: { token } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => api<{ message: string }>('/auth/resend-verification', { method: 'POST' }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ user: User }>('/account/profile', { method: 'PATCH', body }),
    onSuccess: (r) => qc.setQueryData(meKey, r.user),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      api<{ message: string }>('/account/password', { method: 'POST', body }),
  });
}
