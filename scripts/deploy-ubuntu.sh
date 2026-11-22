#!/usr/bin/env bash
set -Eeuo pipefail

domain=kitcheck.anovei.pl
app_dir=/opt/kitcheck
repo=${KITCHECK_REPO_URL:-https://github.com/Science-Club-UG-BioAI/Hack-Nation-2026.git}
email=''
ipv4=''
ipv6=''
env_source=''
dns_timeout=600

usage() {
    cat <<'EOF'
Użycie: bash deploy-ubuntu.sh --email EMAIL --ipv4 ADRES [opcje]

Wdraża KitCheck na Ubuntu pod https://kitcheck.anovei.pl.
--email EMAIL       Adres konta Let's Encrypt. Uruchomienie akceptuje warunki usługi.
--ipv4 ADRES        Nowy publiczny IPv4 VPS, oczekiwany w rekordzie A.
--ipv6 ADRES        Publiczny IPv6 VPS, jeśli domena ma rekord AAAA.
--env-file PLIK     Plik z kluczami do skopiowania przy pierwszym wdrożeniu.
--dns-timeout SEK   Czas oczekiwania na DNS. Domyślnie 600. 0 sprawdza raz.
--help              Wyświetla pomoc.

Bez --env-file skrypt zapyta o klucze Gemini i Tavily przy pierwszym wdrożeniu.
KITCHECK_REPO_URL pozwala użyć innego adresu Git przy pierwszym klonowaniu.
EOF
}

die() {
    printf 'Błąd: %s\n' "$*" >&2
    exit 1
}

while (( $# )); do
    case $1 in
        -h|--help) usage; exit 0 ;;
        --email|--ipv4|--ipv6|--env-file|--dns-timeout)
            (( $# >= 2 )) && [[ -n $2 && $2 != --* ]] || die "Podaj wartość dla $1."
            case $1 in
                --email) email=$2 ;;
                --ipv4) ipv4=$2 ;;
                --ipv6) ipv6=$2 ;;
                --env-file) env_source=$2 ;;
                --dns-timeout) dns_timeout=$2 ;;
            esac
            shift 2
            ;;
        *) die "Nieznana opcja $1. Zobacz --help." ;;
    esac
done

