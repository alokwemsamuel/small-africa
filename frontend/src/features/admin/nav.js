export const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', permission: 'dashboard.view' },
  { to: '/admin/orders', label: 'Orders', permission: 'orders.view' },
  { to: '/admin/reservations', label: 'Reservations', permission: 'reservations.manage' },
  { to: '/admin/menu', label: 'Menu', permission: 'menu.availability' },
  { to: '/admin/customers', label: 'Customers', permission: 'customers.view' },
  { to: '/admin/rewards', label: 'Interest Account', permission: 'loyalty.manage' },
  { to: '/admin/reviews', label: 'Reviews', permission: 'reviews.moderate' },
  { to: '/admin/coupons', label: 'Coupons', permission: 'coupons.manage' },
  { to: '/admin/enquiries', label: 'Enquiries', permission: 'enquiries.manage' },
  { to: '/admin/staff', label: 'Staff & roles', permission: 'staff.manage' },
  { to: '/admin/settings', label: 'Settings', permission: 'settings.manage' },
  { to: '/admin/audit', label: 'Audit log', permission: 'audit.view' },
];
