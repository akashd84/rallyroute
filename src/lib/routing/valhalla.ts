import 'server-only';
import { z } from 'zod';
import { providerRetrySeconds } from './usage-controls';
import type { Coordinate, MatrixRequest, MatrixResult, RouteRequest, RouteResult, RoutingFailure, RoutingProvider, RoutingProviderCapabilities, RoutingHealthResult, TravelTimeResult } from './types';

const coordinate = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const common = { travelMode: z.enum(['driving', 'cycling', 'walking']), departureTime: z.iso.datetime({ offset: true }).optional() };
const routeRequest = z.object({ ...common, origin: coordinate, destination: coordinate, waypoints: z.array(coordinate).max(18).optional() });
const matrixRequest = z.object({ ...common, origins: z.array(coordinate).min(1).max(25), destinations: z.array(coordinate).min(1).max(25) });
const nonnegative = z.number().finite().nonnegative();
const summary = z.object({ time: nonnegative, length: nonnegative });
const units = z.enum(['kilometers', 'miles']);
const meters = (distance: number, unit: 'kilometers' | 'miles') => distance * (unit === 'miles' ? 1609.344 : 1000);
const healthResponse = z.object({ version: z.string().min(1), tileset_last_modified: z.number().positive() });
const routeResponse = z.object({ trip: z.object({ status: z.literal(0), units, summary, legs: z.array(z.object({ summary, shape: z.string().min(1).optional() })) }) });
const matrixResponse = z.object({ units, sources_to_targets: z.array(z.array(z.object({ from_index: z.number().int().nonnegative(), to_index: z.number().int().nonnegative(), time: nonnegative.nullable(), distance: nonnegative.nullable() }))) });
const providerError = z.object({ error_code: z.number().int() });
const costing = { driving: 'auto', cycling: 'bicycle', walking: 'pedestrian' } as const;
const point = (value: Coordinate) => ({ lat: value.latitude, lon: value.longitude });
const failure = (code: Exclude<RoutingFailure, { status: 'unreachable' }>['code']): RoutingFailure => ({ status: 'error', code, message: ({ invalid_request: 'Check the routing inputs and request limits.', unsupported: 'This routing feature is not supported.', timeout: 'Routing timed out. Please try again.', network: 'Routing is unavailable. Please try again.', http: 'Routing is unavailable. Please try again.', rate_limited: 'Routing is busy. Please try again later.', invalid_response: 'Routing returned an unusable result. Please try again.' })[code] });

