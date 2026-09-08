# Quickstart Guide — Twitch + TikTok LIVE em Node.js com PNPM

Guia rápido para validar leitura de chat em tempo real da **Twitch** e do **TikTok LIVE** via terminal usando **Node.js** e **PNPM**.

O objetivo é validar tecnologias para um futuro aplicativo desktop em **Electron**, executando as conexões diretamente na máquina do usuário e evitando a necessidade de um backend próprio apenas para retransmitir mensagens.

> Status atual do teste:
>
> - ✅ Twitch: leitura anônima funcionando.
> - ⚠️ TikTok: integração comunitária; pode depender de resolução/assinatura via Euler Stream e pode sofrer alterações ou limitações externas.

---

## 1. Ambiente usado no teste

O ambiente que motivou esta versão do guia foi:

```text
Node.js: v24.14.0
PNPM: v12.3.4
tmi.js: 1.8.5
tiktok-live-connector: 2.4.4
```

O projeto continua compatível conceitualmente com **Node.js 18+**, mas, para um projeto de produção, prefira uma versão LTS suportada e valide especificamente as bibliotecas escolhidas.

---

## 2. Pré-requisitos

### Node.js

Verifique:

```bash
node --version
```

Recomendação mínima:

```text
Node.js 18+
```

### PNPM

Ative o PNPM via Corepack:

```bash
corepack enable pnpm
```

Verifique:

```bash
pnpm --version
```

Se necessário:

```bash
corepack prepare pnpm@latest --activate
```

---

## 3. Criar o projeto

No terminal:

```bash
mkdir live-chat-test
cd live-chat-test
pnpm init
```

Configure o projeto para usar ES Modules:

```bash
pnpm pkg set type=module
```

O `package.json` deve conter:

```json
{
  "type": "module"
}
```

---

## 4. Instalar as dependências

```bash
pnpm add tmi.js tiktok-live-connector
```

Confirme as versões instaladas:

```bash
pnpm list tmi.js tiktok-live-connector
```

Exemplo:

```text
tmi.js 1.8.5
tiktok-live-connector 2.4.4
```

---

# 5. Twitch — leitura anônima

Para este teste usamos `tmi.js`.

A conexão é somente para leitura e não precisa de token OAuth.

## Arquivo `twitch-test.js`

Crie:

```bash
notepad twitch-test.js
```

Ou crie manualmente o arquivo na pasta do projeto.

Conteúdo:

```javascript
import tmi from 'tmi.js';

const channel = process.argv[2]?.replace(/^#/, '');

if (!channel) {
  console.error('Uso: node twitch-test.js <canal>');
  process.exit(1);
}

const client = new tmi.Client({
  connection: {
    secure: true,
    reconnect: true,
  },

  // Sem identity:
  // o tmi.js cria automaticamente uma conexão anônima
  // usando um usuário do tipo "justinfan...".
  channels: [channel],
});

client.on('connected', (address, port) => {
  console.log(`[Twitch] Conectado a ${address}:${port}`);
  console.log(`[Twitch] Lendo #${channel}`);
});

client.on('message', (_channel, tags, message, self) => {
  if (self) return;

  const username =
    tags['display-name'] ??
    tags.username ??
    'desconhecido';

  console.log(`[Twitch] ${username}: ${message}`);
});

client.on('disconnected', (reason) => {
  console.log(`[Twitch] Desconectado: ${reason}`);
});

client.connect().catch((error) => {
  console.error('[Twitch] Erro ao conectar:', error);
  process.exit(1);
});
```

## Executar

```bash
node twitch-test.js ironmouse
```

Formato esperado:

```text
[Twitch] Conectado a irc-ws.chat.twitch.tv:443
[Twitch] Lendo #ironmouse
[Twitch] usuario1: hello
[Twitch] usuario2: gg
```

## Importante

O arquivo `twitch-test.js` deve conter **somente código da Twitch**.

Não deve existir nele algo como:

```javascript
new TikTokLiveConnection(...)
```

Se um erro da Twitch mencionar `TikTokLiveConnection`, os arquivos foram misturados.

---

# 6. TikTok LIVE — teste principal

A biblioteca usada é:

```text
tiktok-live-connector
```

Ela é uma biblioteca comunitária e não oficial.

Na versão `2.4.4`, use explicitamente um segundo argumento no construtor.

Isso também evita o erro observado:

```text
TypeError: Cannot read properties of undefined
(reading 'processInitialData')
```

## Arquivo `tiktok-test.js`

Crie:

```bash
notepad tiktok-test.js
```

Conteúdo:

```javascript
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
} from 'tiktok-live-connector';

