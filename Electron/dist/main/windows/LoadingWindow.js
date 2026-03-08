import electron from "electron";
const { BrowserWindow, app } = electron;
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export function createLoadingWindow() {
    const isDev = !app.isPackaged;
    const preloadPath = isDev
        ? path.join(process.cwd(), "src", "preload", "index.js")
        : path.join(__dirname, "..", "preload", "index.js");
    const win = new BrowserWindow({
        width: 400,
        height: 450,
        minWidth: 400,
        maxWidth: 400,
        minHeight: 450,
        maxHeight: 450,
        show: true,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        movable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        autoHideMenuBar: true,
        backgroundColor: "#111827",
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: !app.isPackaged,
        },
    });
    const html = `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Loading</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #f8fafc;
      user-select: none;
      -webkit-user-select: none;
      -webkit-app-region: drag;
      background: #050816;
    }
    #bg {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: radial-gradient(circle at center, rgba(10, 15, 35, 0.15), rgba(2, 6, 23, 0.55));
      z-index: 1;
    }
    .root {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20px;
    }
    .stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      width: min(280px, 100%);
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(148, 163, 184, 0.35);
      border-top-color: #22d3ee;
      border-radius: 50%;
      animation: spin 0.95s linear infinite;
    }
    .message {
      font-size: 14px;
      line-height: 1.4;
      letter-spacing: 0.2px;
      color: #e2e8f0;
      min-height: 20px;
    }
    .progress-wrap {
      width: 100%;
      display: none;
      flex-direction: column;
      gap: 6px;
      align-items: center;
    }
    .progress-track {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(71, 85, 105, 0.5);
    }
    .progress-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #06b6d4, #22d3ee);
      transition: width 220ms ease;
    }
    .percent {
      font-size: 12px;
      color: #cbd5e1;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <canvas id="bg"></canvas>
  <div class="overlay"></div>
  <div class="root">
    <div class="stack">
      <div class="spinner"></div>
      <div id="message" class="message">Procurando Atualizacao</div>
      <div id="progressWrap" class="progress-wrap">
        <div class="progress-track">
          <div id="progressFill" class="progress-fill"></div>
        </div>
        <div id="percent" class="percent">0%</div>
      </div>
    </div>
  </div>
  <script>
    (function () {
      const canvas = document.getElementById("bg");
      const ctx = canvas.getContext("2d");
      const messageEl = document.getElementById("message");
      const progressWrap = document.getElementById("progressWrap");
      const progressFill = document.getElementById("progressFill");
      const percentEl = document.getElementById("percent");

      const points = [];
      const pointCount = 48;
      const linkDistance = 220;
      let raf = 0;
      let pulse = 0;

      const resize = () => {
        const ratio = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = Math.floor(w * ratio);
        canvas.height = Math.floor(h * ratio);
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(ratio, ratio);
        points.length = 0;
        for (let i = 0; i < pointCount; i += 1) {
          points.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.2,
            vy: (Math.random() - 0.5) * 0.2,
            r: Math.random() * 1.4 + 1,
          });
        }
      };

      const draw = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const g = ctx.createRadialGradient(w * 0.5, h * 0.45, w * 0.12, w * 0.5, h * 0.5, w * 0.9);
        g.addColorStop(0, "rgba(22, 32, 94, " + (0.42 + (Math.sin(pulse) + 1) * 0.06) + ")");
        g.addColorStop(0.5, "rgb(10, 18, 52)");
        g.addColorStop(1, "rgb(2, 6, 23)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        for (let i = 0; i < points.length; i += 1) {
          const p = points[i];
          p.x += p.vx;
          p.y += p.vy;
          if (p.x <= 0 || p.x >= w) p.vx *= -1;
          if (p.y <= 0 || p.y >= h) p.vy *= -1;

          for (let j = i + 1; j < points.length; j += 1) {
            const q = points[j];
            const dx = p.x - q.x;
            const dy = p.y - q.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d <= linkDistance) {
              const a = (1 - d / linkDistance) * 0.28;
              ctx.strokeStyle = "rgba(125, 211, 252, " + a + ")";
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.stroke();
            }
          }

          ctx.fillStyle = "rgba(147, 197, 253, 0.9)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }

        pulse += 0.012;
        raf = window.requestAnimationFrame(draw);
      };

      const updateState = (payload) => {
        if (!payload || typeof payload !== "object") return;
        const phase = String(payload.phase || "");
        const message = String(payload.message || "");
        const percent = Math.max(0, Math.min(100, Math.round(Number(payload.progressPercent || 0))));
        if (message) messageEl.textContent = message;

        const isDownloading = phase === "downloading";
        progressWrap.style.display = isDownloading ? "flex" : "none";
        if (isDownloading) {
          progressFill.style.width = percent + "%";
          percentEl.textContent = percent + "%";
        }
      };

      resize();
      draw();
      window.addEventListener("resize", resize);

      if (window.underdeck && window.underdeck.updates && typeof window.underdeck.updates.onLoadingStateChanged === "function") {
        window.underdeck.updates.onLoadingStateChanged(updateState);
      }
    })();
  </script>
</body>
</html>
`;
    win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    return win;
}
