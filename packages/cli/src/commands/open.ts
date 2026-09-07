import { spawn } from "node:child_process";

/** Open a URL or file in the OS default handler. */
export function openExternal(target: string): void {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [target]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", target]]
    : ["xdg-open", [target]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}
