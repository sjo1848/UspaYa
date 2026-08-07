import { describe, expect, it } from 'vitest';

import { APP_META } from './app-meta';

describe('APP_META', () => {
  it('does not present the foundation as pilot ready', () => {
    expect(APP_META).toEqual({
      name: 'UspaYa',
      stage: 'technical-foundation',
      pilotReady: false,
      publicReleaseReady: false,
    });
  });
});
