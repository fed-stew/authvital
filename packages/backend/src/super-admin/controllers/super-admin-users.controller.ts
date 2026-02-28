import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminUsersService } from '../services/admin-users.service';

@Controller('super-admin/users')
@UseGuards(SuperAdminGuard)
export class SuperAdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  async getAllUsers(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.usersService.getUsers({
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post()
  async createUser(
    @Body() dto: {
      givenName?: string;
      familyName?: string;
      email?: string;
      phone?: string;
      password?: string;
    },
  ) {
    return this.usersService.createUser(dto);
  }

  @Put(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: {
      givenName?: string;
      familyName?: string;
      email?: string;
      phone?: string;
    },
  ) {
    return this.usersService.updateUser(id, dto);
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }

  @Get(':id')
  async getUserDetail(@Param('id') id: string) {
    return this.usersService.getUser(id);
  }

  @Post(':id/send-password-reset')
  async sendUserPasswordReset(@Param('id') id: string) {
    return this.usersService.sendUserPasswordReset(id);
  }
}
