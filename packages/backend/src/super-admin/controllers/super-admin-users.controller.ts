import { Controller, UseGuards } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { superAdminContract as c } from '@authvital/contracts';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminUsersService } from '../services/admin-users.service';

@Controller()
@UseGuards(SuperAdminGuard)
export class SuperAdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @TsRestHandler(c.getUsers)
  async getUsers() {
    return tsRestHandler(c.getUsers, async ({ query }) => {
      const result = await this.usersService.getUsers(query);
      return { status: 200 as const, body: result as any };
    });
  }

  @TsRestHandler(c.createUser)
  async createUser() {
    return tsRestHandler(c.createUser, async ({ body }) => {
      const user = await this.usersService.createUser(body as any);
      return { status: 201 as const, body: user as any };
    });
  }

  @TsRestHandler(c.getUser)
  async getUser() {
    return tsRestHandler(c.getUser, async ({ params: { id } }) => {
      const user = await this.usersService.getUser(id);
      return { status: 200 as const, body: user as any };
    });
  }

  @TsRestHandler(c.updateUser)
  async updateUser() {
    return tsRestHandler(c.updateUser, async ({ params: { id }, body }) => {
      const user = await this.usersService.updateUser(id, body as any);
      return { status: 200 as const, body: user as any };
    });
  }

  @TsRestHandler(c.deleteUser)
  async deleteUser() {
    return tsRestHandler(c.deleteUser, async ({ params: { id } }) => {
      await this.usersService.deleteUser(id);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  @TsRestHandler(c.sendUserPasswordReset)
  async sendUserPasswordReset() {
    return tsRestHandler(c.sendUserPasswordReset, async ({ params: { id } }) => {
      await this.usersService.sendUserPasswordReset(id);
      return { status: 200 as const, body: { success: true as const } };
    });
  }
}
