import { Test, TestingModule } from '@nestjs/testing';
import { PetStatController } from './pet-stat.controller';

describe('PetStatController', () => {
  let controller: PetStatController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PetStatController],
    }).compile();

    controller = module.get<PetStatController>(PetStatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
