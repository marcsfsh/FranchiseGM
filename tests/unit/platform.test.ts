import { describe, expect, it } from 'vitest';
import { clearsSiteData } from '../../src/app/platform';

const UA = {
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
};

describe('export reminder browsers (spec 21)', () => {
  it('reminds Safari and other WebKit browsers on Apple devices', () => {
    expect(clearsSiteData(UA.safariMac)).toBe(true);
    expect(clearsSiteData(UA.safariIphone)).toBe(true);
    expect(clearsSiteData(UA.chromeIphone)).toBe(true);
  });

  it("doesn't remind Chrome, Edge, Firefox, or Android", () => {
    for (const ua of [UA.chromeMac, UA.edge, UA.firefox, UA.androidChrome])
      expect(clearsSiteData(ua)).toBe(false);
  });
});
