import { app } from 'electron';
import path from 'path';
/**
 * Retorna o caminho correto para arquivos na pasta /assets/
 * Funciona tanto em Desenvolvimento (tsx) quanto em Produção (app.asar.unpacked)
 */
export const getAssetPath = (...paths) => {
    const isDev = !app.isPackaged;
    if (isDev) {
        // Em desenvolvimento: Raiz do projeto/assets/...
        return path.join(process.cwd(), 'assets', ...paths);
    }
    // Em produção: O Electron Builder coloca os arquivos descompactados em:
    // resources/app.asar.unpacked/assets/...
    return path.join(process.resourcesPath, 'assets', ...paths);
};
// Exemplo de uso para o ícone no seu MainWindow.ts:
// const icon = getAssetPath('img', 'UDIx256.ico');
