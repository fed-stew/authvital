import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsObject } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128) // Cap bcrypt input; prevents DoS via megabyte-sized passwords
  password!: string;

  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}
