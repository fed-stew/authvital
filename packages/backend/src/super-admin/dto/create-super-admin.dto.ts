import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSuperAdminDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
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
