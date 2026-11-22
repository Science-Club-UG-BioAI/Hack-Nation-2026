# Wdrożenie KitCheck na Ubuntu

Instrukcja zakłada Ubuntu 24.04 LTS i dostęp SSH do konta z `sudo`. KitCheck działa w Docker Compose pod `127.0.0.1:3000`. Nginx udostępnia aplikację pod `https://kitcheck.anovei.pl`, a Certbot instaluje i odnawia certyfikat Let's Encrypt.

## Wdrożenie skryptem Bash

Skopiuj [skrypt](scripts/deploy-ubuntu.sh) do katalogu domowego na VPS i uruchom poniższe polecenie. Wpisz swój adres e-mail oraz **nowy publiczny IPv4 VPS** zamiast wartości przykładowych. Zapora dostawcy VPS musi przepuszczać TCP 80 i 443. Uruchomienie skryptu akceptuje warunki Let's Encrypt.

```bash
bash ~/deploy-ubuntu.sh --email admin@example.com --ipv4 203.0.113.10
```

Skrypt uruchamia aplikację z `/opt/kitcheck` i pyta o klucze Gemini i Tavily przy pierwszym wdrożeniu. W trybie bez terminala podaj `--env-file /ścieżka/do/pliku`. Istniejącego `.env.local` skrypt użyje ponownie. Repozytorium prywatne możesz sklonować przez SSH, ustawiając `KITCHECK_REPO_URL` na adres repozytorium. Jeśli domena ma rekord `AAAA`, podaj także `--ipv6` z publicznym adresem VPS.

