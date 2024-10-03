// src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginUserDto } from 'src/users/dto/users.dto';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService
  ) {}

  async login(loginUserDto: LoginUserDto, deviceId: string) {
    const user = await this.usersService.login(loginUserDto, deviceId);
    const payload = { sub: user.id, deviceId };
    return {
      access_token: this.jwtService.sign(payload),
      expiryData: user.expiryDate
    };
  }

  async validateToken(token: string, deviceId: string): Promise<any> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.usersService.findOne(payload.sub);
      
      if (!user || user.deviceId !== deviceId || new Date() > user.expiryDate) {
        return null; // 유효하지 않은 토큰이나 사용자
      }
      
      return user;
    } catch (error) {
      return null; // 토큰 검증 실패
    }
  }
}