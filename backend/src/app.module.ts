import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Neo4jModule } from './neo4j/neo4j.module';
import { GraphModule } from './graph/graph.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),  // loads the .env file automatically
    Neo4jModule, // newly created module
    GraphModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
