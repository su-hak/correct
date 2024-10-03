// src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginUserDto } from 'src/users/dto/users.dto';
import { User } from 'src/users/entities/users.entity';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService
  ) {}

  async validateToken(token: string, deviceId: string): Promise<boolean> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.usersService.findOne(payload.sub);
      
      if (!user || user.deviceId !== deviceId || new Date() > user.expiryDate) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  async validateUser(id: string): Promise<User | null> {
    const user = await this.usersService.findOne(id);
    if (!user) {
      return null;
    }

    return user;
  }
}