import { createHmac } from "node:crypto";

export function discordConfig() {
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Uzupełnij ${name} w .env.local.`);
    return value;
  };
  const config = {
    token: required("DISCORD_BOT_TOKEN"),
    applicationId: required("DISCORD_APPLICATION_ID"),
    sessionKey: required("DISCORD_SESSION_KEY"),
  };
  if (!/^\d{17,20}$/.test(config.applicationId))
    throw new Error(
      "DISCORD_APPLICATION_ID musi być identyfikatorem aplikacji Discord.",
    );
  if (!/^[a-f\d]{64}$/i.test(config.sessionKey))
    throw new Error("DISCORD_SESSION_KEY musi zawierać 64 znaki szesnastkowe.");
  return config;
}

export type DiscordConfig = ReturnType<typeof discordConfig>;

export function discordSession(config: DiscordConfig, userId: string) {
  return createHmac("sha256", config.sessionKey)
    .update(JSON.stringify(["discord", config.applicationId, userId]))
    .digest("hex");
}

export function discordInstallUrl(applicationId: string) {
  const query = new URLSearchParams({
    client_id: applicationId,
    integration_type: "1",
    scope: "applications.commands",
  });
  return `https://discord.com/oauth2/authorize?${query}`;
}