const uniqueId = process.argv[2]?.replace(/^@/, '');

if (!uniqueId) {
  console.error('Uso: node tiktok-test.js <username>');
  process.exit(1);
}

const connection = new TikTokLiveConnection(uniqueId, {
  // Importante para a versão 2.4.4 no ambiente testado.
  processInitialData: false,

  // Mantém o teste mais simples e reduz consultas adicionais.
  fetchRoomInfoOnConnect: false,

  // Não precisamos de informações estendidas de presentes.
  enableExtendedGiftInfo: false,
});

connection.on(ControlEvent.CONNECTED, (state) => {
  console.log(`[TikTok] Conectado ao roomId ${state.roomId}`);
});

connection.on(ControlEvent.WEBSOCKET_CONNECTED, () => {
  console.log('[TikTok] WebSocket aberto.');
});

connection.on(ControlEvent.DISCONNECTED, ({ code, reason }) => {
  console.log(
    `[TikTok] Desconectado - code=${code}, reason=${reason ?? '-'}`
  );
});

connection.on(ControlEvent.ERROR, ({ info, exception }) => {
  console.error('[TikTok] Erro:', info);

  if (exception) {
    console.error(exception);
  }
});

connection.on(WebcastEvent.CHAT, (data) => {
  const username =
    data.user?.uniqueId ??
    data.user?.nickname ??
    'desconhecido';

  const message = data.comment;

  if (!message) return;

  console.log(`[TikTok] ${username}: ${message}`);
});

// Mantemos o teste leve.
//
// Não registre listeners desnecessários como:
//
// connection.on(WebcastEvent.LIKE, ...);
// connection.on(WebcastEvent.MEMBER, ...);
// connection.on(WebcastEvent.GIFT, ...);
//
// principalmente em lives grandes.

async function main() {
  try {
    console.log(`[TikTok] Conectando a @${uniqueId}...`);

    const state = await connection.connect();

    console.log(`[TikTok] Room ID: ${state.roomId}`);
    console.log(`[TikTok] Lendo chat de @${uniqueId}...`);
  } catch (error) {
    console.error('[TikTok] Falha ao conectar:');
    console.error(error);
    process.exit(1);
  }
}

main();
```

## Executar

Use uma conta que esteja realmente em LIVE:

```bash
node tiktok-test.js username
```

Também funciona:

```bash
node tiktok-test.js @username
```

Formato esperado:

```text
[TikTok] Conectando a @username...
[TikTok] WebSocket aberto.
[TikTok] Conectado ao roomId 7xxxxxxxxxxxxxxxxxx
[TikTok] usuario1: boa noite
[TikTok] usuario2: salve
```

---

# 7. TikTok — script de diagnóstico

Se `tiktok-test.js` não conectar, substitua temporariamente o conteúdo dele pelo script abaixo.

Ele testa separadamente:

```text
1. A biblioteca consegue detectar a LIVE?
2. A biblioteca consegue obter o roomId?
3. A biblioteca consegue abrir o WebSocket?
```

## `tiktok-test.js` em modo diagnóstico

```javascript
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
} from 'tiktok-live-connector';

const uniqueId = process.argv[2]?.replace(/^@/, '');

if (!uniqueId) {
  console.error('Uso: node tiktok-test.js <username>');
  process.exit(1);
}