/** Internal adapter; application callers use getRoutingProvider(). Never log coordinates or response bodies. */
export class ValhallaProvider implements RoutingProvider {
  readonly capabilities: RoutingProviderCapabilities = Object.freeze({ routing: true, matrix: true, waypoints: true, departureTimeRouting: false, trafficAware: false, historicalTraffic: false, predictiveTraffic: false, travelModes: Object.freeze(['driving', 'cycling', 'walking'] as const), maxRouteLocations: 20, maxMatrixOrigins: 25, maxMatrixDestinations: 25, maxMatrixElements: 625 });
  private readonly baseUrl: URL;
  constructor(baseUrl: string, private readonly timeoutMs = 10000, private readonly fetcher: typeof fetch = fetch) {
    try {
      const url = new URL(baseUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error();
      url.pathname = url.pathname.replace(/\/?$/, '/');
      this.baseUrl = url;
    } catch { throw new Error('Invalid routing configuration. Check VALHALLA_URL and VALHALLA_TIMEOUT_MS.'); }
  }
  private async send(path: string, body?: unknown): Promise<{ status: 'ok'; data: unknown } | RoutingFailure> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(new URL(path, this.baseUrl), { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store', redirect: 'error' });
      if (response.status === 429) return { status: 'error', code: 'rate_limited', message: 'Routing is busy. Please try again later.', retryAfterSeconds: providerRetrySeconds(response.headers.get('retry-after')) };
      if (response.status >= 500) return failure('http');
      let data: unknown;
      try { data = await response.json(); } catch { return failure(controller.signal.aborted ? 'timeout' : response.ok ? 'invalid_response' : 'http'); }
      if (controller.signal.aborted) return failure('timeout');
      const error = providerError.safeParse(data);
      if (error.success && [171].includes(error.data.error_code)) return { status: 'unreachable', reason: 'outside_coverage', message: 'No routable road was found near these coordinates. Check the configured routing coverage.' };
      if (error.success && [170, 441, 442].includes(error.data.error_code)) return { status: 'unreachable', reason: 'no_route', message: 'No road route was found between these locations.' };
      if (!response.ok || error.success) return failure('http');
      return { status: 'ok', data };
    } catch { return failure(controller.signal.aborted ? 'timeout' : 'network'); }
    finally { clearTimeout(timer); }
  }
  async checkHealth(): Promise<RoutingHealthResult> {
    const response = await this.send('status');
    if (response.status !== 'ok') return response;
    if (!healthResponse.safeParse(response.data).success) return failure('invalid_response');
    return { status: 'ok', healthy: true, provider: 'valhalla' };
  }
  async getRoute(request: RouteRequest): Promise<RouteResult> {
    const parsed = routeRequest.safeParse(request);
    if (!parsed.success) return failure('invalid_request');
    const input = parsed.data;
    if (input.departureTime !== undefined) return failure('unsupported');
    const locations = [input.origin, ...(input.waypoints ?? []), input.destination];
    const response = await this.send('route', { locations: locations.map(value => ({ ...point(value), type: 'break' })), costing: costing[input.travelMode], units: 'kilometers' });
    if (response.status !== 'ok') return response;
    const result = routeResponse.safeParse(response.data);
    if (!result.success || result.data.trip.legs.length !== locations.length - 1) return failure('invalid_response');
    const trip = result.data.trip;
    const legs = trip.legs.map((leg, index) => ({ origin: locations[index], destination: locations[index + 1], durationSeconds: leg.summary.time, distanceMeters: meters(leg.summary.length, trip.units), ...(leg.shape ? { geometry: { encoding: 'polyline' as const, precision: 6, segments: [leg.shape] } } : {}) }));
    return { status: 'ok', provider: 'valhalla', durationSeconds: trip.summary.time, distanceMeters: meters(trip.summary.length, trip.units), legs, ...(trip.legs.every(leg => leg.shape) ? { geometry: { encoding: 'polyline', precision: 6, segments: trip.legs.map(leg => leg.shape!) } } : {}) };
  }
  async getTravelTime(request: RouteRequest): Promise<TravelTimeResult> {
    const route = await this.getRoute(request);
    return route.status === 'ok' ? { status: 'ok', distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds } : route;
  }
  async getMatrix(request: MatrixRequest): Promise<MatrixResult> {
    const parsed = matrixRequest.safeParse(request);
    if (!parsed.success) return failure('invalid_request');
    const input = parsed.data;
    if (input.departureTime !== undefined) return failure('unsupported');
    const response = await this.send('sources_to_targets', { sources: input.origins.map(point), targets: input.destinations.map(point), costing: costing[input.travelMode], units: 'kilometers', verbose: true });
    if (response.status !== 'ok') return response;
    const result = matrixResponse.safeParse(response.data);
    if (!result.success) return failure('invalid_response');
    const rows = result.data.sources_to_targets;
    if (rows.length !== input.origins.length || rows.some((row, i) => row.length !== input.destinations.length || row.some((cell, j) => cell.from_index !== i || cell.to_index !== j || (cell.time === null) !== (cell.distance === null)))) return failure('invalid_response');
    return { status: 'ok', provider: 'valhalla', cells: rows.map(row => row.map(cell => cell.time === null ? { status: 'unreachable' as const } : { status: 'ok' as const, durationSeconds: cell.time, distanceMeters: meters(cell.distance!, result.data.units) })) };
  }
}
