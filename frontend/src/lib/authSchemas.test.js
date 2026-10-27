import { passwordProblems, passwordScore, registerSchema } from './authSchemas';

const valid = {
  first_name: 'Ada',
  last_name: 'Eze',
  email: 'ada@example.com',
  phone: '0803 123 4567',
  password: 'Jollof&Pierogi-2026',
  referral_code: '',
  marketing_opt_in: false,
  accept_terms: true,
};

describe('password rules (mirror of backend PasswordPolicy)', () => {
  it('accepts the demo account passwords', () => {
    for (const pw of ['SmallAfrica@Admin2026', 'SmallAfrica@Manager2026', 'SmallAfrica@Guest2026']) {
      expect(passwordProblems(pw)).toEqual([]);
    }
  });

  it('rejects short, single-class and personal passwords', () => {
    expect(passwordProblems('Ab1!')).not.toEqual([]);
    expect(passwordProblems('alllowercaseletters')).not.toEqual([]);
    expect(passwordProblems('Chiamaka#2026x', ['Chiamaka'])).not.toEqual([]);
  });

  it('scores strength from 0 to 4', () => {
    expect(passwordScore('')).toBe(0);
    expect(passwordScore('Jollof&Pierogi-2026')).toBe(4);
  });
});

describe('registerSchema', () => {
  it('accepts a valid registration', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('requires accepting the terms', () => {
    const r = registerSchema.safeParse({ ...valid, accept_terms: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['accept_terms']);
  });

  it('validates Nigerian phone numbers but allows blank', () => {
    expect(registerSchema.safeParse({ ...valid, phone: '' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, phone: '+234 803 123 4567' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false);
  });

  it('blocks passwords containing the user’s name', () => {
    const r = registerSchema.safeParse({ ...valid, first_name: 'Chiamaka', password: 'Chiamaka#2026x' });
    expect(r.success).toBe(false);
  });
});