function printError(label, error) {
  console.error(`\n========== ${label} ==========`);

  console.error('name:', error?.name);
  console.error('message:', error?.message);

  if (error?.statusCode) {
    console.error('statusCode:', error.statusCode);
  }

  if (error?.cause) {
    console.error('cause:', error.cause);
  }

  if (error?.response?.body) {
    console.error('response.body:', error.response.body);
  }

  console.error('\nStack:');
  console.error(error?.stack ?? error);

  console.error('==============================\n');
}

const connection = new TikTokLiveConnection(uniqueId, {
  processInitialData: false,
  fetchRoomInfoOnConnect: false,
  enableExtendedGiftInfo: false,
});

connection.on(ControlEvent.CONNECTED, (state) => {
  console.log(
    `[TikTok] CONNECTED - roomId: ${state.roomId}`
  );
});

connection.on(ControlEvent.WEBSOCKET_CONNECTED, () => {
  console.log('[TikTok] WebSocket aberto.');
});

connection.on(ControlEvent.DISCONNECTED, ({ code, reason }) => {
  console.log(
    `[TikTok] Desconectado - code=${code}, reason=${reason ?? '-'}`
  );
});

connection.on(ControlEvent.ERROR, ({ info, exception }) => {
  console.error('[TikTok] Evento ERROR:', info);

  if (exception) {
    printError('EXCEPTION', exception);
  }
});

connection.on(WebcastEvent.CHAT, (data) => {
  const username =
    data.user?.uniqueId ??
    data.user?.nickname ??
    'desconhecido';

  if (!data.comment) {
    return;
  }

  console.log(`[TikTok] ${username}: ${data.comment}`);
});

async function main() {
  console.log('========================================');
  console.log(` TikTok LIVE Diagnostic: @${uniqueId}`);
  console.log('========================================\n');

  // --------------------------------------------------
  // Etapa 1
  // --------------------------------------------------

  try {
    console.log('[1/3] Verificando se o usuário está ao vivo...');

    const isLive = await connection.fetchIsLive();

    console.log(`[1/3] isLive = ${isLive}`);
  } catch (error) {
    printError('fetchIsLive', error);

    console.log(
      '[1/3] A detecção da LIVE falhou. ' +
      'Ainda vamos tentar resolver o roomId.'
    );
  }

  // --------------------------------------------------
  // Etapa 2
  // --------------------------------------------------

  let roomId;

  try {
    console.log('\n[2/3] Obtendo roomId...');

    roomId = await connection.fetchRoomId();

    console.log(`[2/3] roomId = ${roomId}`);
  } catch (error) {
    printError('fetchRoomId', error);

    console.error(
      '[TikTok] Não foi possível descobrir o roomId.'
    );

    process.exit(1);
  }

  // --------------------------------------------------
  // Etapa 3
  // --------------------------------------------------

  try {
    console.log('\n[3/3] Abrindo WebSocket...');

    // Passamos o roomId explicitamente para evitar
    // repetir a etapa de resolução.
    const state = await connection.connect(roomId);

    console.log(
      `[3/3] Conectado com sucesso ao roomId ${state.roomId}`
    );

    console.log(`[TikTok] Lendo chat de @${uniqueId}...`);
  } catch (error) {
    printError('connect', error);
    process.exit(1);
  }
}

main();
```

Execute:

```bash
node tiktok-test.js username
```

---

# 8. Interpretando o diagnóstico do TikTok

## Caso A — tudo funciona

```text
[1/3] isLive = true
[2/3] roomId = 7xxxxxxxxxxxxxxxxxx
[3/3] Conectado com sucesso
```

A integração está funcionando.

---

## Caso B — `isLive = false`

```text
[1/3] isLive = false
```

Primeiro confirme manualmente no navegador que o usuário realmente está em LIVE.

Se estiver ao vivo e ainda assim retornar `false`, a resolução da live pode estar sendo bloqueada ou ter sido afetada por mudanças do TikTok.

Continue observando a etapa 2.

---

## Caso C — falha no `fetchRoomId`

Exemplo conceitual:

```text
[2/3] Obtendo roomId...

