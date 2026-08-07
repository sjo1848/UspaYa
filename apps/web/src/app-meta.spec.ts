import { describe, expect, it } from 'vitest';

import { APP_META } from './app-meta';

describe('APP_META', () => {
  it('moves into frontend vertical work without presenting the product as pilot ready', () => {
    expect(APP_META).toEqual({
      name: 'UspaYa',
      stage: 'frontend-vertical-foundation',
      pilotReady: false,
      publicReleaseReady: false,
    });
  });
});
