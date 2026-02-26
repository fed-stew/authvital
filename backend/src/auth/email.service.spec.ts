jest.mock("@sendgrid/mail", () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));

import { Logger } from "@nestjs/common";
import * as sgMail from "@sendgrid/mail";
import { EmailService } from "./email.service";

describe("EmailService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("falls back to console logging when SendGrid is not configured", async () => {
    process.env.BASE_URL = "https://idp.example.com";
    delete process.env.SENDGRID_API_KEY;

    const service = new EmailService();

    await service.sendWelcomeEmail("user@example.com", {
      name: "John",
      tenantName: "Acme",
    });

    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      "SENDGRID_API_KEY not configured - emails will be logged to console",
    );
    expect(sgMail.send).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });

  it("configures SendGrid and sends verification email with tokenized URL", async () => {
    process.env.BASE_URL = "https://idp.example.com";
    process.env.SENDGRID_API_KEY = "sg-key";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    process.env.SENDGRID_FROM_NAME = "AuthVader";

    const service = new EmailService();

    await service.sendVerificationEmail("user@example.com", "verify-token");

    expect(sgMail.setApiKey).toHaveBeenCalledWith("sg-key");
    expect(sgMail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        from: { email: "noreply@example.com", name: "AuthVader" },
        subject: "Verify your email address",
        text: expect.stringContaining("token=verify-token"),
        html: expect.stringContaining("token=verify-token"),
      }),
    );
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      "SendGrid configured and ready",
    );
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'Email sent to user@example.com: "Verify your email address"',
    );
  });

  it("throws when SendGrid is configured but from fields are missing", async () => {
    process.env.BASE_URL = "https://idp.example.com";
    process.env.SENDGRID_API_KEY = "sg-key";
    delete process.env.SENDGRID_FROM_EMAIL;
    delete process.env.SENDGRID_FROM_NAME;

    const service = new EmailService();

    await expect(
      service.sendWelcomeEmail("user@example.com", { name: "John" }),
    ).rejects.toThrow(
      "SENDGRID_FROM_EMAIL and SENDGRID_FROM_NAME are required when SENDGRID_API_KEY is set",
    );
  });

  it("logs and rethrows when SendGrid send fails", async () => {
    process.env.BASE_URL = "https://idp.example.com";
    process.env.SENDGRID_API_KEY = "sg-key";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    process.env.SENDGRID_FROM_NAME = "AuthVader";
    (sgMail.send as jest.Mock).mockRejectedValue(new Error("send failed"));

    const service = new EmailService();

    await expect(
      service.sendInvitationEmail("user@example.com", {
        tenantName: "Acme",
        inviteUrl: "https://app.example.com/invite/abc",
      }),
    ).rejects.toThrow("send failed");

    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it("uses custom callback URL for verification email", async () => {
    process.env.BASE_URL = "https://idp.example.com";
    process.env.SENDGRID_API_KEY = "sg-key";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    process.env.SENDGRID_FROM_NAME = "AuthVader";

    const service = new EmailService();

    await service.sendVerificationEmail("user@example.com", "token123", {
      callbackUrl: "https://custom.example.com/verify",
      name: "Jane",
    });

    expect(sgMail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          "https://custom.example.com/verify?token=token123",
        ),
        text: expect.stringContaining(
          "https://custom.example.com/verify?token=token123",
        ),
      }),
    );
  });

  it("builds invitation email text without inviter and role", async () => {
    process.env.BASE_URL = "https://idp.example.com";
    process.env.SENDGRID_API_KEY = "sg-key";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    process.env.SENDGRID_FROM_NAME = "AuthVader";

    const service = new EmailService();

    await service.sendInvitationEmail("user@example.com", {
      tenantName: "Acme",
      inviteUrl: "https://app.example.com/invite/abc",
    });

    const sentPayload = (sgMail.send as jest.Mock).mock.calls[0][0];
    expect(sentPayload.text).toContain("You've been invited to join Acme");
    expect(sentPayload.text).not.toContain(" as ");
  });

  it("builds password reset email with default reset URL", async () => {
    process.env.BASE_URL = "https://idp.example.com";
    process.env.SENDGRID_API_KEY = "sg-key";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    process.env.SENDGRID_FROM_NAME = "AuthVader";

    const service = new EmailService();

    await service.sendPasswordResetEmail("user@example.com", "rtok");

    expect(sgMail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          "https://idp.example.com/auth/reset-password?token=rtok",
        ),
      }),
    );
  });

  it("private send() falls back html from text when html is omitted", async () => {
    process.env.BASE_URL = "https://idp.example.com";
    process.env.SENDGRID_API_KEY = "sg-key";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    process.env.SENDGRID_FROM_NAME = "AuthVader";

    const service = new EmailService() as any;

    await service.send({
      to: "user@example.com",
      subject: "Subject",
      text: "line1\nline2",
    });

    expect(sgMail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: "line1<br>line2",
      }),
    );
  });

  it("includes inviter name and role when provided in invitation", async () => {
    process.env.BASE_URL = "https://idp.example.com";
    process.env.SENDGRID_API_KEY = "sg-key";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    process.env.SENDGRID_FROM_NAME = "AuthVader";

    const service = new EmailService();

    await service.sendInvitationEmail("user@example.com", {
      inviterName: "Jane",
      tenantName: "Acme",
      roleName: "Admin",
      inviteUrl: "https://app.example.com/invite/abc",
    });

    const sentPayload = (sgMail.send as jest.Mock).mock.calls[0][0];
    expect(sentPayload.text).toContain("Jane has invited you");
    expect(sentPayload.text).toContain(" as Admin");
  });

  it("sendWelcomeEmail uses generic subject when tenantName is missing", async () => {
    process.env.BASE_URL = "https://idp.example.com";
    process.env.SENDGRID_API_KEY = "sg-key";
    process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
    process.env.SENDGRID_FROM_NAME = "AuthVader";

    const service = new EmailService();

    await service.sendWelcomeEmail("user@example.com", { name: "John" });

    expect(sgMail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Welcome!",
      }),
    );
  });
});
