import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createDiscordHandler } from "@/bot/handle-command";
import { discordConfig, discordInstallUrl, discordSession } from "@/bot/config";
import { discordCommands } from "@/bot/commands";
import { channelMessages } from "@/core/channel";
import { demoResult } from "@/core/demo";
import { AppError, invalidOutput } from "@/core/errors";
import { runVerification } from "@/server/verification-service";
import { sessionAudit } from "@/server/audit-store";

vi.mock("@/server/verification-service", () => ({ runVerification: vi.fn() }));

const config = {
  applicationId: "123456789012345678",
  token: "test-token",
  sessionKey: "ab".repeat(32),
};
const claim = "Polska przystąpiła do NATO 12 marca 1999 roku.";
function interaction(
  values: Record<string, string | null | undefined> = { teza: claim },
) {
  const userId = randomUUID();
  const mock = {
    id: randomUUID(),
    applicationId: config.applicationId,
    commandName: "sprawdz",
    user: { id: userId },
    context: InteractionContextType.PrivateChannel,
    authorizingIntegrationOwners: { userId: userId as string | null },
    options: { getString: vi.fn((name: string) => values[name] ?? null) },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
  };
  return { mock, value: mock as unknown as ChatInputCommandInteraction };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubEnv("TAVILY_API_KEY", "test");
  vi.stubEnv("ALERT_WEBHOOK_URL", "");
  vi.mocked(runVerification).mockImplementation(async () => ({
    result: { ...demoResult("nato")!, requestId: randomUUID(), mode: "live" },
    reused: false,
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("defers first, verifies as Discord, writes the audit, and delivers all citations privately", async () => {
  const { mock, value } = interaction({ teza: claim, data: "2026-11-21" });
  await createDiscordHandler(config)(value);
  expect(mock.deferReply).toHaveBeenCalledWith({
    flags: MessageFlags.Ephemeral,
  });
  expect(mock.deferReply.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(runVerification).mock.invocationCallOrder[0],
  );
  expect(runVerification).toHaveBeenCalledWith(
    { claim, statedAt: "2026-11-21" },
    discordSession(config, mock.user.id),
    expect.any(String),
    expect.any(AbortSignal),
    undefined,
    "discord",
  );
  const replies = [
    ...mock.editReply.mock.calls,
    ...mock.followUp.mock.calls,
  ].map(([body]) => body);
  const content = replies.map((body) => body.content).join("\n");
  expect(content).toContain("Ocena: Potwierdzone");
  expect(content).not.toContain("adapter demonstracyjny");
  for (const source of demoResult("nato")!.sources)
    expect(content).toContain(source.url);
  for (const evidence of demoResult("nato")!.evidence)
    expect(content).toContain(evidence.quote);
  expect(
    replies.every(
      (body) =>
        body.content.length <= 2000 && body.allowedMentions.parse.length === 0,
    ),
  ).toBe(true);
  for (const [body] of mock.followUp.mock.calls)
    expect(body.flags & MessageFlags.Ephemeral).toBeTruthy();
  const audit = sessionAudit(discordSession(config, mock.user.id));
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({ channel: "discord", claim });
  expect(JSON.stringify(audit)).not.toContain(mock.user.id);
});

it.each([
  { teza: "" },
  { teza: "x".repeat(501) },
  { teza: claim, data: "2026-02-30" },
  { teza: "https://example.org/article" },
])("rejects invalid text/date before using the engine: %j", async (values) => {
  const { mock, value } = interaction(values);
  await createDiscordHandler(config)(value);
  expect(runVerification).not.toHaveBeenCalled();
  expect(mock.editReply).toHaveBeenCalledOnce();
});

it("does not verify a repeated delivery, including concurrent duplicates", async () => {
  const { mock, value } = interaction();
  const handle = createDiscordHandler(config);
  await Promise.all([handle(value), handle(value)]);
  await handle(value);
  expect(runVerification).toHaveBeenCalledOnce();
  expect(mock.deferReply).toHaveBeenCalledOnce();
});

it("isolates user sessions and accepts bot DM without a guild", async () => {
  const first = interaction(),
    second = interaction();
  first.mock.context = InteractionContextType.BotDM;
  const handle = createDiscordHandler(config);
  await handle(first.value);
  await handle(second.value);
  const sessions = vi.mocked(runVerification).mock.calls.map((call) => call[1]);
  expect(new Set(sessions).size).toBe(2);
  expect(sessions.every((session) => /^[a-f\d]{64}$/.test(session))).toBe(true);
});

it("rejects invocations without the caller's user installation", async () => {
  const { mock, value } = interaction();
  mock.authorizingIntegrationOwners.userId = "someone-else";
  await createDiscordHandler(config)(value);
  expect(runVerification).not.toHaveBeenCalled();
  expect(mock.deferReply).not.toHaveBeenCalled();
  expect(mock.reply).toHaveBeenCalledOnce();
});

it("rejects guild invocations even if the user has installed the app", async () => {
  const { mock, value } = interaction();
  mock.context = InteractionContextType.Guild;
  await createDiscordHandler(config)(value);
  expect(runVerification).not.toHaveBeenCalled();
  expect(mock.reply).toHaveBeenCalledOnce();
});

it("does not start costly work if Discord cannot acknowledge", async () => {
  const { mock, value } = interaction();
  mock.deferReply.mockRejectedValue(new Error("offline"));
  await expect(createDiscordHandler(config)(value)).rejects.toThrow("offline");
  expect(runVerification).not.toHaveBeenCalled();
});

it("returns a rate-limit error without inventing a verdict", async () => {
  vi.mocked(runVerification).mockRejectedValue(
    new AppError("RATE_LIMITED", "Spróbuj później.", 429, true),
  );
  const { mock, value } = interaction();
  await createDiscordHandler(config)(value);
  expect(mock.editReply).toHaveBeenCalledWith(
    expect.objectContaining({ content: "Spróbuj później." }),
  );
});

it("explains an unfinished model response without presenting a verdict", async () => {
  vi.mocked(runVerification).mockRejectedValue(
    invalidOutput(["interaction_incomplete"]),
  );
  const { mock, value } = interaction();
  await createDiscordHandler(config)(value);
  expect(mock.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content:
        "Usługa analizy zwróciła niedokończoną odpowiedź. Nie wydano oceny. Spróbuj ponownie.",
    }),
  );
});

it("preserves a long answer in an attachment instead of exceeding the follow-up limit", async () => {
  const result = demoResult("nato")!;
  result.limitations = ["Ograniczenie testowe. ".repeat(1000)];
  vi.mocked(runVerification).mockResolvedValue({ result, reused: false });
  const { mock, value } = interaction();
  await createDiscordHandler(config)(value);
  expect(mock.followUp).not.toHaveBeenCalled();
  const body = mock.editReply.mock.calls[0][0];
  expect(body.files).toHaveLength(1);
  const text = body.files[0].attachment.toString("utf8");
  expect(text).toContain(result.limitations[0]);
  for (const source of result.sources) expect(text).toContain(source.url);
  expect(body.content.length).toBeLessThanOrEqual(2000);
});

it("reports partial delivery without rerunning verification or replacing the first result", async () => {
  const { mock, value } = interaction();
  mock.followUp.mockRejectedValueOnce(new Error("offline"));
  const result = demoResult("nato")!;
  result.limitations = ["x".repeat(2500)];
  vi.mocked(runVerification).mockResolvedValue({ result, reused: false });
  await createDiscordHandler(config)(value);
  expect(runVerification).toHaveBeenCalledOnce();
  expect(mock.editReply).toHaveBeenCalledOnce();
  expect(mock.followUp.mock.calls.at(-1)![0].content).toContain(
    "Nie udało się wysłać całej odpowiedzi",
  );
});

it("answers help without model use", async () => {
  const { mock, value } = interaction();
  mock.commandName = "pomoc";
  await createDiscordHandler(config)(value);
  expect(runVerification).not.toHaveBeenCalled();
  expect(mock.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      flags: MessageFlags.Ephemeral,
      content: expect.stringContaining("/sprawdz"),
    }),
  );
});

