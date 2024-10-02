import { Controller, Get, Post, Body, Param, Delete, UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/users.entity';
import { CreateUserDto, LoginUserDto } from './dto/users.dto';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/auth/auth.controller';

@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    @ApiOperation({ summary: '회원가입' })
    @ApiBody({ type: CreateUserDto })
    @ApiResponse({ status: 201, description: 'The user has been successfully created.', type: User })
    @ApiResponse({ status: 400, description: 'Bad Request.' })
    async create(@Body() createUserDto: CreateUserDto) {
        const user = await this.usersService.create(createUserDto);
        return {
            id: user.id,
            token: user.token,
            expiryDate: user.expiryDate
        };
    }

    @Public()
    @Post('login')
    @ApiOperation({ summary: '로그인' })
    @ApiResponse({ status: 200, description: 'Login successful.', type: User })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    async login(@Body() loginUserDto: LoginUserDto) {
        try {
            const user = await this.usersService.login(loginUserDto);
            const response = {
                token: user.token,
                expiryDate: user.expiryDate,
                id: user.id
            };
            console.log('Login response:', response);
            return response;
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw new UnauthorizedException('Token has expired');
            }
            throw error;
        }
    }

    @Post(':id/refresh-token')
    @ApiOperation({ summary: '토큰 재생성' })
    @ApiResponse({ status: 200, description: 'Token refreshed successfully.', type: User })
    async refreshToken(@Param('id') id: string) {
        const user = await this.usersService.updateToken(id);
        return { token: user.token, expiryDate: user.expiryDate };
    }

    @Get()
    @ApiOperation({ summary: '전체 유저 출력' })
    @ApiResponse({ status: 200, description: 'List of all users.', type: [User] })
    findAll() {
        return this.usersService.findAll();
    }

    @Delete(':id')
    @ApiOperation({ summary: '회원 삭제' })
    @ApiResponse({ status: 200, description: 'User deleted successfully.' })
    remove(@Param('id') id: string) {
        return this.usersService.remove(id);
    }
}