import { formatNaira, initials } from './format';

describe('formatNaira', () => {
  it('formats kobo as naira with thousands separators', () => {
    expect(formatNaira(1_250_000)).toBe('₦12,500');
    expect(formatNaira(6_850_000)).toBe('₦68,500');
    expect(formatNaira(0)).toBe('₦0');
  });

  it('rounds to the nearest naira and marks negatives', () => {
    expect(formatNaira(1_999)).toBe('₦20');
    expect(formatNaira(-500_000)).toBe('−₦5,000');
  });
});

describe('initials', () => {
  it('uses first letters in upper case', () => {
    expect(initials('chiamaka', 'bello')).toBe('CB');
  });
});
