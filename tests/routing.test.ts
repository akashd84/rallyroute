import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { getRoutingProvider } from '@/lib/routing';
import { ValhallaProvider } from '@/lib/routing/valhalla';
const origin = { latitude: 40, longitude: -73 };
const destination = { latitude: 41, longitude: -72 };
const request = { origin, destination, travelMode: 'driving' as const };
const route = { trip: { status: 0, units: 'kilometers', summary: { time: 120, length: 1.5 }, legs: [{ summary: { time: 120, length: 1.5 }, shape: 'encoded' }] } };
const setup = (data: unknown = route, status = 200) => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(data), { status }));
  return { provider: new ValhallaProvider('https://routing.example.test/api', 100, fetcher), fetcher };
};
afterEach(() => vi.useRealTimers());
describe('routing foundation (mocked HTTP)', () => {
  it('normalizes route, geometry and travel time without leaking provider data', async () => {
    const { provider, fetcher } = setup();
    expect(await provider.getRoute(request)).toEqual({ status: 'ok', provider: 'valhalla', distanceMeters: 1500, durationSeconds: 120, geometry: { encoding: 'polyline', precision: 6, segments: ['encoded'] }, legs: [{ origin, destination, distanceMeters: 1500, durationSeconds: 120, geometry: { encoding: 'polyline', precision: 6, segments: ['encoded'] } }] });
    expect(await provider.getTravelTime(request)).toEqual({ status: 'ok', distanceMeters: 1500, durationSeconds: 120 });
    expect(String(fetcher.mock.calls[0][0])).toBe('https://routing.example.test/api/route');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error' });
  });
  it('converts miles to meters for routes and matrices', async () => {
    const data = structuredClone(route);
    data.trip.units = 'miles';
    expect(await setup(data).provider.getRoute(request)).toMatchObject({ distanceMeters: 2414.016, durationSeconds: 120 });
    expect(await setup({ units: 'miles', sources_to_targets: [[{ from_index: 0, to_index: 0, time: 90, distance: 1 }]] }).provider.getMatrix({ origins: [origin], destinations: [destination], travelMode: 'driving' })).toMatchObject({ cells: [[{ distanceMeters: 1609.344, durationSeconds: 90 }]] });
  });
  it('checks health through a server-side GET and validates loaded tiles', async () => {
    const { provider, fetcher } = setup({ version: '3.6.0', tileset_last_modified: 1700000000 });
    expect(await provider.checkHealth()).toEqual({ status: 'ok', healthy: true, provider: 'valhalla' });
    expect(String(fetcher.mock.calls[0][0])).toBe('https://routing.example.test/api/status');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', body: undefined });
    expect(await setup({ version: '3.6.0', tileset_last_modified: 0 }).provider.checkHealth()).toMatchObject({ code: 'invalid_response' });
    expect(await setup({}, 503).provider.checkHealth()).toMatchObject({ code: 'http' });
  });
  it('prefers VALHALLA_URL while retaining the old configuration alias', () => {
    expect(getRoutingProvider({ VALHALLA_URL: 'https://routing.example.test', VALHALLA_BASE_URL: 'invalid' })).toMatchObject({ capabilities: { routing: true, matrix: true } });
  });
  it('preserves ordered waypoints and legs', async () => {
    const data = structuredClone(route);
    data.trip.legs.push(data.trip.legs[0], data.trip.legs[0]);
    const { provider, fetcher } = setup(data);
    const waypoint = { latitude: 40.5, longitude: -72.5 };
    const result = await provider.getRoute({ ...request, waypoints: [waypoint, origin] });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.legs.map(leg => leg.destination)).toEqual([waypoint, origin, destination]);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).locations).toEqual([{ lat: 40, lon: -73, type: 'break' }, { lat: 40.5, lon: -72.5, type: 'break' }, { lat: 40, lon: -73, type: 'break' }, { lat: 41, lon: -72, type: 'break' }]);
  });
  it('normalizes asymmetric matrices, zero values and unreachable cells', async () => {
    const { provider, fetcher } = setup({ units: 'kilometers', sources_to_targets: [[{ from_index: 0, to_index: 0, time: 0, distance: 0 }, { from_index: 0, to_index: 1, time: null, distance: null }], [{ from_index: 1, to_index: 0, time: 90, distance: 1.2 }, { from_index: 1, to_index: 1, time: 30, distance: 0.4 }]] });
    expect(await provider.getMatrix({ origins: [origin, destination], destinations: [origin, destination], travelMode: 'walking' })).toEqual({ status: 'ok', provider: 'valhalla', cells: [[{ status: 'ok', durationSeconds: 0, distanceMeters: 0 }, { status: 'unreachable' }], [{ status: 'ok', durationSeconds: 90, distanceMeters: 1200 }, { status: 'ok', durationSeconds: 30, distanceMeters: 400 }]] });
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({ costing: 'pedestrian', verbose: true, units: 'kilometers' });
  });
  it.each([{}, { trip: { ...route.trip, units: 'unknown' } }, { trip: { ...route.trip, legs: [] } }, { trip: { ...route.trip, summary: { time: -1, length: 3 } } }])('rejects malformed route response %j', async data => {
    expect(await setup(data).provider.getRoute(request)).toMatchObject({ status: 'error', code: 'invalid_response' });
  });
  it.each([{ units: 'kilometers', sources_to_targets: [] }, { units: 'kilometers', sources_to_targets: [[{ from_index: 1, to_index: 0, time: 10, distance: 1 }]] }, { units: 'kilometers', sources_to_targets: [[{ from_index: 0, to_index: 0, time: null, distance: 1 }]] }])('rejects malformed matrix response %j', async data => {
    expect(await setup(data).provider.getMatrix({ origins: [origin], destinations: [destination], travelMode: 'driving' })).toMatchObject({ status: 'error', code: 'invalid_response' });
  });
  it.each([170, 171, 441, 442])('reports unreachable code %i safely', async error_code => {
    expect(await setup({ error_code, error: 'private data' }, 400).provider.getRoute(request)).toMatchObject({ status: 'unreachable', reason: [171].includes(error_code) ? 'outside_coverage' : 'no_route' });
  });
  it.each([[429, 'rate_limited'], [500, 'http'], [401, 'http']])('handles HTTP %i', async (status, code) => {
    expect(await setup({ error: 'secret' }, status as number).provider.getRoute(request)).toMatchObject({ status: 'error', code });
  });
  it('sanitizes network errors', async () => {
    const { provider, fetcher } = setup();
    fetcher.mockRejectedValue(new Error('private endpoint and coordinates'));
    expect(await provider.getRoute(request)).toEqual({ status: 'error', code: 'network', message: 'Routing is unavailable. Please try again.' });
  });
  it('handles malformed JSON', async () => {
    const { provider, fetcher } = setup();
    fetcher.mockResolvedValue(new Response('not json'));
    expect(await provider.getRoute(request)).toMatchObject({ code: 'invalid_response' });
  });
  it('aborts timed-out requests', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new Error('aborted')))));
    const result = new ValhallaProvider('https://routing.example.test', 10, fetcher).getRoute(request);
    await vi.advanceTimersByTimeAsync(11);
    expect(await result).toMatchObject({ code: 'timeout' });
  });
  it('validates inputs and rejects unsupported departure times before HTTP', async () => {
    const { provider, fetcher } = setup();
    expect(await provider.getRoute({ ...request, origin: { latitude: 91, longitude: 0 } })).toMatchObject({ code: 'invalid_request' });
    expect(await provider.getRoute({ ...request, departureTime: '2026-10-04T10:00:00Z' })).toMatchObject({ code: 'unsupported' });
    expect(await provider.getMatrix({ origins: [], destinations: [origin], travelMode: 'cycling' })).toMatchObject({ code: 'invalid_request' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(provider.capabilities).toMatchObject({ matrix: true, trafficAware: false, departureTimeRouting: false, maxMatrixElements: 625 });
  });
  it('enforces route and matrix size bounds before HTTP', async () => {
    const { provider, fetcher } = setup();
    expect(await provider.getRoute({ ...request, waypoints: Array(19).fill(origin) })).toMatchObject({ code: 'invalid_request' });
    expect(await provider.getMatrix({ origins: Array(26).fill(origin), destinations: [destination], travelMode: 'driving' })).toMatchObject({ code: 'invalid_request' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('selects provider and validates configuration without leaking values', () => {
    expect(getRoutingProvider({ ROUTING_PROVIDER: 'valhalla', VALHALLA_BASE_URL: 'https://routing.example.test' })).toMatchObject({ capabilities: { routing: true, matrix: true } });
    expect(() => getRoutingProvider({ ROUTING_PROVIDER: 'google' })).toThrow('Unsupported ROUTING_PROVIDER');
    expect(() => getRoutingProvider({})).toThrow('Configure VALHALLA_URL');
    for (const url of ['file:///tmp/a', 'https://user:secret@example.test', 'https://example.test?secret=a']) expect(() => getRoutingProvider({ VALHALLA_BASE_URL: url })).toThrow('Invalid routing configuration');
    expect(() => getRoutingProvider({ VALHALLA_BASE_URL: 'https://example.test', VALHALLA_TIMEOUT_MS: 'NaN' })).toThrow('Invalid routing configuration');
  });
});
