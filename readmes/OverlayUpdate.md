# Quickstart Guide — Chat da Twitch e TikTok em Tempo Real com Node.js + PNPM

Este guia mostra como validar, diretamente pelo terminal, a leitura de mensagens de chat em tempo real da **Twitch** e do **TikTok LIVE** usando **Node.js**.

O objetivo é testar uma arquitetura adequada para um futuro aplicativo desktop com **Electron**, executado diretamente na máquina do usuário, sem depender de um servidor centralizado.

Neste protótipo:

- **Twitch:** conexão somente para leitura, de forma anônima, sem OAuth.
- **TikTok:** conexão direta ao TikTok LIVE usando `tiktok-live-connector`.
- **Runtime:** Node.js.
- **Gerenciador de pacotes:** PNPM.
- **Servidor backend:** não necessário para estes testes.

---

## 1. Pré-requisitos

### Node.js

Tenha o **Node.js 18 ou superior** instalado.

Verifique:

```bash
node --version
```

Exemplo:

```text
v20.19.0
```

> Para um projeto novo, prefira uma versão LTS recente do Node.js.

### PNPM

O Node.js moderno inclui o **Corepack**, que pode gerenciar o PNPM.

Ative-o:

```bash
corepack enable pnpm
```

Verifique:

```bash
pnpm --version
```

Caso sua instalação do Node não disponibilize o PNPM imediatamente, também é possível preparar uma versão recente com:

```bash
corepack prepare pnpm@latest --activate
```

---

## 2. Inicialização do projeto

Crie uma pasta para o teste:

```bash
mkdir live-chat-test
cd live-chat-test
```

Inicialize o projeto:

```bash
pnpm init
```

Como os exemplos deste guia usam ES Modules (`import`), configure o projeto:

```bash
pnpm pkg set type=module
```

O `package.json` ficará conceitualmente parecido com:

```json
{
  "name": "live-chat-test",
  "version": "1.0.0",
  "type": "module"
}
```

---

## 3. Instalação das dependências

Instale as bibliotecas:

```bash
pnpm add tmi.js tiktok-live-connector
```

### Twitch — `tmi.js`

Para este protótipo, `tmi.js` é uma escolha simples porque:

- roda diretamente em Node.js;
- utiliza a interface de chat da Twitch;
- permite conexão anônima para leitura;
- não exige OAuth quando o objetivo é apenas acompanhar mensagens públicas;
- possui uma API baseada em eventos simples para um teste rápido.

### TikTok — `tiktok-live-connector`

`tiktok-live-connector` é uma biblioteca comunitária e não oficial para consumir eventos de uma transmissão do TikTok LIVE.

Ela permite receber eventos como:

- chat;
- gifts;
- likes;
- entrada de usuários;
- follows;
- shares;
- informações da live.

Neste teste, vamos assinar **somente o evento de chat**, reduzindo processamento desnecessário.

---

## 4. Estrutura do projeto

Ao final, teremos:

```text
live-chat-test/
├── package.json
├── pnpm-lock.yaml
├── twitch-test.js
└── tiktok-test.js
```

---

# 5. Teste da Twitch

## Criar `twitch-test.js`

Crie o arquivo:

```bash
touch twitch-test.js
```

No Windows PowerShell, se necessário:

```powershell
New-Item twitch-test.js
```

Adicione:

```javascript
import tmi from 'tmi.js';

const channel = process.argv[2];

if (!channel) {
  console.error('Uso: node twitch-test.js <canal>');
  process.exit(1);
}

const client = new tmi.Client({
  connection: {
    secure: true,
    reconnect: true,
  },

  // Usuário "justinfan" representa uma conexão anônima.
  // Nenhum token OAuth é necessário para apenas ler o chat.
  identity: {
    username: 'justinfan12345',
    password: '',
  },

  channels: [channel],
});

client.on('message', (_channel, tags, message, self) => {
  if (self) return;

  const username =
    tags['display-name'] ||
    tags.username ||
    'desconhecido';

  console.log(`[Twitch] ${username}: ${message}`);
});

client.on('connected', (address, port) => {
  console.log(`[Twitch] Conectado a ${address}:${port}`);
  console.log(`[Twitch] Lendo chat de #${channel}...`);
});

client.on('disconnected', (reason) => {
  console.log(`[Twitch] Desconectado: ${reason}`);
});

client.connect().catch((error) => {
  console.error('[Twitch] Erro ao conectar:', error);
  process.exit(1);
});
```

## Como funciona

O canal é recebido pela linha de comando:

```javascript
const channel = process.argv[2];
```

Por exemplo:

```bash
node twitch-test.js nome_do_streamer
```

A conexão é anônima:

```javascript
identity: {
  username: 'justinfan12345',
  password: '',
}
```

Isso é suficiente para o cenário deste protótipo porque estamos **somente lendo mensagens públicas**.

Não será possível utilizar funcionalidades autenticadas como:

- enviar mensagens;
- executar comandos de moderação;
- acessar informações privadas;
- agir em nome de um usuário.

### Saída esperada

```text
[Twitch] Conectado a irc-ws.chat.twitch.tv:443
[Twitch] Lendo chat de #nome_do_streamer...
[Twitch] Alice: boa noite!
[Twitch] Bob: começou agora?
[Twitch] Carol: gg
```

---

# 6. Teste do TikTok LIVE

## Criar `tiktok-test.js`

Crie o arquivo:

```bash
touch tiktok-test.js
```

No Windows PowerShell:

```powershell
New-Item tiktok-test.js
```

Adicione:

```javascript
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
} from 'tiktok-live-connector';

