import { Controller, Post, Body, SetMetadata } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginUserDto } from 'src/users/dto/users.dto';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body('id') loginUserDto: LoginUserDto, deviceId) {
    return this.authService.login(loginUserDto, deviceId);
  }
}