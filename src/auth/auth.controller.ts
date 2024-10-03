import { Controller, Post, Body, SetMetadata, Headers, UnauthorizedException, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginUserDto } from 'src/users/dto/users.dto';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private jwtService: JwtService
  ) { }

  @Post('login')
  async login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto.id, loginUserDto.deviceId);
  }

  @Get('validate')
  async validateToken(@Headers('Authorization') authHeader: string, @Headers('Device-ID') deviceId: string) {
    const token = authHeader.split(' ')[1]; // Bearer 토큰에서 실제 토큰 추출
    const isValid = await this.authService.validateToken(token, deviceId);
    if (!isValid) {
      throw new UnauthorizedException('Invalid token or device');
    }
    return { valid: true };
  }
}