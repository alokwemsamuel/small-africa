import { cart, lineKey } from './cart';

const jollof = {
  dishId: 1,
  slug: 'smoky-party-jollof',
  name: 'Smoky Party Jollof',
  kitchen: 'nigerian',
  unitPriceKobo: 1850000,
  portionId: 10,
  portionName: 'Regular',
  addonIds: [],
  addonNames: [],
  containsPork: false,
};

beforeEach(() => cart.clear());

describe('cart store', () => {
  it('merges identical lines and splits different option choices', () => {
    cart.add(jollof);
    cart.add(jollof, 2);
    cart.add({ ...jollof, portionId: 11, portionName: 'Large', unitPriceKobo: 2450000 });
    const lines = cart.snapshot();
    expect(lines).toHaveLength(2);
    expect(lines[0]?.quantity).toBe(3);
  });

  it('treats add-ons in any order as the same line', () => {
    expect(lineKey(1, 10, [3, 2])).toBe(lineKey(1, 10, [2, 3]));
  });

  it('caps quantity and removes lines set to zero', () => {
    cart.add(jollof, 50);
    const key = cart.snapshot()[0].key;
    expect(cart.snapshot()[0]?.quantity).toBe(20);
    cart.setQuantity(key, 0);
    expect(cart.snapshot()).toHaveLength(0);
  });

  it('persists to localStorage (a UI convenience, not auth data)', () => {
    cart.add(jollof);
    const saved = JSON.parse(localStorage.getItem('sa-cart-v1') ?? '[]');
    expect(saved[0].slug).toBe('smoky-party-jollof');
    expect(JSON.stringify(saved)).not.toMatch(/token|session|password/i);
  });
});
