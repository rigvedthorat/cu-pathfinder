import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHello: jest
              .fn()
              .mockReturnValue('Welcome to the CU Pathfinder API.'),
            getDatabaseHealth: jest.fn(),
            getRouteFromNaturalLanguage: jest.fn(),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return the welcome message', () => {
      expect(appController.getHello()).toBe(
        'Welcome to the CU Pathfinder API.',
      );
    });
  });
});
