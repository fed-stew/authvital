import { IsEmail, IsString, MinLength, IsOptional, IsObject } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}
