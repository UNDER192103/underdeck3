# UnderDeck 3.0 - Build e Execucao

Este arquivo descreve o fluxo oficial para buildar e rodar o projeto com Electron + React + Express (WebDeck).

## Estrutura importante

- `React/client`:
  - Codigo fonte do frontend principal e do WebDeck.
- `React/client/webdeck/index.html`:
  - Entry HTML da tela WebDeck.
- `Electron/src/renderer`:
  - Saida compilada do frontend (arquivos estaticos servidos pelo Express).
- `Electron/src/main/services/express.ts`:
  - API + servidor estatico do WebDeck.

## Regra principal

- Voce desenvolve sempre em `React/client`.
- Voce nao edita `Electron/src/renderer` manualmente.
- `Electron/src/renderer` e somente output de build.

## Pre-requisitos

- Node.js instalado.
- Dependencias instaladas em `React` e `Electron`.

Comandos:

```powershell
cd e:\Apps\UnderDeck3.0\React
npm install
cd ..\Electron
npm install
```

## Build do frontend (React -> Electron/src/renderer)

No projeto atual, o Vite esta configurado para gerar frontend em:

- `Electron/src/renderer`

Comando:

```powershell
cd e:\Apps\UnderDeck3.0\React
npm run build
```

Resultado esperado em `Electron/src/renderer`:

- `index.html`
- `webdeck/index.html`
- `assets/...`

## Build/compile do Electron

```powershell
cd e:\Apps\UnderDeck3.0\Electron
npm run compile
```

## Execucao em desenvolvimento

Terminal 1 (frontend dev):

```powershell
cd e:\Apps\UnderDeck3.0\React
npm run dev
```

Terminal 2 (Electron):

```powershell
cd e:\Apps\UnderDeck3.0\Electron
npm start
```

## Rotas esperadas do Express (WebDeck)

- `GET /`:
  - Redireciona para `/webdeck`.
- `GET /webdeck`:
  - Serve `webdeck/index.html` do build.
- `GET /api/...`:
  - Endpoints de API.

## Como validar rapidamente

1. Buildar React.
2. Confirmar se existem:
   - `Electron/src/renderer/index.html`
   - `Electron/src/renderer/webdeck/index.html`
3. Rodar Electron.
4. Abrir no navegador:
   - `http://localhost:3484/`
   - `http://localhost:3484/webdeck`
5. Verificar se `/webdeck` abre a tela de WebDeck, nao a Home do app.

## Troubleshooting

Se `/webdeck` abrir a tela errada:

1. Verifique se `Electron/src/renderer/webdeck/index.html` existe.
2. Verifique se o build foi feito apos alteracoes em `React/client/webdeck`.
3. Limpe output e rebuilde:

```powershell
Remove-Item -Recurse -Force e:\Apps\UnderDeck3.0\Electron\src\renderer\*
cd e:\Apps\UnderDeck3.0\React
npm run build
```

4. Reinicie o Electron apos novo build.

Se o build do React falhar com `spawn EPERM`:

1. Feche processos que possam travar `node`/`esbuild`.
2. Execute terminal como administrador.
3. Rode novamente `npm run build`.

## Sobre dist/public e dist/index.js

- `React/dist/public`:
  - Era o output antigo do frontend.
- `React/dist/index.js`:
  - Bundle de server do projeto React (nao e o frontend do Electron).
- Agora o frontend usado pelo Electron/Express deve estar em:
  - `Electron/src/renderer`

## Fluxo recomendado de release

1. Atualizar codigo em `React/client` e `Electron/src/main`.
2. `cd React && npm run build`
3. `cd Electron && npm run compile`
4. Testar rotas:
   - `/`
   - `/webdeck`
   - `/api/health`
5. Gerar pacote Electron (`npm run dist`) quando necessario.
