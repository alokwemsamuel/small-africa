import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { useMe } from '@/hooks/useAuth';

/**
 * Client-side guard for nicer UX only. Every protected API endpoint enforces the same
 * rules on the server; hiding UI is never the security boundary.
 */
export function RequireAuth({ roles, children }) {
  const { data: user, isPending } = useMe();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="text-accent grid min-h-[50vh] place-items-center">
        <Spinner label="Checking your session" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
