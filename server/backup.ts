import { spawn } from "node:child_process";
import { today } from "./engine";
// Single-store process scheduler. For multiple replicas use one external scheduler.
export function scheduleBackups() {
  if (process.env.ENABLE_BACKUPS !== "true") return;
  let lastSuccess = "",
    running = false;
  const check = () => {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
      hour: "2-digit",
      hour12: false,
    }).format(new Date());
    if (hour !== "02" || running || lastSuccess === today()) return;
    running = true;
    const child = spawn("bash", ["scripts/backup.sh"], { stdio: "inherit" });
    child.on("error", () => {
      running = false;
      console.error("Scheduled backup could not start");
    });
    child.on("exit", (code) => {
      running = false;
      if (code === 0) lastSuccess = today();
      else
        console.error(
          "Scheduled backup failed; retrying within the scheduled hour",
        );
    });
  };
  check();
  setInterval(check, 60000).unref();
}
