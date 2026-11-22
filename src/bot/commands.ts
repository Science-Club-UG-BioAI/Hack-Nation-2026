import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
} from "discord.js";

const command = (name: string, description: string) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
    .setContexts(
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    );

export const discordCommands = [
  command("sprawdz", "Sprawdź tezę i otrzymaj wynik ze źródłami.")
    .addStringOption((option) =>
      option
        .setName("teza")
        .setDescription("Jedna teza do sprawdzenia (do 500 znaków).")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(500),
    )
    .addStringOption((option) =>
      option
        .setName("data")
        .setDescription("Opcjonalna data odniesienia w formacie RRRR-MM-DD.")
        .setMinLength(10)
        .setMaxLength(10),
    ),
  command("pomoc", "Jak korzystać z Prawdowidu i jak przetwarzane są dane."),
].map((command) => command.toJSON());

export const discordHelp = [
  "Prawdowid sprawdza pojedyncze tezy tekstowe i podaje uzasadnienie oraz źródła.",
  "Użyj /sprawdz teza:Polska przystąpiła do NATO 12 marca 1999 roku.",
  "Możesz dodać opcjonalną datę odniesienia. Sam link, załączniki i obrazy nie są obsługiwane.",
  "Odpowiedzi widzisz tylko Ty. Wynik może zawierać ograniczenia lub informację, że brakuje podstaw do oceny.",
  "Tekst jest przetwarzany przez obecny silnik z usługami wyszukiwania i modelu. Zminimalizowany audyt jest przechowywany do 24 godzin, a bufor wyników do godziny. Identyfikator konta jest zastępowany kluczem HMAC. Nie wpisuj danych poufnych. Wiadomości w Discordzie podlegają osobnym zasadom Discorda.",
].join("\n\n");
