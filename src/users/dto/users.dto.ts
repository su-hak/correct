import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDate, IsInt, Min } from 'class-validator';

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

  @ApiProperty({ example: '30', description: 'Token validity duration in days' })
  @IsInt()
  @Min(1)
  expiryDate: number;
}

export class LoginUserDto {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ example: 'john_doe' })
    id?: string;
}