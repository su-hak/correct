import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from './entities/users.entity';
import { CreateUserDto, LoginUserDto, RefreshTokenDto } from './dto/users.dto';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) { }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { expiryDuration, expiryUnit } = createUserDto;
    let expiryMs: number;

    if (expiryUnit === 'hours') {
      expiryMs = expiryDuration * 60 * 60 * 1000;
    } else {
      expiryMs = expiryDuration * 24 * 60 * 60 * 1000;
    }

    const user = this.usersRepository.create({
      ...createUserDto,
      token: uuidv4(),
      expiryDate: new Date(Date.now() + expiryMs)
    });

    return this.usersRepository.save(user);
  }

  async login(loginUserDto: LoginUserDto): Promise<User> {
    const { id } = loginUserDto;
    console.log('Login attempt in UsersService:', { id });
  
    const user = await this.usersRepository.findOne({ where: { id } });
  
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.isLoggedIn) {
      throw new ConflictException('User is already logged in');
    }
    if (new Date() > user.expiryDate) {
      throw new UnauthorizedException('Token has expired');
    }
  
    // 로그인 상태 업데이트
    user.isLoggedIn = true;
    user.lastHeartbeat = new Date();
    
    const updatedUser = await this.usersRepository.save(user);
    console.log('User logged in:', JSON.stringify(updatedUser, null, 2));
    
    return updatedUser;
  }

  async logout(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isLoggedIn = false;
    await this.usersRepository.save(user);
  }

  async heartbeat(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.lastHeartbeat = new Date();
    await this.usersRepository.save(user);
  }

  @Cron('* * * * *')  // 매 분마다 실행
  async checkInactiveUsers() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const inactiveUsers = await this.usersRepository.find({
      where: {
        isLoggedIn: true,
        lastHeartbeat: LessThan(fiveMinutesAgo),
      },
    });
    for (const user of inactiveUsers) {
      user.isLoggedIn = false;
      await this.usersRepository.save(user);
    }
  }

  async updateToken(id: string, refreshTokenDto: RefreshTokenDto): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    // 토큰 만료 여부와 관계없이 새 토큰 발급
    user.token = uuidv4();
    user.expiryDate = this.calculateExpiryDate(refreshTokenDto.expiryDuration, refreshTokenDto.expiryUnit);
    user.deviceId = null;
    
    return this.usersRepository.save(user);
  }

  async deleteTokenExpiration(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.expiryDate = null;
    return this.usersRepository.save(user);
  }

  private calculateExpiryDate(duration: number, unit: 'hours' | 'days'): Date {
    const multiplier = unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return new Date(Date.now() + duration * multiplier);
  }

  async checkTokenValidity(id: string, token: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      return false;
    }
    if (user.token !== token) {
      return false;
    }
    if (user.expiryDate && new Date() > user.expiryDate) {
      return false;
    }
    return true;
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async remove(id: string): Promise<void> {
    await this.usersRepository.delete(id);
  }

  async save(user: User): Promise<User> {
    console.log('Saving user:', user);
    const savedUser = await this.usersRepository.save(user);
    console.log('Saved user:', savedUser);
    return savedUser;
  }
}