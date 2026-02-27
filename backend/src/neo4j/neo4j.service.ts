import { Injectable, OnApplicationShutdown, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver, Session } from 'neo4j-driver';

@Injectable()
export class Neo4jService implements OnApplicationShutdown {
    private readonly driver;
    private readonly logger = new Logger(Neo4jService.name);

    constructor(private configService: ConfigService) {
        const uri = this.configService.get<string>('NEO4J_URI') || 'bolt://localhost:7687';
        const username = this.configService.get<string>('NEO4J_USERNAME') || 'neo4j';
        const password = this.configService.get<string>('NEO4J_PASSWORD') || 'password';

        this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
    }

    getReadSession(database?: string): Session {
        return this.driver.session({ database, defaultAccessMode: neo4j.session.READ });
    }

    getWriteSession(database?: string): Session {
        return this.driver.session({ database, defaultAccessMode: neo4j.session.WRITE });
    }

    async onApplicationShutdown() {
        await this.driver.close();
    }
}
