import { Controller, Post, UseGuards, Body } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PetStatService } from './pet-stat.service';

@Controller('pet-stat')
@UseGuards(AuthGuard('jwt'))
export class PetStatController {
  constructor(private readonly petStatService: PetStatService) {}

  @Post('extract')
  async extractPetStats(@Body() body: { image: string }) {
    return this.petStatService.extractPetStats(body.image);
  }
}