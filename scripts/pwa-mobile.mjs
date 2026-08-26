import { spawn } from "node:child_process";
import os from "node:os";
import localtunnel from "localtunnel";

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

const PORT = 3000;
const localIp = getLocalIp();

console.log("\nStock & Money — mobile PWA test\n");
console.log("PWA install requires HTTPS. Plain http://192.168.x.x will NOT work.\n");

if (localIp) {
  console.log(`LAN (app only, no PWA install): http://${localIp}:${PORT}`);
}

console.log(`Local (app only, no PWA install): http://localhost:${PORT}\n`);
console.log("Starting production server...\n");

const server = spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", String(PORT)], {
  stdio: "inherit",
  shell: true,
});

let tunnel;

async function startTunnel() {
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    tunnel = await localtunnel({ port: PORT });
    console.log("\n----------------------------------------");
    console.log("Open this HTTPS URL on your phone:");
    console.log(tunnel.url);
    console.log("----------------------------------------\n");
    console.log("Then: Chrome menu -> Install app / Add to Home Screen\n");

    tunnel.on("close", () => {
      console.log("Tunnel closed.");
    });
  } catch (error) {
    console.error("Failed to start HTTPS tunnel:", error.message);
    console.error("Make sure port 3000 is free and you have internet access.");
  }
}

startTunnel();

function shutdown() {
  tunnel?.close();
  server.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.on("exit", (code) => {
  tunnel?.close();
  process.exit(code ?? 0);
});
