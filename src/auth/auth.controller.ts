import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body('id') id: string) {
    try {
      return await this.authService.login(id);
    } catch (error) {
      throw new UnauthorizedException('Invalid credentials');
    }
  }
}