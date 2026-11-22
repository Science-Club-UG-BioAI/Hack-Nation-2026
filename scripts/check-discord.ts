import { requireConfiguration } from "@/server/config";
import { discordConfig, discordInstallUrl } from "@/bot/config";

try {
  const config = discordConfig();
  requireConfiguration();
  console.info(
    "Lokalna konfiguracja jest kompletna. Ten test nie sprawdza tokenu w Discordzie ani dostępu do dostawców analizy.",
  );
  console.info(discordInstallUrl(config.applicationId));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Nieprawidłowa konfiguracja.",
  );
  process.exitCode = 1;
}
