import type { Kitchen } from '@/components/ui/Badge';

export type { Kitchen };
export type CategorySlug =
  'starters' | 'soups' | 'mains' | 'grills' | 'sides' | 'desserts' | 'drinks' | 'tasting';

export interface DishOption {
  id: number;
  name: string;
  priceDeltaKobo: number;
  isDefault: boolean;
}

export interface Dish {
  id: number;
  slug: string;
  name: string;
  kitchen: Kitchen | null;
  category: CategorySlug;
  shortDescription: string;
  description: string;
  ingredients: string | null;
  allergens: string[];
  priceKobo: number;
  spiceLevel: number;
  isVegetarian: boolean;
  isGlutenFree: boolean;
  containsNuts: boolean;
  containsPork: boolean;
  isAlcoholic: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
  popularity: number;
  imageUrl: string | null;
  imageAlt: string;
  options: { portion: DishOption[]; addon: DishOption[] };
}

export interface Review {
  id: number;
  author: string;
  rating: number;
  title: string | null;
  body: string;
  dish: string | null;
  reply: string | null;
  createdAt: string;
}

export interface DishDetail extends Dish {
  tastingCourses: { courseNo: number; kitchen: Kitchen; name: string; description: string }[];
  related: Dish[];
  reviews: Review[];
}

export interface KitchenInfo {
  id: number;
  slug: Kitchen;
  name: string;
  tagline: string;
  description: string;
  accentColor: string;
}

export interface MenuData {
  kitchens: KitchenInfo[];
  categories: { id: number; slug: CategorySlug; name: string }[];
  dishes: Dish[];
}

export interface SiteInfo {
  restaurant: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    whatsapp: string;
    email: string;
    instagram: string;
    tiktok: string;
    map_embed_query: string;
  };
  pricing: { pricesIncludeVat: boolean; vatRateBp: number; serviceChargeDineInBp: number };
  openingHours: { dayOfWeek: number; opensAt: string | null; closesAt: string | null; isClosed: boolean }[];
  deliveryZones: { slug: string; name: string; feeKobo: number; minOrderKobo: number; etaMinutes: number }[];
  seatingAreas: { slug: string; name: string; description: string; minParty: number; maxParty: number }[];
  eventPackages: {
    id: number;
    slug: string;
    name: string;
    summary: string;
    pricePerGuestKobo: number;
    minGuests: number;
    maxGuests: number;
    features: string[];
  }[];
  loyalty: {
    tiers: { key: string; name: string; min_spend_naira: number; multiplier: number; perks: string[] }[];
    earnPointsPer1000Naira: number;
    interestRateBp: number;
    interestCapNaira: number;
    interestMinBalanceNaira: number;
    referralCreditNaira: number;
  };
  testimonials: Review[];
}
