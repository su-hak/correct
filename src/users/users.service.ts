import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from './entities/users.entity';
import { CreateUserDto, ExtendTokenExpirationDto, LoginUserDto, LogoutUserDto, RefreshTokenDto } from './dto/users.dto';
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

  async logout(logoutUserDto: LogoutUserDto): Promise<void> {
    const { id } = logoutUserDto;
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

  // 베트남 시간 00:00에 무조건 실행되는 Cron Job
  @Cron('0 0 0 * * *', {
    timeZone: 'Asia/Ho_Chi_Minh'
  })
  async validateTokensAtMidnight() {
    try {
      console.log('Starting midnight token validation...');
      const now = new Date();

      // 모든 유저의 토큰 상태 검증 (앱 실행 여부와 무관)
      const expiredUsers = await this.usersRepository.find({
        where: {
          expiryDate: LessThan(now)
        }
      });

      if (expiredUsers.length > 0) {
        await this.usersRepository
          .createQueryBuilder()
          .update(User)
          .set({
            isLoggedIn: false,
            token: '',
          })
          .where("expiryDate < :now", { now })
          .execute();

        console.log(`Logged out ${expiredUsers.length} expired users`);
      }
    } catch (error) {
      console.error('Error during midnight validation:', error);
    }
  }

  // 주간 시간대에는 토큰 검증 없이 진행
  async checkAuthStatus(id: string, token: string): Promise<boolean> {
    // 기본적인 존재 여부만 확인
    const user = await this.usersRepository.findOne({
      where: { id, token },
      select: ['id']  // 필요한 필드만 조회
    });

    return !!user;
  }

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

  async invalidateToken(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.token = ''; // 빈 문자열로 설정
    user.expiryDate = null;
    user.isLoggedIn = false;
    return this.usersRepository.save(user);
  }

  private calculateExpiryDate(duration: number, unit: 'hours' | 'days'): Date {
    const multiplier = unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return new Date(Date.now() + duration * multiplier);
  }

  async checkTokenValidity(id: string, token: string): Promise<boolean> {
    console.log(`Checking token validity for user ${id}`);
    const user = await this.usersRepository.findOne({ where: { id } });
    console.log('User found:', JSON.stringify(user, null, 2));
    if (!user) {
      console.log(`User ${id} not found`);
      return false;
    }
    console.log(`Stored token: ${user.token}, Provided token: ${token}`);
    if (user.token !== token) {
      console.log(`Token mismatch for user ${id}`);
      return false;
    }
    if (user.expiryDate && new Date() > user.expiryDate) {
      console.log(`Token expired for user ${id}. Expiry date: ${user.expiryDate}, Current date: ${new Date()}`);
      return false;
    }
    if (!user.isLoggedIn) {
      console.log(`User ${id} is not logged in`);
      return false;
    }
    console.log(`Token valid for user ${id}`);
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

// UsersService.ts의 extendTokenExpiration 메서드 수정
async extendTokenExpiration(id: string, extendTokenDto: ExtendTokenExpirationDto): Promise<User> {
  const user = await this.usersRepository.findOne({ where: { id } });
  if (!user) {
      throw new NotFoundException('User not found');
  }
  
  // 현재 만료일이 없는 경우 예외 처리
  if (!user.expiryDate) {
      throw new BadRequestException('No valid expiry date exists');
  }

  const multiplier = extendTokenDto.expiryUnit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const extensionMs = extendTokenDto.expiryDuration * multiplier;
  
  // 기존 만료일에 연장 기간을 추가
  user.expiryDate = new Date(user.expiryDate.getTime() + extensionMs);
  
  return this.usersRepository.save(user);
}
}