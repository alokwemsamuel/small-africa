import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const meKey = ['auth', 'me'];

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: ({ signal }) => api('/auth/me', { signal }).then((r) => r.user),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values) => api('/auth/login', { method: 'POST', body: values }),
    onSuccess: (r) => {
      if (r.user) qc.setQueryData(meKey, r.user);
    },
  });
}

export function useTwoFactorLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code) => api('/auth/2fa', { method: 'POST', body: { code } }),
    onSuccess: (r) => qc.setQueryData(meKey, r.user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api('/auth/register', { method: 'POST', body }),
    onSuccess: (r) => qc.setQueryData(meKey, r.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.setQueryData(meKey, null);
      // Drop every cached private query (orders, wallet, admin data…).
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' && q.queryKey[0] !== 'public' });
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email) => api('/auth/forgot-password', { method: 'POST', body: { email } }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body) => api('/auth/reset-password', { method: 'POST', body }),
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token) => api('/auth/verify-email', { method: 'POST', body: { token } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => api('/auth/resend-verification', { method: 'POST' }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api('/account/profile', { method: 'PATCH', body }),
    onSuccess: (r) => qc.setQueryData(meKey, r.user),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body) => api('/account/password', { method: 'POST', body }),
  });
}
