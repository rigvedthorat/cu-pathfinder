import { Injectable, Logger } from '@nestjs/common';
import { GraphService } from './graph/graph.service';
import { AiService } from './ai/ai.service';


@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly graphService: GraphService, private readonly aiService: AiService) { }

  getHello(): string {
    return 'Welcome to the CU Pathfinder API.';
  }

  // The core endpoint that takes natural language, extracts constraints, and queries Neo4j database for the appropriate route

  async getRouteFromNaturalLanguage(userPrompt: string, startNode: string, endNode: string) {
    this.logger.log(`Evaluating request: "${userPrompt}"`);

    // 1.  Ask Gemini to evaluate constraints (safety, accessibility) from the user prompt

    const constraints = await this.aiService.evaluateRoutingRequest(userPrompt);
    this.logger.log(`Constraints extracted: ${JSON.stringify(constraints)}`);

    // 2. Enforce ethical framework: Immediate escalation needed

    if (constraints.escalateToPolice) {
      return {
        warning: 'High Risk Scenario Detected',
        message: 'It sounds like you might be in immediate danger. Please contact CU Police at 303-492-6666 or dial 911 immediately.',
        route: null
      };
    }

    // 3. Query Neo4j based on Gemini's local evaluation

    const route = await this.graphService.getRoute(startNode, endNode, constraints.requireAccessible);
    return {
      message: constraints.requireLitPath ? "Here is your route. Since safety is a concern, I've prioritized well-lit paths. Remember, you can also call CU Night Ride at 303-492-SAFE." : "Here is your suggested route.",
      constraints: constraints,
      route: route
    };

  }

  // Check database health

  async getDatabaseHealth() {
    const isDbConnected = await this.graphService.getDatabaseHealth();
    return {
      status: 'ok',
      database: isDbConnected ? 'connected' : 'disconnected',
    };
  }
}