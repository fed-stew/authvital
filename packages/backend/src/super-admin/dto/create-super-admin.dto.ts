import { IsEmail, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class CreateSuperAdminDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128) // Cap bcrypt input; prevents DoS via megabyte-sized passwords
  password?: string;

  @IsOptional()
  @IsString()
  givenName?: string;

  @IsOptional()
  @IsString()
  familyName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}
