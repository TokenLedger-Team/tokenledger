#!/usr/bin/env bash
# Smoke test proxyja sa lažnim upstreamom, bez pravih ključeva. Koristi privremenu bazu.
# Pokretanje: npm run proxy-test
set -u
cd "$(dirname "$0")/.."
T="$(mktemp -d)"
export DB_PATH="$T/test.db" JWT_SECRET="smoke-test-secret-0123456789" PORT=8765
export OPENAI_BASE_URL="http://localhost:9199" ANTHROPIC_BASE_URL="http://localhost:9199" FAKE_PORT=9199
A="http://localhost:$PORT/api"
node scripts/fake-upstream.js >"$T/fake.log" 2>&1 & P1=$!
node src/server.js >"$T/api.log" 2>&1 & P2=$!
trap 'kill $P1 $P2 2>/dev/null; rm -rf "$T"' EXIT
for _ in $(seq 40); do curl -sf "$A/health" >/dev/null && break; sleep 0.25; done

FAIL=0
ok() { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; FAIL=1; }
check() { [ "$2" = "$3" ] && ok "$1" || bad "$1 (dobijeno '$2', očekivano '$3')"; }
j() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let o=JSON.parse(s);for(const k of process.argv[1].split("."))o=o?.[k];console.log(o??"")})' "$1"; }
H=(-H "Content-Type: application/json")

echo "Priprema"
TOKEN=$(curl -s "$A/auth/signup" "${H[@]}" -d '{"name":"Test","company":"Test d.o.o.","email":"t@test.rs","password":"lozinka123"}' | j token)
AUTH=(-H "Authorization: Bearer $TOKEN")
curl -s "$A/teams" "${AUTH[@]}" "${H[@]}" -d '{"name":"Support"}' >/dev/null
curl -s "$A/providers/openai/keys" "${AUTH[@]}" "${H[@]}" -d '{"apiKey":"sk-real-openai-KEY1"}' >/dev/null
curl -s "$A/providers/anthropic/keys" "${AUTH[@]}" "${H[@]}" -d '{"apiKey":"sk-ant-real-KEY2"}' >/dev/null
PK=$(curl -s "$A/proxy-keys" "${AUTH[@]}" "${H[@]}" -d '{"name":"agent"}' | j key)
check "proxy ključ ima prefiks tl_" "${PK:0:3}" "tl_"
check "GET /proxy-keys ne vraća ključ" "$(curl -s "$A/proxy-keys" "${AUTH[@]}" | grep -c "$PK")" "0"
check "/org proxyUrl" "$(curl -s "$A/org" "${AUTH[@]}" | j proxyUrl)" "http://localhost:8000/api/proxy"
check "/proxy/status pre poziva: lastCallAt" "$(curl -s "$A/proxy/status" "${AUTH[@]}" | j lastCallAt)" ""

P="$A/proxy"
TAGS=(-H "X-TL-Team: support" -H "X-TL-Function: faq-answers" -H "X-TL-Client: acme")
BODY='{"model":"gpt-4o-mini","messages":[{"role":"user","content":"zdravo"}]}'
SUM() { curl -s "$A/stats/summary?from=$(date -v-1d +%F 2>/dev/null || date -d yesterday +%F)&to=$(date -v+1d +%F 2>/dev/null || date -d tomorrow +%F)" "${AUTH[@]}"; }

echo "Autentikacija"
check "bez ključa -> 401" "$(curl -s -o /dev/null -w '%{http_code}' "$P/openai/v1/chat/completions" "${H[@]}" -d "$BODY")" "401"
check "pogrešan ključ -> 401" "$(curl -s -o /dev/null -w '%{http_code}' "$P/openai/v1/chat/completions" -H 'Authorization: Bearer tl_nope' "${H[@]}" -d "$BODY")" "401"
check "JWT nije proxy ključ -> 401" "$(curl -s -o /dev/null -w '%{http_code}' "$P/openai/v1/chat/completions" "${AUTH[@]}" "${H[@]}" -d "$BODY")" "401"
check "anthropic bez x-api-key -> 401" "$(curl -s -o /dev/null -w '%{http_code}' "$P/anthropic/v1/messages" "${H[@]}" -d "$BODY")" "401"

echo "OpenAI bez streama"
R=$(curl -s -w '\n%{http_code}' "$P/openai/v1/chat/completions" -H "Authorization: Bearer $PK" "${TAGS[@]}" "${H[@]}" -d "$BODY")
check "status 200" "$(echo "$R" | tail -1)" "200"
check "pravi provajder ključ stiže upstreamu" "$(echo "$R" | head -1 | j _auth)" "Bearer sk-real-openai-KEY1"
check "usage nepromenjen u odgovoru" "$(echo "$R" | head -1 | j usage.prompt_tokens)" "11"
S=$(SUM); check "summary: 1 zahtev" "$(echo "$S" | j requests)" "1"; check "summary: 18 tokena" "$(echo "$S" | j totalTokens)" "18"
check "/proxy/status ima lastCallAt" "$(curl -s "$A/proxy/status" "${AUTH[@]}" | j lastCallAt | grep -c 'T')" "1"
check "tim support dobio funkciju" "$(curl -s "$A/teams" "${AUTH[@]}" | grep -c 'faq-answers')" "1"