FetchRoomIdError
user_not_found
```

Nesse caso, a biblioteca não conseguiu resolver a conta/live para um `roomId`.

Possíveis motivos:

- username incorreto;
- streamer offline;
- mudança no HTML/API do TikTok;
- restrições regionais;
- rate limiting;
- bloqueio temporário;
- falha nos mecanismos de fallback;
- indisponibilidade ou limitação do serviço de resolução externo.

---

## Caso D — obtém `roomId`, mas não conecta

```text
[2/3] roomId = 7xxxxxxxxxxxxxxxxxx

[3/3] Abrindo WebSocket...

ERROR ...
```

Nesse cenário:

```text
Resolução do streamer: OK
Resolução do roomId: OK
WebSocket: FALHOU
```

A investigação passa a focar em:

- assinatura da URL WebSocket;
- serviço de signing;
- limitação/rate limit;
- bloqueio de IP;
- mudança do protocolo do TikTok;
- indisponibilidade externa.

---

# 9. Arquitetura real do TikTok

É importante corrigir uma premissa arquitetural.

Com a versão atual do `tiktok-live-connector`, a integração não deve ser considerada estritamente:

```text
Electron
   │
   ▼
TikTok
```

O conector possui integração com **Euler Stream** para funcionalidades como fallback de resolução e assinatura necessária para conexão WebSocket.

Conceitualmente:

```text
                    ┌──────────────────┐
                    │   Euler Stream   │
                    │ resolução/sign   │
                    └────────▲─────────┘
                             │
                             │
┌────────────────┐           │
│  Electron App  │───────────┘
│                │
│ Node.js/Main   │
└───────┬────────┘
        │
        │ WebSocket
        ▼
┌────────────────┐
│  TikTok LIVE   │
└────────────────┘
```

Isso significa que ainda é possível evitar um **backend próprio centralizado**, mas existe dependência de infraestrutura externa do ecossistema da biblioteca.

---

# 10. Arquitetura da Twitch

No teste atual:

```text
┌────────────────┐
│  Electron App  │
│                │
│ Node.js/Main   │
└───────┬────────┘
        │
        │ conexão anônima
        ▼
┌────────────────┐
│ Twitch Chat    │
└────────────────┘
```

Para somente consumir chat público, o protótipo com `tmi.js` funcionou sem OAuth.

Recursos autenticados continuam fora desse escopo.

---

# 11. Arquitetura sugerida para Electron

Mantenha as conexões no processo principal do Electron.

```text
                          ┌───────────────────────┐
                          │      Electron         │
                          │                       │
Twitch ──────────────────►│ Main Process          │
                          │                       │
TikTok / Euler ──────────►│ TwitchAdapter         │
                          │ TikTokAdapter         │
                          │         │             │
                          │         ▼             │
                          │ ChatNormalizer        │
                          │         │             │
                          │         ▼ IPC         │
                          │ Renderer / UI         │
                          └───────────────────────┘
```

Evite executar diretamente no Renderer:

```javascript
new TikTokLiveConnection(...)
```

ou:

```javascript
new tmi.Client(...)
```

Prefira módulos dedicados no processo principal.

---

# 12. Normalizar mensagens

Uma estrutura comum simplifica o restante do aplicativo.

```javascript
function createChatMessage({
  platform,
  username,
  displayName,
  message,
}) {
  return {
    platform,
    username,
    displayName: displayName ?? username,
    message,
    timestamp: Date.now(),
  };
}
```

Exemplo Twitch:

```javascript
const chatMessage = createChatMessage({
  platform: 'twitch',
  username: tags.username,
  displayName: tags['display-name'],
  message,
});
```

Exemplo TikTok:

```javascript
const chatMessage = createChatMessage({
  platform: 'tiktok',
  username: data.user?.uniqueId,
  displayName: data.user?.nickname,
  message: data.comment,
});
```

Resultado:

```javascript
{
  platform: 'tiktok',
  username: 'usuario123',
  displayName: 'Usuário',
  message: 'Olá!',
  timestamp: 1780000000000
}
```

---

# 13. Manter o TikTok leve

Para o primeiro protótipo, processe apenas:

```javascript
WebcastEvent.CHAT
```

Evite inicialmente:

```javascript
WebcastEvent.LIKE
WebcastEvent.MEMBER
WebcastEvent.GIFT
WebcastEvent.ROOM_USER
WebcastEvent.SOCIAL
```

O objetivo neste estágio é validar:

```text
LIVE
  ↓
