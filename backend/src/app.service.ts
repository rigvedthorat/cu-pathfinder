import { Injectable, Logger } from '@nestjs/common';
import { AiService } from './ai/ai.service';
import { GraphService } from './graph/graph.service';
import {
  AccessibilityStatus,
  GraphRouteResult,
  PlaceCandidate,
  PlaceResolution,
  RouteConstraints,
  RouteInstruction,
  RoutePoint,
  RouteStrategy,
} from './graph/graph.types';
import { redactPrompt } from './common/log-redact'

interface SuggestedPlace {
  displayName: string;
  shortName?: string;
}

export interface RouteApiResponse {
  status: GraphRouteResult['status'] | 'safety_escalation';
  message: string;
  constraints: RouteConstraints;
  route: RoutePoint[];
  instructions: RouteInstruction[];
  warnings: string[];
  accessibilityStatus?: AccessibilityStatus;
  matchedStart?: PlaceCandidate;
  matchedEnd?: PlaceCandidate;
  suggestions?: {
    start?: SuggestedPlace[];
    end?: SuggestedPlace[];
  };
  distanceMeters?: number;
  strategy?: RouteStrategy;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly graphService: GraphService,
    private readonly aiService: AiService,
  ) {}

  getHello(): string {
    return 'Welcome to the CU Pathfinder API.';
  }

  async getRouteFromNaturalLanguage(
    userPrompt: string,
    startNode: string,
    endNode: string,
  ): Promise<RouteApiResponse> {
    this.logger.log(`Evaluating request 
      ${JSON.stringify(redactPrompt(userPrompt))}`);

    const constraints = await this.aiService.evaluateRoutingRequest(userPrompt);
    this.logger.log(`Constraints extracted: ${JSON.stringify(constraints)}`);

    if (constraints.escalateToPolice) {
      return {
        status: 'safety_escalation',
        message:
          'It sounds like you might be in immediate danger. Please contact CU Police at 303-492-6666 or dial 911 immediately.',
        constraints,
        route: [],
        instructions: [],
        warnings: ['High risk scenario detected.'],
      };
    }

    const routeResult = await this.graphService.getRoute(
      startNode,
      endNode,
      constraints,
    );

    return this.buildApiResponse(routeResult);
  }

  async getDatabaseHealth() {
    const isDbConnected = await this.graphService.getDatabaseHealth();
    return {
      status: 'ok',
      database: isDbConnected ? 'connected' : 'disconnected',
    };
  }

  private buildApiResponse(routeResult: GraphRouteResult): RouteApiResponse {
    switch (routeResult.status) {
      case 'unresolved_start':
        return {
          status: routeResult.status,
          message: `I could not match the starting location "${routeResult.startResolution.query}" to a campus place.`,
          constraints: routeResult.constraints,
          route: [],
          instructions: [],
          warnings: routeResult.warnings,
          suggestions: {
            start: this.toSuggestedPlaces(routeResult.startResolution),
          },
        };
      case 'ambiguous_start':
        return {
          status: routeResult.status,
          message: `I found multiple possible matches for the starting location "${routeResult.startResolution.query}".`,
          constraints: routeResult.constraints,
          route: [],
          instructions: [],
          warnings: routeResult.warnings,
          suggestions: {
            start: this.toSuggestedPlaces(routeResult.startResolution),
          },
        };
      case 'unresolved_end':
        return {
          status: routeResult.status,
          message: `I could not match the destination "${routeResult.endResolution.query}" to a campus place.`,
          constraints: routeResult.constraints,
          route: [],
          instructions: [],
          warnings: routeResult.warnings,
          matchedStart: routeResult.matchedStart,
          suggestions: {
            end: this.toSuggestedPlaces(routeResult.endResolution),
          },
        };
      case 'ambiguous_end':
        return {
          status: routeResult.status,
          message: `I found multiple possible matches for the destination "${routeResult.endResolution.query}".`,
          constraints: routeResult.constraints,
          route: [],
          instructions: [],
          warnings: routeResult.warnings,
          matchedStart: routeResult.matchedStart,
          suggestions: {
            end: this.toSuggestedPlaces(routeResult.endResolution),
          },
        };
      case 'no_route':
        return {
          status: routeResult.status,
          message: this.buildNoRouteMessage(routeResult.constraints),
          constraints: routeResult.constraints,
          route: [],
          instructions: [],
          warnings: routeResult.warnings,
          matchedStart: routeResult.matchedStart,
          matchedEnd: routeResult.matchedEnd,
        };
      case 'success':
        return {
          status: routeResult.status,
          message: this.buildSuccessMessage(routeResult),
          constraints: routeResult.constraints,
          route: routeResult.route,
          instructions: routeResult.instructions,
          warnings: routeResult.warnings,
          accessibilityStatus: routeResult.accessibilityStatus,
          matchedStart: routeResult.matchedStart,
          matchedEnd: routeResult.matchedEnd,
          distanceMeters: routeResult.distanceMeters,
          strategy: routeResult.strategy,
        };
    }
  }

  private buildSuccessMessage(routeResult: GraphRouteResult): string {
    const matchedStartName =
      routeResult.matchedStart?.displayName ??
      routeResult.startResolution.query;
    const matchedEndName =
      routeResult.matchedEnd?.displayName ?? routeResult.endResolution.query;

    if (
      routeResult.constraints.requireLitPath &&
      !routeResult.constraints.requireAccessible
    ) {
      return `Here is a route from ${matchedStartName} to ${matchedEndName} that prefers lit segments when the map data allows it.`;
    }

    return `Here is your route from ${matchedStartName} to ${matchedEndName}.`;
  }

  private buildNoRouteMessage(constraints: RouteConstraints): string {
    if (constraints.requireAccessible && constraints.requireLitPath) {
      return 'I matched both places, but I could not find a route that satisfies both the accessibility and lighting constraints.';
    }

    if (constraints.requireAccessible) {
      return 'I matched both places, but I could not find an accessibility-safe route with the current map data.';
    }

    if (constraints.requireLitPath) {
      return 'I matched both places, but I could not find a route with confirmed lighting for the entire trip.';
    }

    return 'I matched both places, but I could not find a walkable route between them.';
  }

  private toSuggestedPlaces(
    resolution: PlaceResolution,
  ): SuggestedPlace[] | undefined {
    if (resolution.candidates.length === 0) {
      return undefined;
    }

    return resolution.candidates.map((candidate) => ({
      displayName: candidate.displayName,
      shortName: candidate.shortName,
    }));
  }
}
