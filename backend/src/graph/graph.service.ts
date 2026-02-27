import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

@Injectable()
export class GraphService {
    private readonly logger = new Logger(GraphService.name);

    constructor(private readonly neo4jService: Neo4jService) { }

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

    async getRoute(startNodeId: string, endNodeId: string, requireAccessible: boolean): Promise<any> {
        const session = this.neo4jService.getReadSession();
        try {
            // FIXED: Added '$' to parameters so Neo4j recognizes them as variables
            // FIXED: Added logic to actually use the 'requireAccessible' flag
            const query = `
                MATCH (start:Building {id: $startNodeId})
                MATCH (end:Building {id: $endNodeId})
                MATCH path = shortestPath((start)-[:CONNECTS_TO*]->(end))
                WHERE NOT $requireAccessible OR ALL(rel IN relationships(path) WHERE rel.isAccessible = true)
                RETURN nodes(path) as route
            `;

            const result = await session.run(query, {
                startNodeId,
                endNodeId,
                requireAccessible
            });

            return result.records.map(record => record.get('route'));
        } catch (error) {
            this.logger.error(`Failed to calculate route from ${startNodeId} to ${endNodeId}`, error);
            throw error;
        } finally {
            await session.close();
        }
    }
}