import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async validateUser(id: string, token: string): Promise<any> {
    const user = await this.usersService.findOne(id);
    if (user && user.token === token && new Date() <= user.expiryDate) {
      const { token, ...result } = user;
      return result;
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  async login(id: string): Promise<any> {
    return this.usersService.login({ id });
  }
}