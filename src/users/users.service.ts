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
    console.log('Login attempt in UsersService:', { id, deviceId });

    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (new Date() > user.expiryDate) {
      throw new UnauthorizedException('Token has expired');
    }

    console.log('Current user deviceId:', user.deviceId);
    console.log('Received deviceId:', deviceId);

    if (deviceId && user.deviceId !== deviceId) {
      user.deviceId = deviceId;
      const updatedUser = await this.usersRepository.save(user);
      console.log('Updated user:', JSON.stringify(updatedUser, null, 2));
    } else {
      console.log('DeviceId unchanged');
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

  async save(user: User): Promise<User> {
    console.log('Saving user:', user);
    const savedUser = await this.usersRepository.save(user);
    console.log('Saved user:', savedUser);
    return savedUser;
  }
}