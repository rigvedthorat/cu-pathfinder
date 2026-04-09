export interface RouteConstraints {
  requireAccessible: boolean;
  requireLitPath: boolean;
  escalateToPolice: boolean;
}

export type PlaceResolutionStatus = 'resolved' | 'ambiguous' | 'not_found';

export interface PlaceCandidate {
  elementId: string;
  nodeId: string;
  displayName: string;
  shortName?: string;
  latitude: number;
  longitude: number;
  aliases: string[];
  matchedBy: string;
  score: number;
}

export interface PlaceResolution {
  query: string;
  normalizedQuery: string;
  status: PlaceResolutionStatus;
  candidates: PlaceCandidate[];
  bestMatch?: PlaceCandidate;
  aliasApplied?: string;
  note?: string;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface RouteSegment {
  fromElementId: string;
  toElementId: string;
  distanceMeters: number;
  highway?: string;
  isAccessible?: boolean;
  isLit?: boolean;
  surface?: string;
  incline?: string;
  stepCount?: number;
  hasUnknownAccessibility: boolean;
  hasUnknownLighting: boolean;
}

export interface RouteInstruction {
  title: string;
  detail: string;
  distanceMeters?: number;
}

export interface AccessibilityStatus {
  level: 'confirmed' | 'best_effort';
  message: string;
}

export type RouteStrategy = 'strict' | 'lighting_fallback' | 'standard';

export type GraphRouteStatus =
  | 'success'
  | 'unresolved_start'
  | 'unresolved_end'
  | 'ambiguous_start'
  | 'ambiguous_end'
  | 'no_route';

export interface GraphRouteResult {
  status: GraphRouteStatus;
  constraints: RouteConstraints;
  startResolution: PlaceResolution;
  endResolution: PlaceResolution;
  matchedStart?: PlaceCandidate;
  matchedEnd?: PlaceCandidate;
  route: RoutePoint[];
  segments: RouteSegment[];
  instructions: RouteInstruction[];
  warnings: string[];
  accessibilityStatus?: AccessibilityStatus;
  distanceMeters: number;
  strategy?: RouteStrategy;
}