echo "OpenAI stream"
OUT=$(curl -sN "$P/openai/v1/chat/completions" -H "Authorization: Bearer $PK" "${TAGS[@]}" "${H[@]}" -d '{"model":"gpt-4o-mini","stream":true,"messages":[]}')
check "SSE stiže klijentu (DONE)" "$(echo "$OUT" | grep -c 'data: \[DONE\]')" "1"
sleep 0.3
S=$(SUM); check "summary: 2 zahteva" "$(echo "$S" | j requests)" "2"; check "tokeni sa streama (18+26)" "$(echo "$S" | j totalTokens)" "44"

echo "Responses"
curl -s -o /dev/null "$P/openai/v1/responses" -H "Authorization: Bearer $PK" "${TAGS[@]}" "${H[@]}" -d '{"model":"gpt-4.1","input":"x"}'
check "responses: +42 tokena" "$(SUM | j totalTokens)" "86"

echo "Anthropic"
R=$(curl -s "$P/anthropic/v1/messages" -H "x-api-key: $PK" "${TAGS[@]}" "${H[@]}" -d '{"model":"claude-3-5-haiku-20241022","max_tokens":10,"messages":[]}')
check "pravi Anthropic ključ stiže upstreamu" "$(echo "$R" | j _key)" "sk-ant-real-KEY2"
check "podrazumevana anthropic-version" "$(echo "$R" | j _ver)" "2023-06-01"
check "anthropic: +23 tokena" "$(SUM | j totalTokens)" "109"
curl -sN "$P/anthropic/v1/messages" -H "Authorization: Bearer $PK" "${TAGS[@]}" "${H[@]}" -d '{"model":"claude-3-5-haiku-20241022","max_tokens":10,"stream":true,"messages":[]}' >/dev/null
sleep 0.3
check "anthropic stream: +40 tokena (25+15)" "$(SUM | j totalTokens)" "149"

echo "Greške i nepoznato"
for i in 1 2 3 4 5; do CODE=$(curl -s -o /dev/null -w '%{http_code}' "$P/openai/v1/chat/completions" -H "Authorization: Bearer $PK" "${TAGS[@]}" "${H[@]}" -d '{"model":"fail-x"}'); done
check "429 upstreama se prosleđuje" "$CODE" "429"
check "greške se ne broje kao potrošnja" "$(SUM | j requests)" "5"
check "retry anomalija (5 grešaka)" "$(curl -s "$A/insights/anomalies" "${AUTH[@]}" | j 0.failedRetries)" "5"
curl -s -o /dev/null "$P/openai/v1/chat/completions" -H "Authorization: Bearer $PK" -H "Content-Type: application/json" -d "$BODY"
check "bez X-TL-Team -> tim Unassigned" "$(curl -s "$A/teams" "${AUTH[@]}" | grep -c '"slug":"unassigned"')" "1"
curl -s -o /dev/null "$P/openai/v1/chat/completions" -H "Authorization: Bearer $PK" "${H[@]}" -d '{"model":"gpt-9-new","messages":[]}'
check "nepoznat model dodat sa cenom 0" "$(curl -s "$A/models" "${AUTH[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).filter(m=>m.id==="gpt-9-new-2024-07-18"&&m.inputPricePer1M===0).length))')" "1"
check "ključ nije u logu" "$(grep -c 'sk-real\|sk-ant-real\|tl_' "$T/api.log")" "0"

echo "Izvor potrošnje (by=source)"
D=$(date +%F)
PS=$(SUM)
curl -s "$A/usage/import" "${AUTH[@]}" "${H[@]}" -d "{\"rows\":[{\"date\":\"$D\",\"team\":\"support\",\"function\":\"csv-fn\",\"model\":\"gpt-4o-mini\",\"inputTokens\":\"1000\",\"outputTokens\":\"500\",\"cost\":\"1.5\",\"requests\":\"3\"}]}" >/dev/null
BS=$(curl -s "$A/stats/breakdown?from=$D&to=$D&by=source" "${AUTH[@]}")
BJ() { echo "$BS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);const r=a.find(x=>x.key===process.argv[1]);console.log(r?r[process.argv[2]]:"")})' "$1" "$2"; }
check "source: 2 izvora" "$(echo "$BS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).length))')" "2"
check "source: import tokeni" "$(BJ import tokens)" "1500"
check "source: import zahtevi" "$(BJ import requests)" "3"
check "source: import trošak" "$(BJ import cost)" "1.5"
check "source: import label" "$(BJ import label)" "import"
check "source: proxy tokeni = summary pre uvoza" "$(BJ proxy tokens)" "$(echo "$PS" | j totalTokens)"
check "source: proxy zahtevi = summary pre uvoza" "$(BJ proxy requests)" "$(echo "$PS" | j requests)"
check "source: proxy label" "$(BJ proxy label)" "proxy"
check "source: sortirano po trošku opadajuće" "$(echo "$BS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);console.log(a[0].cost>=a[1].cost)})')" "true"
check "source: nepoznat by -> 400" "$(curl -s -o /dev/null -w '%{http_code}' "$A/stats/breakdown?from=$D&to=$D&by=nope" "${AUTH[@]}")" "400"

echo "Opoziv"
ID=$(curl -s "$A/proxy-keys" "${AUTH[@]}" | j 0.id)
curl -s -X DELETE "$A/proxy-keys/$ID" "${AUTH[@]}" -o /dev/null
check "obrisan ključ -> 401" "$(curl -s -o /dev/null -w '%{http_code}' "$P/openai/v1/chat/completions" -H "Authorization: Bearer $PK" "${H[@]}" -d "$BODY")" "401"

[ $FAIL = 0 ] && echo "SVE PROŠLO" || { echo "IMA GREŠAKA"; echo "--- api.log"; cat "$T/api.log"; }
exit $FAIL
