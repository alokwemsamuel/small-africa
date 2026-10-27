import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Data shapes for the public menu and site information (GET /menu, /menu/{slug}, /site).
 * Money is integer kobo.
 *
 * @typedef {'nigerian' | 'polish' | 'continental'} Kitchen
 * @typedef {'starters' | 'soups' | 'mains' | 'grills' | 'sides' | 'desserts' | 'drinks' | 'tasting'} CategorySlug
 *
 * @typedef {object} DishOption
 * @property {number} id
 * @property {string} name
 * @property {number} priceDeltaKobo added to the dish price (can be negative for a smaller portion)
 * @property {boolean} isDefault
 *
 * @typedef {object} Dish
 * @property {number} id
 * @property {string} slug
 * @property {string} name
 * @property {Kitchen | null} kitchen null for drinks
 * @property {CategorySlug} category
 * @property {string} shortDescription
 * @property {string} description
 * @property {string | null} ingredients
 * @property {string[]} allergens
 * @property {number} priceKobo
 * @property {number} spiceLevel 0–3
 * @property {boolean} isVegetarian
 * @property {boolean} isGlutenFree
 * @property {boolean} containsNuts
 * @property {boolean} containsPork
 * @property {boolean} isAlcoholic
 * @property {boolean} isFeatured
 * @property {boolean} isAvailable false when off the menu or sold out today
 * @property {number} popularity
 * @property {string | null} imageUrl uploaded photo ('/media/…'), else the stock photo is used
 * @property {string} imageAlt
 * @property {{ portion: DishOption[], addon: DishOption[] }} options
 *
 * @typedef {object} Review
 * @property {number} id
 * @property {string} author e.g. 'Funmilayo A.'
 * @property {number} rating 1–5
 * @property {string | null} title
 * @property {string} body
 * @property {string | null} dish
 * @property {string | null} reply the restaurant's reply
 * @property {string} createdAt
 *
 * @typedef {Dish & { tastingCourses: { courseNo: number, kitchen: Kitchen, name: string,
 *   description: string }[], related: Dish[], reviews: Review[] }} DishDetail
 *
 * @typedef {object} KitchenInfo
 * @property {number} id
 * @property {Kitchen} slug
 * @property {string} name
 * @property {string} tagline
 * @property {string} description
 * @property {string} accentColor
 *
 * @typedef {object} MenuData
 * @property {KitchenInfo[]} kitchens
 * @property {{ id: number, slug: CategorySlug, name: string }[]} categories
 * @property {Dish[]} dishes
 *
 * @typedef {object} SiteInfo
 * @property {Record<string, string>} restaurant name, tagline, address, phone, whatsapp, email…
 * @property {{ pricesIncludeVat: boolean, vatRateBp: number, serviceChargeDineInBp: number }} pricing
 * @property {{ dayOfWeek: number, opensAt: string | null, closesAt: string | null, isClosed: boolean }[]} openingHours
 * @property {{ slug: string, name: string, feeKobo: number, minOrderKobo: number, etaMinutes: number }[]} deliveryZones
 * @property {{ slug: string, name: string, description: string, minParty: number, maxParty: number }[]} seatingAreas
 * @property {object[]} eventPackages
 * @property {object} loyalty tiers and headline Interest Account rules
 * @property {Review[]} testimonials
 */

// Public content is keyed under 'public' so it survives sign-out cache clearing.

/** Kitchens, categories and every dish. @returns {import('@tanstack/react-query').UseQueryResult<MenuData>} */
export function useMenu() {
  return useQuery({
    queryKey: ['public', 'menu'],
    queryFn: ({ signal }) => api('/menu', { signal }),
    staleTime: 5 * 60_000,
  });
}

/**
 * One dish with tasting courses, related dishes and reviews.
 * @param {string} slug
 * @returns {import('@tanstack/react-query').UseQueryResult<DishDetail>}
 */
export function useDish(slug) {
  return useQuery({
    queryKey: ['public', 'dish', slug],
    queryFn: ({ signal }) => api(`/menu/${encodeURIComponent(slug)}`, { signal }).then((r) => r.dish),
    staleTime: 5 * 60_000,
  });
}

/** Restaurant details, hours, zones, events and loyalty headlines. @returns {import('@tanstack/react-query').UseQueryResult<SiteInfo>} */
export function useSite() {
  return useQuery({
    queryKey: ['public', 'site'],
    queryFn: ({ signal }) => api('/site', { signal }),
    staleTime: 10 * 60_000,
  });
}