[[ $email =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die 'Podaj poprawny --email.'
[[ -n $ipv4 ]] || die 'Podaj nowy publiczny adres VPS przez --ipv4.'
[[ $dns_timeout =~ ^(0|[1-9][0-9]{0,5})$ ]] || die '--dns-timeout wymaga całkowitej liczby sekund.'
if [[ -n $env_source ]]; then
    [[ -f $env_source && -r $env_source ]] || die 'Plik wskazany przez --env-file musi być dostępny do odczytu.'
    env_source=$(realpath -- "$env_source")
fi

trap 'printf "Wdrożenie przerwane w linii %s. Sprawdź komunikat powyżej.\n" "$LINENO" >&2' ERR
# shellcheck disable=SC1091
. /etc/os-release
[[ ${ID:-} == ubuntu ]] || die 'Ten instalator jest przeznaczony dla Ubuntu.'

admin=()
if (( EUID != 0 )); then
    admin=(sudo)
    sudo -v
fi

if [[ ! -d $app_dir ]]; then
    "${admin[@]}" install -d -o "$EUID" -g "$(id -g)" "$app_dir"
fi
cd "$app_dir"
# Blokada katalogu działa przed klonowaniem do pustego katalogu.
exec {deploy_lock}< .
flock -n "$deploy_lock" || die "Wdrożenie w $app_dir jest już uruchomione."

printf '\nInstalacja pakietów Ubuntu\n'
apt=("${admin[@]}" env DEBIAN_FRONTEND=noninteractive apt-get)
"${apt[@]}" update
if ! apt-cache show python3-certbot-nginx >/dev/null 2>&1; then
    "${apt[@]}" install -y software-properties-common
    "${admin[@]}" add-apt-repository -y universe
fi
"${apt[@]}" install -y git curl ca-certificates nginx certbot python3-certbot-nginx python3
if ! "${admin[@]}" docker compose version >/dev/null 2>&1; then
    if [[ $(dpkg-query -W -f='${Status}' docker-ce 2>/dev/null) == 'install ok installed' ]]; then
        "${apt[@]}" install -y docker-buildx-plugin docker-compose-plugin
    else
        "${apt[@]}" install -y docker.io docker-buildx docker-compose-v2
    fi
fi
"${admin[@]}" systemctl enable --now docker nginx

normalize_ip() {
    python3 -c '
from ipaddress import IPv4Address, IPv6Address
import sys

address_type = IPv4Address if sys.argv[1] == "4" else IPv6Address
print(address_type(sys.argv[2]))
' "$1" "$2" 2>/dev/null
}

ipv4=$(normalize_ip 4 "$ipv4") || die 'Niepoprawny adres IPv4 w --ipv4.'
if [[ -n $ipv6 ]]; then
    ipv6=$(normalize_ip 6 "$ipv6") || die 'Niepoprawny adres IPv6 w --ipv6.'
fi

printf '\nPrzygotowanie repozytorium i kluczy\n'
if [[ -e .git ]]; then
    git pull --ff-only
else
    git clone --branch main -- "$repo" .
fi

if [[ -e .env.local ]]; then
    chmod 600 .env.local
elif [[ -n $env_source ]]; then
    install -m 600 -- "$env_source" .env.local
else
    [[ -t 0 ]] || die 'Podaj --env-file przy pierwszym wdrożeniu bez terminala.'
    (
        IFS= read -rs -p 'GEMINI_API_KEY: ' gemini_key
        printf '\n' >&2
        IFS= read -rs -p 'TAVILY_API_KEY: ' tavily_key
        printf '\n' >&2
        [[ $gemini_key =~ ^[a-zA-Z0-9_-]+$ && $tavily_key =~ ^[a-zA-Z0-9_-]+$ ]] || \
            die 'Wprowadź oba klucze. Jeśli zawierają znaki specjalne, użyj --env-file.'
        umask 077
        env_tmp=$(mktemp .env.local.XXXXXX)
        trap 'rm -f -- "$env_tmp"' EXIT
        sed '/^GEMINI_API_KEY=/d; /^TAVILY_API_KEY=/d' .env.example > "$env_tmp"
        printf '\nGEMINI_API_KEY=%s\nTAVILY_API_KEY=%s\n' "$gemini_key" "$tavily_key" >> "$env_tmp"
        mv -- "$env_tmp" .env.local
    )
fi

compose=("${admin[@]}" env KITCHECK_ENV_FILE=.env.local KITCHECK_BIND_ADDRESS=127.0.0.1
    docker compose -f compose.yaml -p kitcheck)
app_port=$("${compose[@]}" config --format json | python3 -c '
import json
import sys

service = json.load(sys.stdin)["services"]["kitcheck"]
environment = service["environment"]
if any(not (environment.get(key) or "").strip() for key in ("GEMINI_API_KEY", "TAVILY_API_KEY")):
    sys.exit("Uzupełnij GEMINI_API_KEY i TAVILY_API_KEY w /opt/kitcheck/.env.local.")
[binding] = service["ports"]
published = str(binding["published"])
if binding["host_ip"] != "127.0.0.1" or not published.isdecimal() or not 1 <= int(published) <= 65535:
    sys.exit("Compose musi publikować KitCheck na 127.0.0.1 i jednym porcie TCP.")
print(published)
')

check_health() {
    curl --noproxy '*' --fail --silent --show-error --max-time 15 "$@" | python3 -c '
import json
import sys

body = json.load(sys.stdin)
if body.get("status") != "ok" or body.get("providers", {}).get("ready") is not True:
    sys.exit("KitCheck nie zgłasza gotowości w /api/health.")
'
}

printf '\nBudowanie i uruchamianie KitCheck\n'
"${compose[@]}" build --pull
"${compose[@]}" up -d --no-build --wait --wait-timeout 120
check_health "http://127.0.0.1:$app_port/api/health"

printf '\nKonfiguracja Nginx\n'
available_site=/etc/nginx/sites-available/$domain
enabled_site=/etc/nginx/sites-enabled/$domain
created_config=false
created_link=false
if [[ ! -e $enabled_site ]]; then
    if [[ ! -e $available_site && ! -L $available_site ]]; then
        "${admin[@]}" tee "$available_site" >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $domain;
    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:$app_port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_buffering off;
        proxy_read_timeout 90s;
        gzip off;
    }
}
NGINX
        created_config=true
    fi
    if [[ ! -L $enabled_site ]]; then
        "${admin[@]}" ln -s "$available_site" "$enabled_site"
        created_link=true
    fi
fi
if ! nginx_check=$("${admin[@]}" nginx -t 2>&1) || [[ $nginx_check == *"conflicting server name \"$domain\""* ]]; then
    printf '%s\n' "$nginx_check" >&2
    if $created_link; then "${admin[@]}" unlink "$enabled_site"; fi
    if $created_config; then "${admin[@]}" unlink "$available_site"; fi
    die "Sprawdź konfigurację Nginx dla $domain."
fi
"${admin[@]}" systemctl reload nginx
if $created_config; then
    check_health --retry 3 --retry-all-errors --retry-delay 1 \
        --resolve "$domain:80:127.0.0.1" "http://$domain/api/health"
fi
if command -v ufw >/dev/null && [[ $("${admin[@]}" env LC_ALL=C ufw status) == 'Status: active'* ]]; then
    "${admin[@]}" ufw allow 'Nginx Full'
fi

dns_records() {
    curl --fail --silent --max-time 8 --get https://dns.google/resolve \
        --data-urlencode "name=$domain" --data-urlencode "type=$1" | python3 -c '
from ipaddress import ip_address
import json
import sys

try:
    response = json.load(sys.stdin)
    if response["Status"] != 0 or response.get("TC"):
        sys.exit(1)
    records = {str(ip_address(record["data"])) for record in response.get("Answer", [])
               if record["type"] == int(sys.argv[1])}
    print(" ".join(sorted(records)))
except (KeyError, ValueError):
    sys.exit(1)
' "$1"
}

printf '\nSprawdzanie publicznego DNS dla %s\n' "$domain"
deadline=$(( SECONDS + dns_timeout ))
while true; do
    if records_a=$(dns_records 1) && records_aaaa=$(dns_records 28); then
        if [[ $records_a == "$ipv4" && $records_aaaa == "$ipv6" ]]; then
            break
        fi
        printf 'DNS zwraca A=%s, AAAA=%s. Oczekiwane A=%s, AAAA=%s.\n' \
            "${records_a:-brak}" "${records_aaaa:-brak}" "$ipv4" "${ipv6:-brak}"
    else
        printf 'Brak poprawnej odpowiedzi z publicznego DNS.\n'
    fi
    remaining=$(( deadline - SECONDS ))
    (( remaining > 0 )) || die 'DNS jeszcze się nie zgadza. Po propagacji uruchom skrypt ponownie.'
    sleep "$(( remaining < 15 ? remaining : 15 ))"
done

printf '\nKonfiguracja HTTPS i odnawiania certyfikatu\n'
"${admin[@]}" certbot --nginx --non-interactive --agree-tos --email "$email" \
    --redirect --keep-until-expiring --cert-name "$domain" -d "$domain"
"${admin[@]}" nginx -t
"${admin[@]}" systemctl enable --now certbot.timer

redirect=$(curl --noproxy '*' --fail --silent --show-error --max-time 15 --output /dev/null \
    --write-out '%{redirect_url}' --resolve "$domain:80:127.0.0.1" "http://$domain/")
[[ $redirect == "https://$domain/" ]] || die "Nginx nie przekierowuje HTTP na https://$domain/."
check_health --resolve "$domain:443:127.0.0.1" "https://$domain/api/health"
"${admin[@]}" certbot renew --dry-run --cert-name "$domain"

printf '\nWdrożenie zakończone. Aplikacja działa pod https://%s/\n' "$domain"
