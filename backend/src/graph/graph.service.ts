import { Injectable, Logger } from '@nestjs/common';
import { isInt } from 'neo4j-driver';
import { Neo4jService } from '../neo4j/neo4j.service';
import {
  AccessibilityStatus,
  GraphRouteResult,
  PlaceCandidate,
  PlaceResolution,
  RouteConstraints,
  RouteInstruction,
  RoutePoint,
  RouteSegment,
  RouteStrategy,
} from './graph.types';

type Neo4jRecord = {
  get: (key: string) => unknown;
};

interface GraphNode {
  elementId: string;
  latitude: number;
  longitude: number;
  label?: string;
}

interface GraphEdge {
  fromElementId: string;
  toElementId: string;
  distanceMeters: number;
  highway?: string;
  isAccessible?: boolean;
  isLit?: boolean;
  surface?: string;
  incline?: string;
  stepCount?: number;
}

interface GraphSnapshot {
  nodesByElementId: Map<string, GraphNode>;
  adjacency: Map<string, GraphEdge[]>;
  loadedAt: number;
}

interface CandidateSearchContext {
  normalizedQuery: string;
  expandedQueries: string[];
  aliasApplied?: string;
  note?: string;
}

interface RouteSearchOptions {
  requireAccessible: boolean;
  preferLighting: boolean;
  strictLighting: boolean;
  strategy: RouteStrategy;
}

interface PathSearchResult {
  route: RoutePoint[];
  segments: RouteSegment[];
  instructions: RouteInstruction[];
  warnings: string[];
  accessibilityStatus?: AccessibilityStatus;
  distanceMeters: number;
  strategy: RouteStrategy;
}

interface QueueItem<T> {
  priority: number;
  value: T;
}

const GRAPH_CACHE_TTL_MS = 5 * 60 * 1000;

const CAMPUS_ALIAS_OVERRIDES: Record<
  string,
  { canonical: string; note?: string }
> = {
  c4c: {
    canonical: 'Center for Community (C4C)',
  },
  umc: {
    canonical: 'University Memorial Center',
  },
  norlin: {
    canonical: 'Norlin Library',
  },
  'engineering center': {
    canonical: 'Mechanical Wing',
    note: 'The campus data does not expose one shared Engineering Center entrance, so this query is anchored to the Mechanical Wing entrance. Use a specific wing name for the most precise route.',
  },
  'eng center': {
    canonical: 'Mechanical Wing',
    note: 'The campus data does not expose one shared Engineering Center entrance, so this query is anchored to the Mechanical Wing entrance. Use a specific wing name for the most precise route.',
  },
  'engr center': {
    canonical: 'Mechanical Wing',
    note: 'The campus data does not expose one shared Engineering Center entrance, so this query is anchored to the Mechanical Wing entrance. Use a specific wing name for the most precise route.',
  },
};

class MinPriorityQueue<T> {
  private readonly heap: Array<QueueItem<T>> = [];