const uniqueId = process.argv[2]?.replace(/^@/, '');

if (!uniqueId) {
  console.error('Uso: node tiktok-test.js <uniqueId>');
  process.exit(1);
}

const connection = new TikTokLiveConnection(uniqueId);

// Escutamos apenas CHAT.
//
// Não registre listeners para eventos muito frequentes, como LIKE,
// MEMBER ou outros eventos que não sejam necessários neste teste.
// Em lives grandes, esses eventos podem gerar um volume muito alto
// de processamento.
connection.on(WebcastEvent.CHAT, (data) => {
  const username =
    data.user?.uniqueId ||
    data.user?.nickname ||
    'desconhecido';

  const message = data.comment;

  if (!message) return;

  console.log(`[TikTok] ${username}: ${message}`);
});

connection.on(ControlEvent.ERROR, (error) => {
  console.error('[TikTok] Erro:', error);
});

async function main() {
  try {
    const state = await connection.connect();

    console.log(
      `[TikTok] Conectado à live de @${uniqueId} (roomId: ${state.roomId})`
    );

    console.log(`[TikTok] Lendo chat de @${uniqueId}...`);
  } catch (error) {
    console.error(
      `[TikTok] Não foi possível conectar à live de @${uniqueId}:`,
      error
    );

    process.exit(1);
  }
}

main();
```

---

## Identificando o `uniqueId`

Considere uma URL como:

```text
https://www.tiktok.com/@exemplo/live
```

O `uniqueId` é:

```text
exemplo
```

Portanto:

```bash
node tiktok-test.js exemplo
```

Também aceitamos o `@` no script:

```bash
node tiktok-test.js @exemplo
```

porque ele é removido aqui:

```javascript
const uniqueId = process.argv[2]?.replace(/^@/, '');
```

### Saída esperada

```text
[TikTok] Conectado à live de @exemplo (roomId: 1234567890123456789)
[TikTok] Lendo chat de @exemplo...
[TikTok] alice123: oi pessoal
[TikTok] bob456: salve!
[TikTok] carol789: começou agora?
```

---

# 7. Executando os testes

## Twitch

Use o nome do canal, sem precisar incluir `#`:

```bash
node twitch-test.js nome_do_streamer
```

Exemplo:

```bash
node twitch-test.js shroud
```

Interrompa com:

```text
Ctrl + C
```

---

## TikTok

O streamer precisa estar **ao vivo** para que a conexão seja estabelecida.

Execute:

```bash
node tiktok-test.js nome_do_streamer
```

ou:

```bash
node tiktok-test.js @nome_do_streamer
```

Exemplo:

```bash
node tiktok-test.js @usuario
```

Interrompa com:

```text
Ctrl + C
```

---

# 8. Scripts opcionais no `package.json`

Para facilitar os testes, é possível adicionar scripts:

```json
{
  "scripts": {
    "twitch": "node twitch-test.js",
    "tiktok": "node tiktok-test.js"
  }
}
```

Depois:

```bash
pnpm twitch nome_do_streamer
```

e:

```bash
pnpm tiktok nome_do_streamer
```

---

# 9. Observações técnicas

## Twitch sem OAuth

Para o objetivo de **somente consumir mensagens públicas do chat**, uma conexão anônima é suficiente.

Isso combina bem com a arquitetura pretendida:

```text
Twitch
   │
   │ WebSocket / Chat
   ▼
Aplicação Electron
   │
   ▼
Processamento local
```

Não existe necessidade de:

```text
Twitch
   │
   ▼
Seu servidor
   │
   ▼
Electron
```

para esse caso específico.

O OAuth passa a ser necessário quando o produto precisar realizar ações autenticadas ou utilizar APIs da Twitch que exijam autorização.

---

## TikTok é uma integração não oficial

Diferentemente de uma API pública oficialmente destinada a esse caso de uso, `tiktok-live-connector` depende do protocolo utilizado pelo TikTok LIVE.

Isso significa que:

- mudanças internas do TikTok podem quebrar versões da biblioteca;
- atualizações da dependência podem ser necessárias;
- o comportamento deve ser monitorado entre releases;
- erros de conexão devem ser tratados pelo aplicativo;
- uma estratégia de reconexão é recomendável em produção.

Antes de atualizar a versão da biblioteca em um app distribuído, valide a nova versão em ambiente de teste.

---

## Lives grandes e volume de eventos

Uma live muito movimentada pode produzir uma quantidade significativa de eventos.

