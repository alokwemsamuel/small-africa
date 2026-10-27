import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@/app/theme/ThemeProvider';
import { basename } from '@/lib/env';
import { queryClient, routes } from './router';

/** Everything around the router. Shared with the server render, so pre-built pages match. */
export function AppProviders({ client, children }) {
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

const router = typeof window !== 'undefined' ? createBrowserRouter(routes, { basename }) : null;

export function App() {
  return (
    <AppProviders client={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
