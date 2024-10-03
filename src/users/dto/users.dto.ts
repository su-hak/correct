import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDate, IsInt, Min, Max, IsOptional, IsNumber } from 'class-validator';

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

  @ApiProperty({ required: false, example: '30', description: '토큰 유효 기간 (일)' })
  @IsNumber()
  @Min(1)
  @Max(365)
  expiryDate: number;
}

export class LoginUserDto {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ example: 'john_doe' })
    id?: string;
    
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ example: 'john_doe' })
    deviceId: string;
}