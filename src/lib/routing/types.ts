/** Provider-independent routing domain. Distances are meters; durations are seconds. */
export type Coordinate = { latitude: number; longitude: number };
export type TravelMode = 'driving' | 'cycling' | 'walking';
export type RouteRequest = {
  origin: Coordinate; destination: Coordinate; waypoints?: Coordinate[];
  travelMode: TravelMode; /** RFC3339 instant with offset, only when supported. */ departureTime?: string;
};
export type MatrixRequest = { origins: Coordinate[]; destinations: Coordinate[]; travelMode: TravelMode; departureTime?: string };
export type RoutingErrorCode = 'invalid_request' | 'unsupported' | 'timeout' | 'network' | 'http' | 'rate_limited' | 'invalid_response';
export type RoutingFailure = { status: 'error'; code: RoutingErrorCode; message: string; retryAfterSeconds?: number } | { status: 'unreachable'; reason?: 'no_route' | 'outside_coverage'; message?: string };
export type RoutingResult<T> = ({ status: 'ok' } & T) | RoutingFailure;
export type RouteGeometry = { encoding: 'polyline'; precision: number; segments: string[] };
export type RouteLeg = { origin: Coordinate; destination: Coordinate; distanceMeters: number; durationSeconds: number; geometry?: RouteGeometry };
export type TravelTimeResult = RoutingResult<{ distanceMeters: number; durationSeconds: number }>;
export type RouteResult = RoutingResult<{ distanceMeters: number; durationSeconds: number; legs: RouteLeg[]; geometry?: RouteGeometry; provider: string }>;
export type MatrixCell = RoutingResult<{ durationSeconds: number; distanceMeters?: number }>;
/** cells[originIndex][destinationIndex], including zero-duration diagonal cells. */
export type MatrixResult = RoutingResult<{ cells: MatrixCell[][]; provider: string }>;
export type RoutingProviderCapabilities = {
  routing: boolean; matrix: boolean; waypoints: boolean; departureTimeRouting: boolean;
  trafficAware: boolean; historicalTraffic: boolean; predictiveTraffic: boolean;
  travelModes: readonly TravelMode[]; maxRouteLocations: number;
  maxMatrixOrigins: number; maxMatrixDestinations: number; maxMatrixElements: number;
};
export type RoutingHealthResult = { status: 'ok'; healthy: true; provider: string } | RoutingFailure;
export interface RoutingProvider {
  readonly capabilities: RoutingProviderCapabilities;
  checkHealth(): Promise<RoutingHealthResult>;
  getRoute(request: RouteRequest): Promise<RouteResult>;
  getTravelTime(request: RouteRequest): Promise<TravelTimeResult>;
  getMatrix(request: MatrixRequest): Promise<MatrixResult>;
}