  push(value: T, priority: number) {
    this.heap.push({ value, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): QueueItem<T> | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    const first = this.heap[0];
    const last = this.heap.pop();

    if (last && this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(index: number) {
    let currentIndex = index;

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);

      if (this.heap[parentIndex].priority <= this.heap[currentIndex].priority) {
        break;
      }

      [this.heap[parentIndex], this.heap[currentIndex]] = [
        this.heap[currentIndex],
        this.heap[parentIndex],
      ];
      currentIndex = parentIndex;
    }
  }

  private bubbleDown(index: number) {
    let currentIndex = index;

    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = currentIndex * 2 + 2;
      let smallestIndex = currentIndex;

      if (
        leftIndex < this.heap.length &&
        this.heap[leftIndex].priority < this.heap[smallestIndex].priority
      ) {
        smallestIndex = leftIndex;
      }

      if (
        rightIndex < this.heap.length &&
        this.heap[rightIndex].priority < this.heap[smallestIndex].priority
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === currentIndex) {
        return;
      }

      [this.heap[currentIndex], this.heap[smallestIndex]] = [
        this.heap[smallestIndex],
        this.heap[currentIndex],
      ];
      currentIndex = smallestIndex;
    }
  }
}

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);
  private graphCache: GraphSnapshot | null = null;

  constructor(private readonly neo4jService: Neo4jService) {}

  async getDatabaseHealth(): Promise<boolean> {
    const session = this.neo4jService.getReadSession();
    try {
      await session.run('RETURN 1 AS result');
      return true;
    } catch (error) {
      this.logger.error('Failed to connect to neo4j', error);
      return false;
    } finally {
      await session.close();
    }
  }

  async getRoute(
    startQuery: string,
    endQuery: string,
    constraints: RouteConstraints,
  ): Promise<GraphRouteResult> {
    const startResolution = await this.resolvePlace(startQuery);
    if (startResolution.status === 'not_found') {
      return {
        status: 'unresolved_start',
        constraints,
        startResolution,
        endResolution: this.createEmptyResolution(endQuery),
        route: [],
        segments: [],
        instructions: [],
        warnings: [],
        distanceMeters: 0,
      };
    }

    if (startResolution.status === 'ambiguous') {
      return {
        status: 'ambiguous_start',
        constraints,
        startResolution,
        endResolution: this.createEmptyResolution(endQuery),
        route: [],
        segments: [],
        instructions: [],
        warnings: [],
        distanceMeters: 0,
      };
    }

    const endResolution = await this.resolvePlace(endQuery);
    if (endResolution.status === 'not_found') {
      return {
        status: 'unresolved_end',
        constraints,
        startResolution,
        endResolution,
        matchedStart: startResolution.bestMatch,
        route: [],
        segments: [],
        instructions: [],
        warnings: [],
        distanceMeters: 0,
      };
    }

    if (endResolution.status === 'ambiguous') {
      return {
        status: 'ambiguous_end',
        constraints,
        startResolution,
        endResolution,
        matchedStart: startResolution.bestMatch,
        route: [],
        segments: [],
        instructions: [],
        warnings: [],
        distanceMeters: 0,
      };
    }

    const matchedStart = startResolution.bestMatch;
    const matchedEnd = endResolution.bestMatch;

    if (!matchedStart || !matchedEnd) {
      return {
        status: 'no_route',
        constraints,
        startResolution,
        endResolution,
        route: [],
        segments: [],
        instructions: [],
        warnings: [],
        distanceMeters: 0,
      };
    }

    const pathResult = await this.findPathBetweenPlaces(
      matchedStart,
      matchedEnd,
      constraints,
    );

    if (!pathResult) {
      return {
        status: 'no_route',
        constraints,
        startResolution,
        endResolution,
        matchedStart,
        matchedEnd,
        route: [],
        segments: [],
        instructions: [],
        warnings: [
          'I matched both places, but I could not find a route that satisfies the current constraints.',
        ],
        distanceMeters: 0,
      };
    }

    const warnings = [...pathResult.warnings];
    if (startResolution.note) {
      warnings.unshift(startResolution.note);
    }
    if (endResolution.note) {
      warnings.unshift(endResolution.note);
    }

    return {
      status: 'success',
      constraints,
      startResolution,
      endResolution,
      matchedStart,
      matchedEnd,
      route: pathResult.route,
      segments: pathResult.segments,
      instructions: pathResult.instructions,
      warnings,
      accessibilityStatus: pathResult.accessibilityStatus,
      distanceMeters: pathResult.distanceMeters,
      strategy: pathResult.strategy,
    };
  }

  private createEmptyResolution(query: string): PlaceResolution {
    return {
      query,
      normalizedQuery: this.normalizeSearchTerm(query),
      status: 'not_found',
      candidates: [],
    };
  }

  private async resolvePlace(query: string): Promise<PlaceResolution> {
    const searchContext = this.buildCandidateSearchContext(query);
    const candidates = await this.searchPlaceCandidates(searchContext);

    if (candidates.length === 0) {
      return {
        query,
        normalizedQuery: searchContext.normalizedQuery,
        status: 'not_found',
        candidates: [],
        aliasApplied: searchContext.aliasApplied,
        note: searchContext.note,
      };
    }

    const [bestCandidate, secondCandidate] = candidates;
    const aliasWasApplied = Boolean(searchContext.aliasApplied);
    const isConfidentMatch =
      candidates.length === 1 ||
      (bestCandidate.score >= 95 &&
        (!secondCandidate ||
          bestCandidate.score - secondCandidate.score >= 8)) ||
      (bestCandidate.score >= 85 &&
        (!secondCandidate ||
          bestCandidate.score - secondCandidate.score >= 15)) ||
      (aliasWasApplied && bestCandidate.score >= 80);

    return {
      query,
      normalizedQuery: searchContext.normalizedQuery,
      status: isConfidentMatch ? 'resolved' : 'ambiguous',
      candidates,
      bestMatch: isConfidentMatch ? bestCandidate : undefined,
      aliasApplied: searchContext.aliasApplied,
      note: searchContext.note,
    };
  }

  private buildCandidateSearchContext(query: string): CandidateSearchContext {
    const normalizedQuery = this.normalizeSearchTerm(query);
    const aliasOverride = CAMPUS_ALIAS_OVERRIDES[normalizedQuery];
    const expandedQueries = new Set<string>();

    if (normalizedQuery) {
      expandedQueries.add(normalizedQuery);
    }

    if (aliasOverride) {
      expandedQueries.add(this.normalizeSearchTerm(aliasOverride.canonical));
    }

    if (!normalizedQuery.includes(' ') && normalizedQuery.length >= 4) {
      expandedQueries.add(normalizedQuery);
    }

    return {
      normalizedQuery,
      expandedQueries: [...expandedQueries],
      aliasApplied: aliasOverride?.canonical,
      note: aliasOverride?.note,
    };
  }

  private async searchPlaceCandidates(
    searchContext: CandidateSearchContext,
  ): Promise<PlaceCandidate[]> {
    const session = this.neo4jService.getReadSession();

    try {
      const query = `
        MATCH (n:PathNode)
        WHERE EXISTS((n)-[:CONNECTS_TO]-())
        WITH DISTINCT n,
          coalesce(n.place_name, n.building_name, n.name, '') AS placeName,
          coalesce(n.place_short_name, n.short_name, '') AS placeShortName,
          coalesce(n.search_terms, []) AS searchTerms,
          coalesce(n.tags, '') AS tags
        WHERE ANY(candidateQuery IN $candidateQueries WHERE
          toLower(placeName) CONTAINS candidateQuery
          OR toLower(placeShortName) = candidateQuery
          OR ANY(term IN searchTerms WHERE toLower(term) CONTAINS candidateQuery OR candidateQuery CONTAINS toLower(term))
          OR toLower(tags) CONTAINS candidateQuery
        )
        RETURN
          elementId(n) AS elementId,
          toString(n.id) AS nodeId,
          n.latitude AS latitude,
          n.longitude AS longitude,
          placeName,
          placeShortName,
          searchTerms,
          tags
        LIMIT 40
      `;

      const result = await session.run(query, {
        candidateQueries: searchContext.expandedQueries,
      });

      const records = result.records as Neo4jRecord[];
      const candidates = records
        .map((record) => this.buildPlaceCandidate(record, searchContext))
        .filter((candidate): candidate is PlaceCandidate => candidate !== null);

      const dedupedCandidates = new Map<string, PlaceCandidate>();

      for (const candidate of candidates) {
        const existingCandidate = dedupedCandidates.get(candidate.displayName);
        if (!existingCandidate || candidate.score > existingCandidate.score) {
          dedupedCandidates.set(candidate.displayName, candidate);
        }
      }

      return [...dedupedCandidates.values()]
        .sort((leftCandidate, rightCandidate) => {
          if (rightCandidate.score !== leftCandidate.score) {
            return rightCandidate.score - leftCandidate.score;
          }

          return leftCandidate.displayName.localeCompare(
            rightCandidate.displayName,
          );
        })
        .slice(0, 5);
    } catch (error) {
      this.logger.error(
        `Failed to resolve place for query "${searchContext.normalizedQuery}"`,
        error,
      );
      return [];
    } finally {
      await session.close();
    }
  }

  private buildPlaceCandidate(
    record: Neo4jRecord,
    searchContext: CandidateSearchContext,
  ): PlaceCandidate | null {
    const elementId = this.toStringValue(record.get('elementId'));
    const nodeId = this.toStringValue(record.get('nodeId'));
    const latitude = this.toNumber(record.get('latitude'));
    const longitude = this.toNumber(record.get('longitude'));
    const placeName = this.toStringValue(record.get('placeName'));
    const placeShortName = this.toStringValue(record.get('placeShortName'));
    const storedSearchTerms = this.toStringArray(record.get('searchTerms'));
    const rawTags = this.toStringValue(record.get('tags'));
    const parsedTags = this.parseJsonObject(rawTags);
    const tagName = this.toStringValue(parsedTags.name);
    const tagShortName = this.toStringValue(parsedTags.short_name);

    if (
      !elementId ||
      !nodeId ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return null;
    }

    const displayName =
      placeName ||
      tagName ||
      placeShortName ||
      tagShortName ||
      `Path node ${nodeId}`;
    const shortName = placeShortName || tagShortName || undefined;
    const aliases = this.uniqueStrings(
      storedSearchTerms,
      displayName,
      shortName,
      tagName,
      tagShortName,
    );
    const score = this.scoreCandidate(
      displayName,
      shortName,
      aliases,
      rawTags,
      searchContext,
    );
    const matchedBy = this.describeMatchReason(
      displayName,
      shortName,
      aliases,
      rawTags,
      searchContext,
    );

    return {
      elementId,
      nodeId,
      displayName,
      shortName,
      latitude,
      longitude,
      aliases,
      matchedBy,
      score,
    };
  }

  private scoreCandidate(
    displayName: string,
    shortName: string | undefined,
    aliases: string[],
    rawTags: string,
    searchContext: CandidateSearchContext,
  ): number {
    const normalizedDisplayName = this.normalizeSearchTerm(displayName);
    const normalizedShortName = shortName
      ? this.normalizeSearchTerm(shortName)
      : '';
    const normalizedAliases = aliases.map((alias) =>
      this.normalizeSearchTerm(alias),
    );
    const normalizedTags = rawTags.toLowerCase();
    let score = 0;

    for (const candidateQuery of searchContext.expandedQueries) {
      if (normalizedShortName && normalizedShortName === candidateQuery) {
        score = Math.max(score, 100);
      }

      if (normalizedDisplayName === candidateQuery) {
        score = Math.max(score, 95);
      }

      if (normalizedAliases.includes(candidateQuery)) {
        score = Math.max(score, 92);
      }

      if (normalizedDisplayName.includes(candidateQuery)) {
        score = Math.max(score, 82);
      }

      if (
        normalizedAliases.some(
          (alias) =>
            alias.includes(candidateQuery) || candidateQuery.includes(alias),
        )
      ) {
        score = Math.max(score, 78);
      }

      if (normalizedTags.includes(candidateQuery)) {
        score = Math.max(score, 68);
      }
    }

    return score;
  }

  private describeMatchReason(
    displayName: string,
    shortName: string | undefined,
    aliases: string[],
    rawTags: string,
    searchContext: CandidateSearchContext,
  ): string {
    const normalizedDisplayName = this.normalizeSearchTerm(displayName);
    const normalizedShortName = shortName
      ? this.normalizeSearchTerm(shortName)
      : '';
    const normalizedAliases = aliases.map((alias) =>
      this.normalizeSearchTerm(alias),
    );
    const normalizedTags = rawTags.toLowerCase();

    for (const candidateQuery of searchContext.expandedQueries) {
      if (normalizedShortName && normalizedShortName === candidateQuery) {
        return 'short name';
      }

      if (normalizedDisplayName === candidateQuery) {
        return 'exact name';
      }

      if (normalizedAliases.includes(candidateQuery)) {
        return 'stored alias';
      }

      if (normalizedDisplayName.includes(candidateQuery)) {
        return 'partial name';
      }

      if (normalizedTags.includes(candidateQuery)) {
        return 'raw map tags';
      }
    }

    return 'candidate match';
  }

  private async findPathBetweenPlaces(
    startPlace: PlaceCandidate,
    endPlace: PlaceCandidate,
    constraints: RouteConstraints,
  ): Promise<PathSearchResult | null> {
    const graph = await this.getWalkingGraph();
    const routeStrategies = this.buildRouteSearchStrategies(constraints);

    for (const strategy of routeStrategies) {
      const pathResult = this.runAStarSearch(
        graph,
        startPlace,
        endPlace,
        constraints,
        strategy,
      );

      if (pathResult) {
        return pathResult;
      }
    }

    return null;
  }

  private buildRouteSearchStrategies(
    constraints: RouteConstraints,
  ): RouteSearchOptions[] {
    if (constraints.requireAccessible && constraints.requireLitPath) {
      return [
        {
          requireAccessible: true,
          preferLighting: true,
          strictLighting: true,
          strategy: 'strict',
        },
        {
          requireAccessible: true,
          preferLighting: true,
          strictLighting: false,
          strategy: 'lighting_fallback',
        },
      ];
    }

    if (constraints.requireAccessible) {
      return [
        {
          requireAccessible: true,
          preferLighting: false,
          strictLighting: false,
          strategy: 'strict',
        },
      ];
    }

    if (constraints.requireLitPath) {
      return [
        {
          requireAccessible: false,
          preferLighting: true,
          strictLighting: true,
          strategy: 'strict',
        },
        {
          requireAccessible: false,
          preferLighting: true,
          strictLighting: false,
          strategy: 'lighting_fallback',
        },
      ];
    }

    return [
      {
        requireAccessible: false,
        preferLighting: false,
        strictLighting: false,
        strategy: 'standard',
      },
    ];
  }

  private runAStarSearch(
    graph: GraphSnapshot,
    startPlace: PlaceCandidate,
    endPlace: PlaceCandidate,
    constraints: RouteConstraints,
    options: RouteSearchOptions,
  ): PathSearchResult | null {
    const frontier = new MinPriorityQueue<string>();
    const gScore = new Map<string, number>([[startPlace.elementId, 0]]);
    const cameFrom = new Map<string, string>();
    const edgeUsedToReachNode = new Map<string, GraphEdge>();
    frontier.push(
      startPlace.elementId,
      this.estimateRemainingDistance(
        graph,
        startPlace.elementId,
        endPlace.elementId,
      ),
    );

    while (frontier.size > 0) {
      const currentItem = frontier.pop();
      if (!currentItem) {
        break;
      }

      const currentElementId = currentItem.value;
      if (currentElementId === endPlace.elementId) {
        return this.reconstructPath(
          graph,
          cameFrom,
          edgeUsedToReachNode,
          startPlace,
          endPlace,
          constraints,
          options,
        );
      }

      const currentDistance =
        gScore.get(currentElementId) ?? Number.POSITIVE_INFINITY;
      const outgoingEdges = graph.adjacency.get(currentElementId) ?? [];

      for (const edge of outgoingEdges) {
        const edgeCost = this.calculateEdgeCost(edge, options);
        if (!Number.isFinite(edgeCost)) {
          continue;
        }

        const nextDistance = currentDistance + edgeCost;
        const bestKnownDistance =
          gScore.get(edge.toElementId) ?? Number.POSITIVE_INFINITY;

        if (nextDistance < bestKnownDistance) {
          gScore.set(edge.toElementId, nextDistance);
          cameFrom.set(edge.toElementId, currentElementId);
          edgeUsedToReachNode.set(edge.toElementId, edge);

          const estimatedTotalDistance =
            nextDistance +
            this.estimateRemainingDistance(
              graph,
              edge.toElementId,
              endPlace.elementId,
            );
          frontier.push(edge.toElementId, estimatedTotalDistance);
        }
      }
    }

    return null;
  }

  private reconstructPath(
    graph: GraphSnapshot,
    cameFrom: Map<string, string>,
    edgeUsedToReachNode: Map<string, GraphEdge>,
    startPlace: PlaceCandidate,
    endPlace: PlaceCandidate,
    constraints: RouteConstraints,
    options: RouteSearchOptions,
  ): PathSearchResult | null {
    const nodeOrder: string[] = [endPlace.elementId];
    const rawEdges: GraphEdge[] = [];
    let cursor = endPlace.elementId;

    while (cursor !== startPlace.elementId) {
      const previousNode = cameFrom.get(cursor);
      const edge = edgeUsedToReachNode.get(cursor);

      if (!previousNode || !edge) {
        return null;
      }

      rawEdges.push(edge);
      nodeOrder.push(previousNode);
      cursor = previousNode;
    }

    nodeOrder.reverse();
    rawEdges.reverse();

    const route = nodeOrder.reduce<RoutePoint[]>((points, elementId, index) => {
      const graphNode = graph.nodesByElementId.get(elementId);
      if (!graphNode) {
        return points;
      }

      const label =
        index === 0
          ? startPlace.displayName
          : index === nodeOrder.length - 1
            ? endPlace.displayName
            : graphNode.label;

      points.push({
        latitude: graphNode.latitude,
        longitude: graphNode.longitude,
        label,
      });

      return points;
    }, []);

    const segments = rawEdges.map((edge) => ({
      fromElementId: edge.fromElementId,
      toElementId: edge.toElementId,
      distanceMeters: edge.distanceMeters,
      highway: edge.highway,
      isAccessible: edge.isAccessible,
      isLit: edge.isLit,
      surface: edge.surface,
      incline: edge.incline,
      stepCount: edge.stepCount,
      hasUnknownAccessibility:
        edge.isAccessible === undefined &&
        edge.highway === undefined &&
        edge.stepCount === undefined,
      hasUnknownLighting: edge.isLit === undefined,
    }));

    const distanceMeters = segments.reduce(
      (totalDistance, segment) => totalDistance + segment.distanceMeters,
      0,
    );

    const instructions = this.buildInstructions(
      route,
      segments,
      startPlace.displayName,
      endPlace.displayName,
      constraints,
    );

    const warnings: string[] = [];
    if (
      options.strategy === 'lighting_fallback' &&
      constraints.requireLitPath
    ) {
      warnings.push(
        'A fully lit route was not available, so this path prefers lit segments where the data allows it.',
      );
    }

    const segmentsMissingAccessibilityData = segments.filter(
      (segment) => segment.hasUnknownAccessibility,
    ).length;
    const accessibilityStatus = this.buildAccessibilityStatus(
      constraints,
      segmentsMissingAccessibilityData,
    );

    const segmentsMissingLightingData = segments.filter(
      (segment) => segment.hasUnknownLighting,
    ).length;
    if (constraints.requireLitPath && segmentsMissingLightingData > 0) {
      warnings.push(
        'Some route segments are missing lighting metadata, so lighting preferences were applied only where the map data is explicit.',
      );
    }

    return {
      route,
      segments,
      instructions,
      warnings,
      accessibilityStatus,
      distanceMeters,
      strategy: options.strategy,
    };
  }

  private async getWalkingGraph(): Promise<GraphSnapshot> {
    if (
      this.graphCache &&
      Date.now() - this.graphCache.loadedAt < GRAPH_CACHE_TTL_MS
    ) {
      return this.graphCache;
    }

    const session = this.neo4jService.getReadSession();
    try {
      const query = `
        MATCH (a:PathNode)-[r:CONNECTS_TO]->(b:PathNode)
        WHERE a.latitude IS NOT NULL
          AND a.longitude IS NOT NULL
          AND b.latitude IS NOT NULL
          AND b.longitude IS NOT NULL
        RETURN DISTINCT
          elementId(a) AS fromElementId,
          elementId(b) AS toElementId,
          a.latitude AS fromLatitude,
          a.longitude AS fromLongitude,
          b.latitude AS toLatitude,
          b.longitude AS toLongitude,
          coalesce(a.place_name, a.building_name, a.name, '') AS fromLabel,
          coalesce(b.place_name, b.building_name, b.name, '') AS toLabel,
          r.distance_meters AS distanceMeters,
          r.highway AS highway,
          r.is_accessible AS isAccessible,
          r.is_lit AS isLit,
          r.surface AS surface,
          r.incline AS incline,
          r.step_count AS stepCount
      `;

      const result = await session.run(query);
      const records = result.records as Neo4jRecord[];
      const nodesByElementId = new Map<string, GraphNode>();
      const adjacency = new Map<string, GraphEdge[]>();

      for (const record of records) {
        const fromElementId = this.toStringValue(record.get('fromElementId'));
        const toElementId = this.toStringValue(record.get('toElementId'));
        const fromLatitude = this.toNumber(record.get('fromLatitude'));
        const fromLongitude = this.toNumber(record.get('fromLongitude'));
        const toLatitude = this.toNumber(record.get('toLatitude'));
        const toLongitude = this.toNumber(record.get('toLongitude'));

        if (
          !fromElementId ||
          !toElementId ||
          fromLatitude === undefined ||
          fromLongitude === undefined ||
          toLatitude === undefined ||
          toLongitude === undefined
        ) {
          continue;
        }

        nodesByElementId.set(fromElementId, {
          elementId: fromElementId,
          latitude: fromLatitude,
          longitude: fromLongitude,
          label: this.toStringValue(record.get('fromLabel')) || undefined,
        });
        nodesByElementId.set(toElementId, {
          elementId: toElementId,
          latitude: toLatitude,
          longitude: toLongitude,
          label: this.toStringValue(record.get('toLabel')) || undefined,
        });

        const inferredDistanceMeters = this.haversineDistanceMeters(
          fromLatitude,
          fromLongitude,
          toLatitude,
          toLongitude,
        );
        const edge: GraphEdge = {
          fromElementId,
          toElementId,
          distanceMeters:
            this.toNumber(record.get('distanceMeters')) ??
            inferredDistanceMeters,
          highway: this.toStringValue(record.get('highway')) || undefined,
          isAccessible: this.toBoolean(record.get('isAccessible')),
          isLit: this.toBoolean(record.get('isLit')),
          surface: this.toStringValue(record.get('surface')) || undefined,
          incline: this.toStringValue(record.get('incline')) || undefined,
          stepCount: this.toNumber(record.get('stepCount')),
        };

        const outgoingEdges = adjacency.get(fromElementId) ?? [];
        outgoingEdges.push(edge);
        adjacency.set(fromElementId, outgoingEdges);
      }

      const graphSnapshot: GraphSnapshot = {
        nodesByElementId,
        adjacency,
        loadedAt: Date.now(),
      };
      this.graphCache = graphSnapshot;

      return graphSnapshot;
    } finally {
      await session.close();
    }
  }

  private calculateEdgeCost(
    edge: GraphEdge,
    options: RouteSearchOptions,
  ): number {
    let edgeCost = Math.max(edge.distanceMeters, 1);

    if (options.requireAccessible) {
      if (!this.isEdgeAccessible(edge)) {
        return Number.POSITIVE_INFINITY;
      }

      if (edge.isAccessible === undefined) {
        edgeCost += 18;
      }

      if (this.isSteepIncline(edge.incline)) {
        edgeCost += 16;
      }

      if (this.hasRoughSurface(edge.surface)) {
        edgeCost += 12;
      }
    } else if (!this.isEdgeAccessible(edge)) {
      edgeCost += 40;
    }

    if (options.strictLighting) {
      if (edge.isLit !== true) {
        return Number.POSITIVE_INFINITY;
      }
    } else if (options.preferLighting && edge.isLit !== true) {
      edgeCost += edge.isLit === false ? 90 : 35;
    }

    return edgeCost;
  }

  private isEdgeAccessible(edge: GraphEdge): boolean {
    if (edge.isAccessible === false) {
      return false;
    }

    if (edge.highway?.toLowerCase() === 'steps') {
      return false;
    }

    if (edge.stepCount !== undefined && edge.stepCount > 0) {
      return false;
    }

    return true;
  }

  private hasRoughSurface(surface: string | undefined): boolean {
    if (!surface) {
      return false;
    }

    return ['gravel', 'ground', 'dirt', 'unpaved', 'paving_stones'].includes(
      surface.toLowerCase(),
    );
  }

  private isSteepIncline(incline: string | undefined): boolean {
    if (!incline) {
      return false;
    }

    const normalizedIncline = incline.trim().toLowerCase();
    if (normalizedIncline === 'up' || normalizedIncline === 'down') {
      return true;
    }

    const numericValue = Number.parseFloat(normalizedIncline.replace('%', ''));
    return Number.isFinite(numericValue) && Math.abs(numericValue) >= 8;
  }

  private estimateRemainingDistance(
    graph: GraphSnapshot,
    fromElementId: string,
    toElementId: string,
  ): number {
    const fromNode = graph.nodesByElementId.get(fromElementId);
    const toNode = graph.nodesByElementId.get(toElementId);

    if (!fromNode || !toNode) {
      return 0;
    }

    return this.haversineDistanceMeters(
      fromNode.latitude,
      fromNode.longitude,
      toNode.latitude,
      toNode.longitude,
    );
  }

  private buildInstructions(
    route: RoutePoint[],
    segments: RouteSegment[],
    startName: string,
    endName: string,
    constraints: RouteConstraints,
  ): RouteInstruction[] {
    if (route.length === 0) {
      return [];
    }

    if (route.length === 1 || segments.length === 0) {
      return [
        {
          title: `Start at ${startName}`,
          detail: 'You are already at the destination anchor for this route.',
        },
      ];
    }

    const instructions: RouteInstruction[] = [
      {
        title: `Start at ${startName}`,
        detail:
          'Follow the highlighted path from the matched campus entrance or anchor point.',
      },
    ];

    let chunkStartIndex = 0;
    let chunkDistance = 0;
    let chunkEdges: RouteSegment[] = [];
    let currentDirection = this.bearing(route[0], route[1]);

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      chunkDistance += segment.distanceMeters;
      chunkEdges.push(segment);

      const isLastSegment = index === segments.length - 1;
      if (isLastSegment) {
        instructions.push(
          this.createChunkInstruction(
            route,
            chunkStartIndex,
            index + 1,
            currentDirection,
            chunkDistance,
            chunkEdges,
            constraints,
          ),
        );
        continue;
      }

      const nextDirection = this.bearing(route[index + 1], route[index + 2]);
      const nextSegment = segments[index + 1];

      if (
        this.shouldSplitInstruction(
          currentDirection,
          nextDirection,
          segment,
          nextSegment,
        )
      ) {
        instructions.push(
          this.createChunkInstruction(
            route,
            chunkStartIndex,
            index + 1,
            currentDirection,
            chunkDistance,
            chunkEdges,
            constraints,
          ),
        );
        chunkStartIndex = index + 1;
        chunkDistance = 0;
        chunkEdges = [];
        currentDirection = nextDirection;
      }
    }

    instructions.push({
      title: `Arrive at ${endName}`,
      detail:
        'The final marker is anchored to the matched destination entrance or route node.',
    });

    return instructions;
  }

  private shouldSplitInstruction(
    currentDirection: number,
    nextDirection: number,
    currentSegment: RouteSegment,
    nextSegment: RouteSegment,
  ): boolean {
    const directionDelta = Math.abs(currentDirection - nextDirection);
    const normalizedDirectionDelta = Math.min(
      directionDelta,
      360 - directionDelta,
    );

    if (normalizedDirectionDelta >= 35) {
      return true;
    }

    return (
      (currentSegment.highway ?? 'unknown') !==
      (nextSegment.highway ?? 'unknown')
    );
  }

  private createChunkInstruction(
    route: RoutePoint[],
    startIndex: number,
    endIndex: number,
    direction: number,
    distanceMeters: number,
    chunkEdges: RouteSegment[],
    constraints: RouteConstraints,
  ): RouteInstruction {
    const chunkStart = route[startIndex];
    const chunkEnd = route[endIndex];
    const routeType = this.describeRouteType(chunkEdges);
    const directionLabel = this.describeBearing(direction);
    const notes = this.describeChunkNotes(chunkEdges, constraints);
    const distanceLabel = this.formatDistance(distanceMeters);

    return {
      title: `Go ${directionLabel}`,
      detail: `Head ${directionLabel} for ${distanceLabel} on ${routeType} from ${chunkStart.label ?? 'the current position'} toward ${chunkEnd.label ?? 'the next turn'}.${notes}`,
      distanceMeters,
    };
  }

  private describeRouteType(chunkEdges: RouteSegment[]): string {
    const routeTypeCounts = new Map<string, number>();
    for (const edge of chunkEdges) {
      const highway = edge.highway?.toLowerCase() ?? 'pedestrian path';
      routeTypeCounts.set(highway, (routeTypeCounts.get(highway) ?? 0) + 1);
    }

    const dominantRouteType =
      [...routeTypeCounts.entries()].sort((leftType, rightType) => {
        return rightType[1] - leftType[1];
      })[0]?.[0] ?? 'pedestrian path';

    switch (dominantRouteType) {
      case 'footway':
        return 'a campus footway';
      case 'pedestrian':
        return 'a pedestrian-only walkway';
      case 'path':
        return 'a campus path';
      case 'steps':
        return 'a stair segment';
      default:
        return 'the highlighted route';
    }
  }

  private describeChunkNotes(
    chunkEdges: RouteSegment[],
    constraints: RouteConstraints,
  ): string {
    const notes: string[] = [];

    if (constraints.requireLitPath) {
      const allLit = chunkEdges.every((edge) => edge.isLit === true);
      const someUnknownLighting = chunkEdges.some(
        (edge) => edge.hasUnknownLighting,
      );

      if (allLit) {
        notes.push('Lighting is confirmed along this segment.');
      } else if (someUnknownLighting) {
        notes.push(
          'Lighting data is incomplete on this segment, so use extra caution after dark.',
        );
      }
    }

    return notes.length > 0 ? ` ${notes.join(' ')}` : '';
  }

  private buildAccessibilityStatus(
    constraints: RouteConstraints,
    segmentsMissingAccessibilityData: number,
  ): AccessibilityStatus | undefined {
    if (!constraints.requireAccessible) {
      return undefined;
    }

    if (segmentsMissingAccessibilityData > 0) {
      return {
        level: 'best_effort',
        message:
          'Known stairs were avoided, but some segments do not have enough accessibility data to guarantee full accessibility.',
      };
    }

    return {
      level: 'confirmed',
      message:
        'This route avoids known stairs and inaccessible segments based on current map data.',
    };
  }

  private describeBearing(direction: number): string {
    const directions = [
      'north',
      'northeast',
      'east',
      'southeast',
      'south',
      'southwest',
      'west',
      'northwest',
    ];
    const normalizedDirection = ((direction % 360) + 360) % 360;
    const directionIndex = Math.round(normalizedDirection / 45) % 8;

    return directions[directionIndex];
  }

  private bearing(fromPoint: RoutePoint, toPoint: RoutePoint): number {
    const latitude1 = this.toRadians(fromPoint.latitude);
    const latitude2 = this.toRadians(toPoint.latitude);
    const longitudeDelta = this.toRadians(
      toPoint.longitude - fromPoint.longitude,
    );

    const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
    const x =
      Math.cos(latitude1) * Math.sin(latitude2) -
      Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);

    return (this.toDegrees(Math.atan2(y, x)) + 360) % 360;
  }

  private haversineDistanceMeters(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number,
  ): number {
    const earthRadiusMeters = 6371000;
    const latitudeDelta = this.toRadians(latitude2 - latitude1);
    const longitudeDelta = this.toRadians(longitude2 - longitude1);
    const startLatitude = this.toRadians(latitude1);
    const endLatitude = this.toRadians(latitude2);

    const haversineValue =
      Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
      Math.sin(longitudeDelta / 2) *
        Math.sin(longitudeDelta / 2) *
        Math.cos(startLatitude) *
        Math.cos(endLatitude);
    const arc =
      2 * Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue));

    return earthRadiusMeters * arc;
  }

  private formatDistance(distanceMeters: number): string {
    if (distanceMeters < 30) {
      return `${Math.round(distanceMeters)} m`;
    }

    const feet = distanceMeters * 3.28084;
    if (feet < 1000) {
      return `${Math.round(feet)} ft`;
    }

    return `${(feet / 5280).toFixed(2)} mi`;
  }

  private normalizeSearchTerm(value: string): string {
    return value
      .toLowerCase()
      .replace(/[()&/,-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private uniqueStrings(
    ...values: Array<string | undefined | string[]>
  ): string[] {
    const uniqueValues = new Set<string>();

    for (const value of values) {
      if (Array.isArray(value)) {
        for (const nestedValue of value) {
          const normalizedValue = nestedValue.trim();
          if (normalizedValue) {
            uniqueValues.add(normalizedValue);
          }
        }
        continue;
      }

      if (!value) {
        continue;
      }

      const normalizedValue = value.trim();
      if (normalizedValue) {
        uniqueValues.add(normalizedValue);
      }
    }

    return [...uniqueValues];
  }

  private parseJsonObject(value: string): Record<string, unknown> {
    if (!value) {
      return {};
    }

    try {
      const parsedValue = JSON.parse(value) as unknown;
      if (
        parsedValue &&
        typeof parsedValue === 'object' &&
        !Array.isArray(parsedValue)
      ) {
        return parsedValue as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => this.toStringValue(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  private toStringValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${value}`;
    }

    if (isInt(value)) {
      return value.toString();
    }

    return '';
  }

  private toBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      if (value === 'true') {
        return true;
      }

      if (value === 'false') {
        return false;
      }
    }

    return undefined;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsedNumber = Number.parseFloat(value);
      return Number.isFinite(parsedNumber) ? parsedNumber : undefined;
    }

    if (isInt(value)) {
      return value.toNumber();
    }

    return undefined;
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  private toDegrees(value: number): number {
    return (value * 180) / Math.PI;
  }
}
