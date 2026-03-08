import electron from "electron";
import AutoLaunch from "auto-launch";

const { app } = electron;

export class SystemStartupService {
  private launcher = new AutoLaunch({
    name: app.getName(),
    path: process.execPath,
    isHidden: true,
  });

  private isSupportedRuntime() {
    return app.isPackaged;
  }

  async isEnabled() {
    if (!this.isSupportedRuntime()) return false;
    try {
      return await this.launcher.isEnabled();
    } catch {
      return false;
    }
  }

  async setEnabled(enabled: boolean) {
    if (!this.isSupportedRuntime()) return false;
    const active = await this.isEnabled();
    if (enabled && !active) {
      await this.launcher.enable();
      return true;
    }
    if (!enabled && active) {
      await this.launcher.disable();
      return false;
    }
    return active;
  }

  async syncWithSettings(enabled: boolean) {
    return this.setEnabled(Boolean(enabled));
  }
}
