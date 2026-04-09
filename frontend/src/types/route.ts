export type RouteStatus =
  | 'success'
  | 'unresolved_start'
  | 'unresolved_end'
  | 'ambiguous_start'
  | 'ambiguous_end'
  | 'no_route'
  | 'safety_escalation';

export interface RouteConstraints {
  requireAccessible: boolean;
  requireLitPath: boolean;
  escalateToPolice: boolean;
}

export interface SuggestedPlace {
  displayName: string;
  shortName?: string;
}

export interface PlaceMatch {
  displayName: string;
  shortName?: string;
  latitude: number;
  longitude: number;
  matchedBy: string;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  label?: string;
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

export interface RouteResponse {
  status: RouteStatus;
  message: string;
  constraints: RouteConstraints;
  route: RoutePoint[];
  instructions: RouteInstruction[];
  warnings: string[];
  accessibilityStatus?: AccessibilityStatus;
  matchedStart?: PlaceMatch;
  matchedEnd?: PlaceMatch;
  suggestions?: {
    start?: SuggestedPlace[];
    end?: SuggestedPlace[];
  };
  distanceMeters?: number;
  strategy?: 'strict' | 'lighting_fallback' | 'standard';
}