it("does not split emoji surrogate pairs across messages", () => {
  const result = demoResult("context")!;
  result.explanation = "x".repeat(1799) + "😀" + "y".repeat(100);
  const messages = channelMessages(result);
  expect(messages.join("")).toContain("😀");
  expect(
    messages.every(
      (message) => message.isWellFormed() && message.length <= 1800,
    ),
  ).toBe(true);
});

it("registers only private user-install commands and creates a server-free installation link", () => {
  for (const command of discordCommands) {
    expect(command.integration_types).toEqual([
      ApplicationIntegrationType.UserInstall,
    ]);
    expect(command.contexts).toEqual([
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ]);
  }
  const url = new URL(discordInstallUrl(config.applicationId));
  expect(url.searchParams.get("integration_type")).toBe("1");
  expect(url.searchParams.get("scope")).toBe("applications.commands");
  expect(url.searchParams.has("guild_id")).toBe(false);
});

it("requires complete config and a strong session secret without leaking token values", () => {
  vi.stubEnv("DISCORD_BOT_TOKEN", "test-sensitive-token");
  vi.stubEnv("DISCORD_APPLICATION_ID", config.applicationId);
  vi.stubEnv("DISCORD_SESSION_KEY", "weak");
  expect(discordConfig).toThrow("DISCORD_SESSION_KEY");
  vi.stubEnv("DISCORD_SESSION_KEY", config.sessionKey);
  expect(discordConfig().applicationId).toBe(config.applicationId);
});
