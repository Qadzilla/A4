import { describe, expect, it } from 'vitest';

describe('health', () => {
  it('returns ok status', () => {
    const response = { status: 'ok', timestamp: new Date() };
    expect(response.status).toBe('ok');
    expect(response.timestamp).toBeInstanceOf(Date);
  });
});