Eventos como:

```text
CHAT
LIKE
MEMBER
GIFT
SOCIAL
ROOM_USER
```

podem ter frequências muito diferentes.

Para uma aplicação que precisa somente do chat, a abordagem recomendada é **não registrar listeners para eventos desnecessários**.

Neste Quickstart fazemos apenas:

```javascript
connection.on(WebcastEvent.CHAT, (data) => {
  // ...
});
```

e deliberadamente não fazemos:

```javascript
connection.on(WebcastEvent.LIKE, () => {});
```

Em especial, likes e eventos de entrada de usuários podem produzir muito ruído em transmissões grandes.

---

## Rate limiting e bloqueios por IP no TikTok

Como a conexão ocorre diretamente da máquina do usuário para a infraestrutura do TikTok, é importante considerar mecanismos de proteção da plataforma.

Dependendo do volume, comportamento das conexões e mudanças internas do TikTok, podem ocorrer situações como:

- rate limiting;
- falhas temporárias de conexão;
- limitação ou bloqueio temporário associado ao IP;
- necessidade de reconectar;
- diferenças de comportamento em lives extremamente grandes.

Portanto, em produção:

1. evite abrir várias conexões para a mesma live sem necessidade;
2. reutilize uma única conexão por transmissão sempre que possível;
3. implemente reconexão com atraso progressivo;
4. evite loops agressivos de reconexão;
5. filtre eventos que o produto não utiliza;
6. monitore mudanças nas versões do `tiktok-live-connector`.

---

# 10. Considerações para Electron

A abordagem é especialmente interessante para um aplicativo desktop porque a comunicação pode acontecer diretamente na máquina do usuário:

```text
┌─────────────────────────────┐
│         Electron App        │
│                             │
│  ┌───────────────────────┐  │
│  │ Node / Main Process   │  │
│  │                       │  │
│  │ Twitch Connection     │◄──────── Twitch
│  │ TikTok Connection     │◄──────── TikTok
│  └───────────┬───────────┘  │
│              │ IPC          │
│              ▼              │
│  ┌───────────────────────┐  │
│  │ Renderer / UI         │  │
│  │                       │  │
│  │ Chat unificado        │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

Uma arquitetura inicial recomendada é manter as conexões da Twitch e TikTok no **processo principal do Electron** ou em um módulo Node dedicado.

O Renderer deve receber somente os eventos necessários via IPC:

```text
Twitch ───┐
          ├──► Node/Main ──► normalização ──► IPC ──► Renderer
TikTok ───┘
```

Isso evita expor detalhes de conexão diretamente à camada da interface.

---

# 11. Normalização dos eventos

Ao avançar do protótipo, é útil transformar mensagens das duas plataformas em um formato interno comum.

Exemplo:

```javascript
{
  platform: 'twitch',
  username: 'alice',
  message: 'Olá!',
  timestamp: Date.now()
}
```

ou:

```javascript
{
  platform: 'tiktok',
  username: 'bob',
  message: 'Salve!',
  timestamp: Date.now()
}
```

Uma função simples poderia ser:

```javascript
function createChatMessage(platform, username, message) {
  return {
    platform,
    username,
    message,
    timestamp: Date.now(),
  };
}
```

Isso permite que o restante do aplicativo ignore detalhes específicos de Twitch ou TikTok:

```text
Twitch event ──┐
               ├──► NormalizedChatMessage ──► UI
TikTok event ──┘
```

---

# 12. Checklist de validação

Após instalar e executar os testes, valide:

- [ ] Node.js 18+ funcionando.
- [ ] PNPM funcionando.
- [ ] `tmi.js` instalado.
- [ ] `tiktok-live-connector` instalado.
- [ ] Twitch conecta sem token OAuth.
- [ ] Mensagens da Twitch aparecem no terminal.
- [ ] TikTok conecta usando somente o `uniqueId`.
- [ ] Mensagens do TikTok aparecem no terminal.
- [ ] Eventos desnecessários do TikTok não estão sendo processados.
- [ ] Encerrar o processo com `Ctrl + C` fecha o teste.
- [ ] A arquitetura funciona sem backend central.

---

# 13. Resumo

Instalação:

```bash
mkdir live-chat-test
cd live-chat-test

pnpm init
pnpm pkg set type=module

pnpm add tmi.js tiktok-live-connector
```

Teste Twitch:

```bash
node twitch-test.js nome_do_streamer
```

Teste TikTok:

```bash
node tiktok-test.js nome_do_streamer
```

Arquitetura validada pelo protótipo:

```text
                    ┌──────────────┐
Twitch ────────────►│              │
                    │ Electron App │──► UI / Chat unificado
TikTok ────────────►│              │
                    └──────────────┘
```

Para o cenário de leitura de chats públicos, essa abordagem permite validar um aplicativo **local-first**, no qual cada instalação do Electron mantém suas próprias conexões com as plataformas, eliminando a necessidade de um servidor central dedicado exclusivamente ao encaminhamento das mensagens.