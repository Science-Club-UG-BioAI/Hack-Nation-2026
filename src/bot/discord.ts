import { Client, Events } from "discord.js";
import { requireConfiguration } from "@/server/config";
import { discordConfig } from "./config";
import { createDiscordHandler } from "./handle-command";

async function main() {
  const config = discordConfig();
  requireConfiguration();
  // Interactions arrive without privileged intents or reading ordinary messages.
  const client = new Client({ intents: [] });
  const controller = new AbortController();
  const handle = createDiscordHandler(config, controller.signal);
  const pending = new Set<Promise<void>>();
  client.once(Events.ClientReady, (ready) => {
    if (ready.application.id !== config.applicationId) {
      console.error(
        "Token należy do innej aplikacji niż DISCORD_APPLICATION_ID.",
      );
      client.destroy();
      process.exitCode = 1;
      return;
    }
    console.info(
      "Prawdowid Discord działa. Użyj /sprawdz w prywatnej rozmowie.",
    );
  });
  client.on(Events.Error, () =>
    console.error("Błąd połączenia Discord. Sprawdź dostęp do sieci."),
  );
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand() || controller.signal.aborted) return;
    const task = handle(interaction).catch(() => {
      console.error(JSON.stringify({ event: "discord_interaction_failed" }));
    });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  const shutdown = async () => {
    if (controller.signal.aborted) return;
    controller.abort();
    await Promise.allSettled([...pending]);
    client.destroy();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  try {
    await client.login(config.token);
  } catch {
    client.destroy();
    throw new Error(
      "Nie udało się zalogować bota Discord. Sprawdź DISCORD_BOT_TOKEN i połączenie z siecią.",
    );
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Nie udało się uruchomić bota.",
  );
  process.exitCode = 1;
});
