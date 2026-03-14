import electron from "electron";
import type { SaveFileOptions, SelectFileOptions } from "../../types/file-dialog.js";
import fs from "node:fs";
import path from "node:path";

const { BrowserWindow, dialog } = electron;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".m4v": "video/x-m4v",
};

export class FileDialogService {
  private getDialogWindow() {
    return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  }

  async selectFile(options: SelectFileOptions = {}) {
    const properties: Array<"openFile" | "openDirectory" | "multiSelections" | "showHiddenFiles"> = [];

    if (options.includeDirectories) {
      properties.push("openDirectory");
    } else {
      properties.push("openFile");
    }
    if (options.allowMultiple) properties.push("multiSelections");
    if (options.showHiddenFiles) properties.push("showHiddenFiles");

    const result = await dialog.showOpenDialog(this.getDialogWindow(), {
      title: options.title,
      buttonLabel: options.buttonLabel,
      defaultPath: options.defaultPath,
      filters: options.filters,
      properties,
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    if (options.allowMultiple) {
      return result.filePaths;
    }

    return result.filePaths[0];
  }

  async selectSavePath(options: SaveFileOptions = {}) {
    const result = await dialog.showSaveDialog(this.getDialogWindow(), {
      title: options.title,
      buttonLabel: options.buttonLabel,
      defaultPath: options.defaultPath,
      filters: options.filters,
      nameFieldLabel: options.nameFieldLabel,
      message: options.message,
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  }

  async readFileAsDataUrl(filePath: string) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
    const buffer = fs.readFileSync(filePath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }
}

export const fileDialogService = new FileDialogService();
