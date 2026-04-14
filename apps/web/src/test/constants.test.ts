import { ROUTES } from '@/constants';
import { describe, expect, it } from 'vitest';

describe('ROUTES', () => {
  it('has correct sign-in path', () => {
    expect(ROUTES.SIGN_IN).toBe('/sign-in');
  });

  it('has correct home path', () => {
    expect(ROUTES.HOME).toBe('/dashboard');
  });

  it('has correct usage path', () => {
    expect(ROUTES.USAGE).toBe('/usage');
  });
});
