import { REST, Routes } from "discord.js";
import { discordCommands } from "@/bot/commands";
import { discordConfig, discordInstallUrl } from "@/bot/config";

async function main() {
  const config = discordConfig();
  const rest = new REST({ version: "10" }).setToken(config.token);
  // Upsert our named commands, preserving any other commands in the application.
  for (const command of discordCommands) {
    try {
      await rest.post(Routes.applicationCommands(config.applicationId), {
        body: command,
      });
      console.info(`Zarejestrowano /${command.name}.`);
    } catch {
      throw new Error(
        `Nie udało się zarejestrować /${command.name}. Sprawdź token, Application ID i włączenie User Install w portalu Discord.`,
      );
    }
  }
  console.info("Link do dodania aplikacji na własne konto:");
  console.info(discordInstallUrl(config.applicationId));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Rejestracja komend nie powiodła się.",
  );
  process.exitCode = 1;
});
