import { Controller, Get, Post, Body, Param, Delete, UnauthorizedException, HttpCode, HttpStatus, HttpException, NotFoundException, Headers } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/users.entity';
import { CreateUserDto, DeleteTokenExpirationDto, LoginUserDto, LogoutUserDto, RefreshTokenDto } from './dto/users.dto';
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
    @ApiOperation({ summary: '로그아웃' })
    @ApiResponse({ status: 201, description: 'Logout successful.', type: User })
    @ApiBody({ type: LogoutUserDto })
    async logout(@Body() logoutUserDto: LogoutUserDto) {
        await this.usersService.logout(logoutUserDto);
        return { message: 'Logged out successfully' };
    }

    @Post('heartbeat')
    async heartbeat(@Body() body: { id: string }, @Headers('Authorization') authHeader: string) {
        try {
            const token = authHeader.split(' ')[1];
            console.log(`Received heartbeat for user ${body.id} with token ${token}`);
            const isValid = await this.usersService.checkTokenValidity(body.id, token);
            if (!isValid) {
                console.log(`Token validation failed for user ${body.id}`);
                throw new UnauthorizedException('Token is invalid or expired');
            }
            await this.usersService.heartbeat(body.id);
            return { message: 'Heartbeat received' };
        } catch (error) {
            console.error(`Error in heartbeat: ${error.message}`);
            throw error;
        }
    }

    @Post(':id/refresh-token')
    @ApiOperation({ summary: '토큰 재생성' })
    @ApiResponse({ status: 200, description: 'Token refreshed successfully.', type: User })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async refreshToken(
        @Param('id') id: string,
        @Body() refreshTokenDto: RefreshTokenDto
    ) {
        try {
            const user = await this.usersService.updateToken(id, refreshTokenDto);
            return { token: user.token, expiryDate: user.expiryDate };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }
            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('check-token')
    @ApiOperation({ summary: '토큰 유효성 검사' })
    @ApiResponse({ status: 200, description: 'Token is valid.' })
    @ApiResponse({ status: 401, description: 'Token is invalid or expired.' })
    async checkToken(@Body() body: { id: string, token: string }) {
        try {
            console.log(`Checking token for user ${body.id}`);
            const isValid = await this.usersService.checkTokenValidity(body.id, body.token);
            if (isValid) {
                return { message: 'Token is valid' };
            } else {
                throw new UnauthorizedException('Token is invalid or expired');
            }
        } catch (error) {
            console.error(`Error in checkToken: ${error.message}`);
            throw error;
        }
    }

    @Post(':id/delete-token-expiration')
    @ApiOperation({ summary: '토큰 만료 삭제' })
    @ApiResponse({ status: 200, description: 'Token expiration deleted successfully.', type: User })
    @ApiResponse({ status: 404, description: 'User not found' })
    async deleteTokenExpiration(
        @Param('id') id: string,
        @Body() deleteTokenExpirationDto: DeleteTokenExpirationDto
    ) {
        if (deleteTokenExpirationDto.deleteExpiration) {
            const user = await this.usersService.deleteTokenExpiration(id);
            return { message: 'Token expiration deleted successfully', user };
        }
        throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
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