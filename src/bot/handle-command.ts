import {
  AttachmentBuilder,
  InteractionContextType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { channelMessages, channelText } from "@/core/channel";
import { verifyInputSchema } from "@/core/contracts";
import { AppError } from "@/core/errors";
import { verificationDate } from "@/core/verification-date";
import { executeVerification } from "@/server/execute-verification";
import { discordSession, type DiscordConfig } from "./config";
import { discordHelp } from "./commands";

const allowedMentions = { parse: [] as never[] };

export function createDiscordHandler(
  config: DiscordConfig,
  signal = new AbortController().signal,
) {
  // Only IDs and expiry times are retained. No interaction tokens or message text.
  const seen = new Map<string, number>();
  return async (interaction: ChatInputCommandInteraction) => {
    const now = Date.now();
    for (const [id, expires] of seen) if (expires <= now) seen.delete(id);
    if (seen.has(interaction.id) || signal.aborted) return;
    const privateReply = (content: string) =>
      interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
        allowedMentions,
      });
    if (
      interaction.applicationId !== config.applicationId ||
      interaction.authorizingIntegrationOwners.userId !== interaction.user.id ||
      ![
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ].includes(interaction.context!)
    ) {
      await privateReply(
        "Dodaj aplikację do swojego konta i użyj komendy w prywatnej rozmowie.",
      );
      return;
    }
    if (seen.size >= 1000) {
      await privateReply(
        "Bot ma teraz dużo zgłoszeń. Spróbuj ponownie za kilka minut.",
      );
      return;
    }
    seen.set(interaction.id, now + 15 * 60_000);
    if (interaction.commandName === "pomoc") {
      await privateReply(discordHelp);
      return;
    }
    if (interaction.commandName !== "sprawdz") {
      await privateReply("Nieznana komenda. Użyj /pomoc lub /sprawdz.");
      return;
    }
    // Acknowledge before any model, search, or database work (Discord's 3 s deadline).
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let answerStarted = false;
    try {
      const outcome = await executeVerification(
        async (startedAt) => {
          const parsed = verifyInputSchema.safeParse({
            claim: interaction.options.getString("teza", true),
            statedAt:
              interaction.options.getString("data") ??
              verificationDate(startedAt),
          });
          if (!parsed.success)
            throw new AppError(
              "INPUT_INVALID",
              parsed.error.issues[0]?.message ?? "Nieprawidłowa teza.",
              400,
            );
          if (/^https?:\/\/\S+$/i.test(parsed.data.claim))
            throw new AppError(
              "INPUT_INVALID",
              "Wklej treść tezy do sprawdzenia zamiast samego linku.",
              400,
            );
          return parsed.data;
        },
        discordSession(config, interaction.user.id),
        "discord",
        signal,
      );

      const messages =
        "sources" in outcome.body
          ? channelMessages(outcome.body)
          : [
              "message" in outcome.body
                ? outcome.body.message
                : "Nie udało się ukończyć sprawdzenia. Spróbuj ponownie.",
            ];
      // User-installed apps permit at most five follow-ups. Preserve larger results in a file.
      if (messages.length > 6 && "sources" in outcome.body) {
        await interaction.editReply({
          content: `${messages[0]}\n\nPełny wynik ze wszystkimi źródłami znajduje się w załączniku.`,
          files: [
            new AttachmentBuilder(
              Buffer.from(channelText(outcome.body), "utf8"),
              {
                name: "prawdowid-wynik.txt",
              },
            ),
          ],
          allowedMentions,
          flags: MessageFlags.SuppressEmbeds,
        });
        return;
      }
      for (let index = 0; index < messages.length; index++) {
        const content =
          messages.length > 1
            ? `(${index + 1}/${messages.length}) ${messages[index]}`
            : messages[index];
        if (index === 0) {
          await interaction.editReply({
            content,
            allowedMentions,
            flags: MessageFlags.SuppressEmbeds,
          });
          answerStarted = true;
        } else {
          await interaction.followUp({
            content,
            allowedMentions,
            flags: MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds,
          });
        }
      }
    } catch {
      // Discord errors may contain tokens or request bodies; never log the error object.
      console.error(JSON.stringify({ event: "discord_response_failed" }));
      const content = answerStarted
        ? "Nie udało się wysłać całej odpowiedzi. Uruchom /sprawdz ponownie, aby otrzymać pełny wynik ze źródłami."
        : "Nie udało się ukończyć sprawdzenia lub wysłać wyniku. Spróbuj ponownie.";
      try {
        if (answerStarted)
          await interaction.followUp({
            content,
            allowedMentions,
            flags: MessageFlags.Ephemeral,
          });
        else await interaction.editReply({ content, allowedMentions });
      } catch {
        /* Delivery is uncertain; do not automatically resend the whole result. */
      }
    }
  };
}
