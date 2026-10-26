export type Role = 'super_admin' | 'manager' | 'staff' | 'customer';

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  staffPosition: 'kitchen' | 'front_desk' | null;
  emailVerified: boolean;
  birthday: string | null;
  favouriteKitchenId: number | null;
  referralCode: string | null;
  marketingOptIn: boolean;
  themePreference: 'dark' | 'light' | 'system' | null;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export const STAFF_ROLES: Role[] = ['super_admin', 'manager', 'staff'];

export function isStaff(user: User | null | undefined): boolean {
  return !!user && STAFF_ROLES.includes(user.role);
}
