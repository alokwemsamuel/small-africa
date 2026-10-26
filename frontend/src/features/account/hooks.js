import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Order } from '@/features/checkout/api';
import type { Reservation } from '@/features/reservations/api';

export interface Address {
  id: number;
  label: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  zone: string | null;
  zoneName: string | null;
  phone: string | null;
  isDefault: boolean;
}

export interface MyReview {
  id: number;
  dish: string | null;
  dishSlug: string | null;
  orderReference: string | null;
  rating: number;
  title: string | null;
  body: string;
  status: 'pending' | 'approved' | 'hidden';
  reply: string | null;
  createdAt: string;
}

export function useAddresses(enabled = true) {
  return useQuery({
    queryKey: ['account', 'addresses'],
    queryFn: ({ signal }) =>
      api<{ addresses: Address[] }>('/account/addresses', { signal }).then((r) => r.addresses),
    enabled,
  });
}

export function useSaveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown> & { id?: number }) =>
      api<{ addresses: Address[] }>(id ? `/account/addresses/${id}` : '/account/addresses', {
        method: id ? 'PATCH' : 'POST',
        body,
      }),
    onSuccess: (r) => qc.setQueryData(['account', 'addresses'], r.addresses),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<{ addresses: Address[] }>(`/account/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: (r) => qc.setQueryData(['account', 'addresses'], r.addresses),
  });
}

export function useMyOrders() {
  return useQuery({
    queryKey: ['account', 'orders'],
    queryFn: ({ signal }) => api<{ orders: Order[] }>('/account/orders', { signal }).then((r) => r.orders),
  });
}

export function useMyReservations() {
  return useQuery({
    queryKey: ['account', 'reservations'],
    queryFn: ({ signal }) =>
      api<{ reservations: Reservation[] }>('/account/reservations', { signal }).then((r) => r.reservations),
  });
}

export function useMyReviews() {
  return useQuery({
    queryKey: ['account', 'reviews'],
    queryFn: ({ signal }) =>
      api<{ reviews: MyReview[] }>('/account/reviews', { signal }).then((r) => r.reviews),
  });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      order_reference: string;
      dish_id: number;
      rating: number;
      title?: string;
      body: string;
    }) => api<{ message: string }>('/account/reviews', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account', 'reviews'] }),
  });
}
