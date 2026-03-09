import electron from "electron";
import { Settings } from "./settings.js";
const { Notification } = electron;
export class NotificationService {
    static send(title, body) {
        const windows = Settings.get("windows");
        if (!windows?.enableNotifications)
            return false;
        if (!Notification.isSupported())
            return false;
        try {
            const notification = new Notification({
                title: String(title || "").trim(),
                body: String(body || "").trim(),
                silent: false,
            });
            notification.show();
            return true;
        }
        catch {
            return false;
        }
    }
}