Przed uruchomieniem Certbota skrypt czeka do 10 minut na zgodne odpowiedzi publicznego DNS. Czas zmienisz przez `--dns-timeout SEK`. Jeśli limit minie, uruchom to samo polecenie po propagacji DNS. Skrypt wykorzystuje istniejącą konfigurację Nginx domeny przy kolejnych uruchomieniach, więc jeśli zmienisz port aplikacji, zaktualizuj również `proxy_pass`. [Google Public DNS](https://developers.google.com/speed/public-dns/docs/doh/json)

Poniżej znajduje się procedura ręczna z tymi samymi ustawieniami.

## 1. Przygotuj DNS i porty

W strefie `anovei.pl` ustaw rekord `A` dla `kitcheck` na publiczny IPv4 serwera. Rekord `AAAA` dodaj tylko wtedy, gdy serwer obsługuje IPv6 i domena będzie po nim dostępna na portach 80 i 443. W zaporze serwera i u dostawcy VPS udostępnij TCP 80 i 443. Port 80 musi pozostać publicznie dostępny do weryfikacji HTTP-01 przy wydaniu i odnawianiu certyfikatu. [Weryfikacja HTTP-01](https://letsencrypt.org/docs/challenge-types/#http-01-challenge) · [Obsługa IPv6](https://letsencrypt.org/docs/ipv6-support/)

## 2. Zainstaluj pakiety

Na nowym Ubuntu z włączoną sekcją `universe` wykonaj poniższe polecenia. Jeśli serwer ma już Docker Engine z działającym `docker compose`, pomiń instalację pakietów `docker.io`, `docker-buildx` i `docker-compose-v2`. Nginx musi móc zająć porty 80 i 443, więc sprawdź, czy nie obsługuje ich już inny serwer WWW. [Pakiety Docker w Ubuntu 24.04](https://packages.ubuntu.com/search?arch=amd64&keywords=docker&searchon=names&suite=noble-updates) · [Wtyczka Certbot dla Nginx](https://packages.ubuntu.com/noble/python3-certbot-nginx)

```bash
sudo apt update
sudo apt install git curl dnsutils nano nginx certbot python3-certbot-nginx
sudo apt install docker.io docker-buildx docker-compose-v2
sudo systemctl enable --now docker nginx
sudo docker compose version
```

Sprawdź, czy wyniki `dig` odpowiadają adresom VPS. Jeśli korzystasz z UFW, sprawdź jego stan i dodaj regułę `Nginx Full`.

```bash
dig +short kitcheck.anovei.pl A
dig +short kitcheck.anovei.pl AAAA
# Tylko jeśli korzystasz z UFW:
sudo ufw status
sudo ufw allow 'Nginx Full'
```

## 3. Uruchom aplikację

Sklonuj repozytorium jako użytkownik zalogowany przez SSH. Jeśli dostęp do repozytorium wymaga uwierzytelnienia, użyj konta lub klucza wdrożeniowego z dostępem do odczytu.

```bash
sudo install -d -o "$(id -un)" -g "$(id -gn)" /opt/kitcheck
git clone --branch main https://github.com/Science-Club-UG-BioAI/Hack-Nation-2026.git /opt/kitcheck
cd /opt/kitcheck
[ -e .env.local ] || install -m 600 .env.example .env.local
chmod 600 .env.local
nano .env.local
```

W `.env.local` uzupełnij `GEMINI_API_KEY` i `TAVILY_API_KEY`. Klucze do Google Fact Check, Serper i EUvsDisinfo są opcjonalne. `.env.local` jest wykluczony z Git i z kontekstu budowania obrazu. Dockerfile dostarcza Node.js, więc instalacja Node.js na hoście jest zbędna.

```bash
sudo docker compose build --pull
sudo docker compose up -d --no-build --wait
sudo docker compose ps
curl -fsS http://127.0.0.1:3000/api/health
```

Oczekiwany wynik to `{"status":"ok","providers":{"ready":true,"gemini":true,"tavily":true}}`. Kontrola zdrowia kontenera sprawdza odpowiedź HTTP, a `providers.ready` wskazuje obecność kluczy. Działanie kluczy potwierdzisz analizą w przeglądarce. Jeśli port 3000 jest zajęty, ustaw np. `KITCHECK_PORT=3001` w pliku `/opt/kitcheck/.env` i użyj portu 3001 w `proxy_pass` oraz lokalnych testach. Zachowaj adres `127.0.0.1`. [Publikowanie portów Dockera](https://docs.docker.com/engine/network/port-publishing/)

## 4. Skonfiguruj Nginx

Na pierwszym wdrożeniu utwórz konfigurację HTTP poniższym poleceniem. Na istniejącym wdrożeniu edytuj aktualny plik domeny, ponieważ Certbot zapisuje w nim konfigurację HTTPS. Zachowanie `Host` i `X-Forwarded-Proto` pozwala aplikacji sprawdzać pochodzenie żądań i ustawiać ciasteczka `Secure`. Wyłączone buforowanie pozwala przesyłać postęp analizy na bieżąco, a limit `4m` odpowiada limitowi obrazów w aplikacji. [Moduł proxy Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)

```bash
sudo tee /etc/nginx/sites-available/kitcheck.anovei.pl >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name kitcheck.anovei.pl;

    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header X-Forwarded-For $remote_addr;

        proxy_buffering off;
        proxy_read_timeout 90s;
        gzip off;
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/kitcheck.anovei.pl /etc/nginx/sites-enabled/kitcheck.anovei.pl
sudo nginx -t && sudo systemctl reload nginx
curl -fsS -H 'Host: kitcheck.anovei.pl' http://127.0.0.1/api/health
```

## 5. Włącz HTTPS i sprawdź odnowienie

Gdy DNS wskazuje na VPS i port 80 jest osiągalny z internetu, uruchom Certbot. Przy pierwszym uruchomieniu podaj adres e-mail i zaakceptuj warunki Let's Encrypt. `--redirect` włącza przekierowanie HTTP na HTTPS. [Podręcznik Certbot](https://eff-certbot.readthedocs.io/en/stable/using.html)

```bash
sudo certbot --nginx --redirect -d kitcheck.anovei.pl
sudo nginx -t
sudo systemctl enable --now certbot.timer
systemctl list-timers certbot.timer
sudo certbot renew --dry-run --cert-name kitcheck.anovei.pl
```

Na komputerze poza VPS sprawdź przekierowanie, certyfikat i konfigurację aplikacji. Pierwsze polecenie powinno zwrócić przekierowanie na `https://kitcheck.anovei.pl/`, drugie odpowiedź z `providers.ready: true`, a trzecie `200` i nagłówek `Set-Cookie` z atrybutem `Secure`.

```bash
curl -sSI http://kitcheck.anovei.pl/
curl -fsS https://kitcheck.anovei.pl/api/health
curl -fsS -D - -o /dev/null -X POST \
  -H 'Origin: https://kitcheck.anovei.pl' \
  -H 'X-Prawdowid-Action: start-session' \
  https://kitcheck.anovei.pl/api/session
```

Otwórz `https://kitcheck.anovei.pl` w przeglądarce, uruchom analizę krótkiej tezy i sprawdź, czy podczas oczekiwania pojawiają się etapy analizy. Prześlij też przykładowy obraz JPG, PNG lub WebP do 4 MiB.

## 6. Aktualizuj aplikację i sprawdzaj logi

```bash
cd /opt/kitcheck
git pull --ff-only && sudo docker compose build --pull && \
  sudo docker compose up -d --no-build --wait
curl -fsS https://kitcheck.anovei.pl/api/health
```

Uruchamiaj aktualizacje z tego samego katalogu, żeby Compose używał tego samego wolumenu SQLite. Po zmianie samych kluczy wystarczy wykonać `sudo docker compose up -d --no-build --force-recreate --wait`. Bot Discord działa jako osobny proces zgodnie z [instrukcją dla bota](README.md#bot-discord-bez-serwera).

```bash
cd /opt/kitcheck
sudo docker compose logs --tail=100 kitcheck
sudo tail -n 100 /var/log/nginx/error.log
sudo journalctl -u certbot.service -n 50 --no-pager
```

- Przy `502` sprawdź lokalne `/api/health`, mapowanie portu w `sudo docker compose ps` i adres w `proxy_pass`.
- Przy `403` z `/api/session` sprawdź, czy Nginx przekazuje `Host` oraz `X-Forwarded-Proto` i czy klient wysyła `Origin` z HTTPS.
- Przy błędzie walidacji certyfikatu sprawdź rekordy `A` i `AAAA`, dostępność TCP 80 z internetu oraz log `/var/log/letsencrypt/letsencrypt.log`.