WebSocket
  ↓
evento CHAT
  ↓
Node.js
  ↓
console.log()
```

Depois de estabilizar essa cadeia, adicione outros eventos.

---

# 14. Rate limiting e reconexão

Não implemente reconexão agressiva.

Evite:

```javascript
connection.on('disconnected', () => {
  connection.connect();
});
```

Isso pode criar um loop rápido de requisições.

Prefira futuramente algo como:

```javascript
const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function reconnect() {
  await delay(5000);

  try {
    await connection.connect();
  } catch (error) {
    console.error(error);
  }
}
```

Em produção, use **exponential backoff**.

Exemplo conceitual:

```text
5s
10s
20s
30s
60s
```

com um limite máximo.

---

# 15. Observações sobre IP e lives grandes

No TikTok, considere:

- rate limiting;
- limitação temporária por IP;
- respostas diferentes dependendo da região;
- volume muito grande de mensagens;
- alterações no protocolo;
- alterações nos endpoints web;
- dependência de serviços externos de signing/fallback.

Para um app desktop isso tem uma vantagem:

```text
cada usuário
    ↓
usa sua própria máquina
    ↓
usa sua própria conexão/IP
```

Você evita concentrar milhares de conexões em um único backend central.

Por outro lado, cada instalação passa a depender diretamente das condições da rede e do IP daquele usuário.

---

# 16. Scripts no `package.json`

Opcionalmente:

```json
{
  "scripts": {
    "twitch": "node twitch-test.js",
    "tiktok": "node tiktok-test.js"
  }
}
```

Então:

```bash
pnpm twitch ironmouse
```

e:

```bash
pnpm tiktok username
```

---

# 17. Checklist

## Twitch

- [x] Dependência instalada.
- [x] Conexão anônima.
- [x] Sem OAuth.
- [x] Chat recebido no terminal.
- [x] Formato `[Twitch] Usuário: Mensagem`.

## TikTok

- [x] `tiktok-live-connector` instalado.
- [ ] `fetchIsLive()` funcionando.
- [ ] `fetchRoomId()` funcionando.
- [ ] WebSocket conectando.
- [ ] Evento `CHAT` sendo recebido.
- [ ] Formato `[TikTok] Usuário: Mensagem`.

---

# 18. Comandos rápidos

Instalar:

```bash
pnpm add tmi.js tiktok-live-connector
```

Twitch:

```bash
node twitch-test.js ironmouse
```

TikTok:

```bash
node tiktok-test.js username
```

Ver versões:

```bash
node --version
pnpm --version
pnpm list tmi.js tiktok-live-connector
```

---

# 19. Próximo passo recomendado

Antes de iniciar a integração com Electron, valide o TikTok até obter:

```text
[1/3] isLive = true
[2/3] roomId = ...
[3/3] Conectado com sucesso
[TikTok] usuario: mensagem
```

Quando isso estiver funcionando de forma consistente, a próxima estrutura recomendada é:

```text
src/
├── main/
│   ├── twitch/
│   │   └── TwitchChatClient.js
│   ├── tiktok/
│   │   └── TikTokChatClient.js
│   ├── chat/
│   │   └── ChatNormalizer.js
│   └── ipc/
│       └── chatIpc.js
└── renderer/
```

Assim o experimento de terminal evolui diretamente para uma arquitetura adequada ao Electron.

---

# 20. Referências

Projeto `tiktok-live-connector`:

```text
https://github.com/zerodytrash/TikTok-Live-Connector
```

Projeto `tmi.js`:

```text
https://github.com/tmijs/tmi.js
```

Documentação oficial de chat da Twitch:

```text
https://dev.twitch.tv/docs/chat/
```

> Observação: `tiktok-live-connector` é uma biblioteca comunitária e depende de interfaces/protocolos que podem mudar sem aviso. Sempre valide a versão instalada antes de distribuir uma atualização do aplicativo.
