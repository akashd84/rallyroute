import { describe, expect, it, vi } from 'vitest';
// Node has no Next.js build layer; this mock removes only the import guard.
// HTTP requests in this opt-in suite use the real fetch implementation.
vi.mock('server-only', () => ({}));
import { getRoutingProvider } from '@/lib/routing';

describe.skipIf(process.env.RALLYROUTE_TEST_VALHALLA !== '1')('Valhalla live development smoke test', () => {
  it('checks loaded tiles, direct/multi-stop routes and a matrix using public Georgia coordinates', async () => {
    const provider = getRoutingProvider();
    const origin = { latitude: 34.0754, longitude: -84.2941 };
    const destination = { latitude: 33.749, longitude: -84.388 };
    const waypoint = { latitude: 33.9243, longitude: -84.3785 };
    expect(await provider.checkHealth()).toMatchObject({ status: 'ok', healthy: true });
    const route = await provider.getRoute({ origin, destination, travelMode: 'driving' });
    expect(route.status).toBe('ok');
    if (route.status === 'ok') {
      expect(route.distanceMeters).toBeGreaterThan(1000);
      expect(route.durationSeconds).toBeGreaterThan(0);
      expect(route.legs).toHaveLength(1);
    }
    const multi = await provider.getRoute({ origin, destination, waypoints: [waypoint, { latitude: 33.8488, longitude: -84.3733 }], travelMode: 'driving' });
    expect(multi.status).toBe('ok');
    if (multi.status === 'ok') expect(multi.legs).toHaveLength(3);
    const matrix = await provider.getMatrix({ origins: [origin, waypoint], destinations: [destination], travelMode: 'driving' });
    expect(matrix.status).toBe('ok');
    if (matrix.status === 'ok') {
      expect(matrix.cells).toHaveLength(2);
      for (const row of matrix.cells) expect(row).toEqual([expect.objectContaining({ status: 'ok', durationSeconds: expect.any(Number), distanceMeters: expect.any(Number) })]);
    }
  }, 60000);
});
