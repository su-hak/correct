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

  async login(loginUserDto: LoginUserDto): Promise<User> {
    const { id } = loginUserDto;
    console.log(`Attempting to login with id: ${id}`);
    
    const user = await this.usersRepository.findOne({ where: { id } });
    console.log(`User found:`, user);
    
    if (!user) {
      console.log(`User not found for id: ${id}`);
      throw new NotFoundException('User not found');
    }
    
    if (new Date() > user.expiryDate) {
      console.log(`Token expired for user: ${id}`);
      throw new UnauthorizedException('Token has expired');
    }
    
    console.log(`Login successful for user: ${id}`);
    return user;
  }

  async updateToken(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.token = uuidv4();
    user.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
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
}