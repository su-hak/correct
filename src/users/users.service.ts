import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from './entities/users.entity';
import { CreateUserDto, LoginUserDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) { }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.usersRepository.create({
      ...createUserDto,
      token: uuidv4(),
      expiryDate: new Date(Date.now() + createUserDto.expiryDate * 24 * 60 * 60 * 1000)
    });
    return this.usersRepository.save(user);
  }

  async login(loginUserDto: LoginUserDto, deviceId: string): Promise<User> {
    const { id } = loginUserDto;
    const user = await this.usersRepository.findOne({ where: { id } });
    
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    if (new Date() > user.expiryDate) {
      throw new UnauthorizedException('Token has expired');
    }

    if (user.deviceId !== deviceId) {
      user.deviceId = deviceId;
      await this.usersRepository.save(user);
    }
    
    return user;
  }

  async updateToken(id: string, expiryDate: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.token = uuidv4();
    user.expiryDate = new Date(Date.now() + expiryDate * 24 * 60 * 60 * 1000); // 30 days from now
    user.deviceId = null;
    return this.usersRepository.save(user);
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

  async deleteAllUsers(): Promise<void> {
    // 빈 ID를 가진 사용자 삭제
    await this.usersRepository.query('DELETE FROM users WHERE id = ""');
    
    // 나머지 모든 사용자 삭제
    await this.usersRepository.query('DELETE FROM users');
    
    // 자동 증가 값 리셋 (필요한 경우)
    await this.usersRepository.query('ALTER TABLE users AUTO_INCREMENT = 1');
  }

}