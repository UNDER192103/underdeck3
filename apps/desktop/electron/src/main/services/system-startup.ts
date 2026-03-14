import electron from "electron";
import AutoLaunch from "auto-launch";

const { app } = electron;

export class SystemStartupService {
  private launcher: AutoLaunch | null = null;

  private getLauncher() {
    if (this.launcher) return this.launcher;
    this.launcher = new AutoLaunch({ name: app.getName(), path: process.execPath, isHidden: true });
    return this.launcher;
  }

  private isSupportedRuntime() {
    return app.isPackaged;
  }

  async isEnabled() {
    if (!this.isSupportedRuntime()) return false;
    try {
      return await this.getLauncher().isEnabled();
    } catch {
      return false;
    }
  }

  async setEnabled(enabled: boolean) {
    if (!this.isSupportedRuntime()) return false;
    const active = await this.isEnabled();
    const launcher = this.getLauncher();
    if (enabled && !active) {
      await launcher.enable();
      return true;
    }
    if (!enabled && active) {
      await launcher.disable();
      return false;
    }
    return active;
  }

  async syncWithSettings(enabled: boolean) {
    return this.setEnabled(Boolean(enabled));
  }
}
