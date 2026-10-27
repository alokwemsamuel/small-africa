export const NAV = [
  { to: '/menu', label: 'Menu' },
  { to: '/reservations', label: 'Reservations' },
  { to: '/events', label: 'Events & Catering' },
  { to: '/about', label: 'Our Story' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/contact', label: 'Contact' },
];

/** The full-screen mobile menu: numbered, with Home and Rewards. `match` decides which one is current. */
export const MOBILE_NAV = [
  { to: '/', label: 'Home', match: (p) => p === '/' },
  { to: '/menu', label: 'Menu', match: (p) => p === '/menu' || p.startsWith('/menu/') },
  { to: '/reservations', label: 'Reservations', match: (p) => p.startsWith('/reservations') },
  { to: '/events', label: 'Events & catering', match: (p) => p === '/events' },
  { to: '/rewards', label: 'Rewards', match: (p) => p === '/rewards' },
  { to: '/about', label: 'About & gallery', match: (p) => p === '/about' || p === '/gallery' },
  { to: '/contact', label: 'Contact', match: (p) => p === '/contact' },
];
