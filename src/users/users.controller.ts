import { Controller, Get, Post, Body, Param, Delete, UnauthorizedException, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/users.entity';
import { CreateUserDto, LoginUserDto, RefreshTokenDto } from './dto/users.dto';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/auth/auth.controller';

@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    @ApiOperation({ summary: '회원가입' })
    @ApiBody({ type: CreateUserDto })
    @ApiResponse({
        status: 201,
        description: 'The user has been successfully created.',
        type: User,
        schema: {
            example: {
                id: 'john_doe',
                token: 'a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6',
                expiryDate: '2023-05-15T14:30:00.000Z'
            }
        }
    })
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

    @Post('logout')
    async logout(@Body('id') id: string) {
        await this.usersService.logout(id);
        return { message: 'Logged out successfully' };
    }

    @Post('heartbeat')
    async heartbeat(@Body('id') id: string) {
        await this.usersService.heartbeat(id);
        return { message: 'Heartbeat received' };
    }

    @Post(':id/refresh-token')
    @ApiOperation({ summary: '토큰 재생성' })
    @ApiResponse({ status: 200, description: 'Token refreshed successfully.', type: User })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async refreshToken(
        @Param('id') id: string,
        @Body() refreshTokenDto: RefreshTokenDto
    ) {
        try {
            const user = await this.usersService.updateToken(id, refreshTokenDto.expiryDate);
            return { token: user.token, expiryDate: user.expiryDate };
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw new HttpException('Unauthorized: Token has expired', HttpStatus.UNAUTHORIZED);
            }
            throw error;
        }
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