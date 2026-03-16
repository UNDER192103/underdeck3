const { app, BrowserWindow, session, ipcMain } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch').default;
const fs = require('fs');
const path = require('path');

app.setName("App Easy");

const iconPath = path.join(__dirname, "icon.ico");

let mainWindow;
let persistSession;
let blocker;

// lista de janelas abertas
const playerWindows = new Set();

function updateWindowCounter() {
    process.stdout.write(`\rJanelas abertas: ${playerWindows.size}   `);
}

function readSites() {

    const sitesPath = path.join(__dirname, "sites.json");

    try {
        return JSON.parse(fs.readFileSync(sitesPath, "utf8"));
    } catch (err) {
        console.error("Erro ao ler sites.json:", err);
        return [];
    }

}

function createMenuWindow() {

    const sites = readSites();

    mainWindow = new BrowserWindow({
        width: 500,
        height: 400,
        resizable: false,
        autoHideMenuBar: true,
        icon: iconPath,
        title: "App Easy",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            session: persistSession
        }
    });

    const html = `
<html>
<head>
<meta charset="UTF-8">

<style>

body{
font-family:Arial;
background:#0f0f0f;
color:white;
margin:0;
padding:20px;
}

h2{
text-align:center;
margin-bottom:20px;
}

.grid{
display:grid;
grid-template-columns:1fr 1fr;
gap:10px;
}

.card{
background:#1f1f1f;
padding:15px;
border-radius:10px;
cursor:pointer;
transition:0.2s;
text-align:center;
}

.card:hover{
background:#2f2f2f;
transform:scale(1.05);
}

</style>

</head>

<body>

<h2>Escolha um site</h2>

<div class="grid">

${sites.map((s,i)=>`
<div class="card" onclick="openSite(${i})">
${s.name}
</div>
`).join("")}

</div>

<script>

function openSite(index){
window.api.openSite(index);
}

</script>

</body>
</html>
`;

    mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
}

function createPlayerWindow(url){

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        title: "App Easy",
        autoHideMenuBar: true,
        webPreferences:{
            contextIsolation:true,
            nodeIntegration:false,
            session: persistSession
        }
    });

    // adiciona na lista
    playerWindows.add(win);
    updateWindowCounter();

    // remove da lista quando fechar
    win.on("closed", () => {
        playerWindows.delete(win);
        updateWindowCounter();
    });

    // bloqueia navegação externa
    win.webContents.on("will-navigate",(event,newUrl)=>{
        if(!newUrl.startsWith(url)){
            console.log(`\n[BLOQUEADO] ${newUrl}`);
            event.preventDefault();
        }
    });

    // bloqueia popups
    win.webContents.setWindowOpenHandler(()=>({
        action:"deny"
    }));

    win.loadURL(url).catch(err=>{
        console.error("Erro ao carregar:", err);
    });

}

ipcMain.on("open-site",(event,index)=>{

    const sites = readSites();

    if(!sites[index]) return;

    createPlayerWindow(sites[index].url);

});

app.whenReady().then(async () => {

    persistSession = session.fromPartition("persist:appEasy");

    // cria o adblock apenas uma vez
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    blocker.enableBlockingInSession(persistSession);

    console.log("✅ AdBlock ativo");

    createMenuWindow();

});

app.on("window-all-closed",()=>{
    if(process.platform!=="darwin") app.quit();
});