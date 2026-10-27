/**
 * The signed-in user (GET /auth/me). Never contains password hashes or 2FA secrets.
 *
 * @typedef {'super_admin' | 'manager' | 'staff' | 'customer'} Role
 *
 * @typedef {object} User
 * @property {number} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 * @property {string | null} phone
 * @property {Role} role
 * @property {'kitchen' | 'front_desk' | null} staffPosition for role 'staff'
 * @property {boolean} emailVerified
 * @property {string | null} birthday YYYY-MM-DD; can be set once (drives birthday rewards)
 * @property {number | null} favouriteKitchenId
 * @property {string | null} referralCode
 * @property {boolean} marketingOptIn
 * @property {'dark' | 'light' | 'system' | null} themePreference
 * @property {boolean} twoFactorEnabled
 * @property {string} createdAt
 */

export const STAFF_ROLES = ['super_admin', 'manager', 'staff'];

/** @param {User | null | undefined} user */
export function isStaff(user) {
  return !!user && STAFF_ROLES.includes(user.role);
}
