import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useAddresses(enabled = true) {
  return useQuery({
    queryKey: ['account', 'addresses'],
    queryFn: ({ signal }) => api('/account/addresses', { signal }).then((r) => r.addresses),
    enabled,
  });
}

export function useSaveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      api(id ? `/account/addresses/${id}` : '/account/addresses', {
        method: id ? 'PATCH' : 'POST',
        body,
      }),
    onSuccess: (r) => qc.setQueryData(['account', 'addresses'], r.addresses),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api(`/account/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: (r) => qc.setQueryData(['account', 'addresses'], r.addresses),
  });
}

export function useMyOrders() {
  return useQuery({
    queryKey: ['account', 'orders'],
    queryFn: ({ signal }) => api('/account/orders', { signal }).then((r) => r.orders),
  });
}

export function useMyReservations() {
  return useQuery({
    queryKey: ['account', 'reservations'],
    queryFn: ({ signal }) => api('/account/reservations', { signal }).then((r) => r.reservations),
  });
}

export function useMyReviews() {
  return useQuery({
    queryKey: ['account', 'reviews'],
    queryFn: ({ signal }) => api('/account/reviews', { signal }).then((r) => r.reviews),
  });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api('/account/reviews', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account', 'reviews'] }),
  });
}
