import { Test, TestingModule } from '@nestjs/testing';
import { PetStatService } from './pet-stat.service';

describe('PetStatService', () => {
  let service: PetStatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PetStatService],
    }).compile();

    service = module.get<PetStatService>(PetStatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
