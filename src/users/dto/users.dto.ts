import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDate, IsInt, Min, Max, IsOptional, IsNumber, IsEnum } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'john_doe', description: 'The unique code name of the user' })
  id: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'John Doe', description: 'The name of the user' })
  name: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'john@example.com', description: 'The contact information of the user' })
  contact: string;

  @ApiProperty({ 
    example: 30, 
    description: '토큰 유효 기간 (시간 또는 일 단위)',
    minimum: 1,
    maximum: 8760  // 1년을 시간으로 표현 (365일 * 24시간)
  })
  @IsInt()
  @Min(1)
  @Max(8760)
  expiryDuration: number;

  @ApiProperty({ 
    enum: ['hours', 'days'], 
    description: '토큰 유효 기간 단위',
    example: 'days'
  })
  @IsEnum(['hours', 'days'])
  expiryUnit: 'hours' | 'days';
}

export class LoginUserDto {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ example: 'john_doe' })
    id: string;
    
    @IsString()
    @IsOptional()
    @ApiProperty({ required: false, example: 'd25h5t21-bbq6-404c-a126-324d377db54d' })
    deviceId?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ 
    example: 30, 
    description: '토큰 유효 기간 (일 단위)',
    minimum: 1,
    maximum: 365  // 최대 1년
  })
  @IsNumber()
  @Min(1)
  @Max(365)
  expiryDate: number;
}