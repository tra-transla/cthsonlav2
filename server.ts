import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Simple JSON Database ---
const DB_FILE = path.join(__dirname, "db.json");

const getInitialData = () => {
  return {
    meetings: [],
    endpoints: [],
    units: [],
    staff: [],
    groups: [],
    users: [
      { id: '1', username: 'admin', fullName: 'Quản trị viên Hệ thống', role: 'ADMIN', password: 'admin' },
      { id: '2', username: 'user', fullName: 'Cán bộ Giám sát', role: 'VIEWER', password: 'user' }
    ],
    system_settings: {
      systemName: 'ỦY BAN NHÂN DÂN TỈNH SƠN LA',
      shortName: 'HỘI NGHỊ TRỰC TUYẾN SƠN LA',
      primaryColor: '#3B82F6'
    }
  };
};

const readDb = () => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial = getInitialData();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    const content = fs.readFileSync(DB_FILE, "utf-8");
    if (!content.trim()) {
      const initial = getInitialData();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(content);
  } catch (error) {
    console.error("Error reading database:", error);
    return getInitialData();
  }
};

const writeDb = (data: any) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // --- WebSocket Server ---
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  const broadcast = (message: any) => {
    const data = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  // --- API Routes ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Generic CRUD for DB tables
  app.get("/api/db/:table", (req, res) => {
    const { table } = req.params;
    const db = readDb();
    res.json(db[table] || []);
  });

  app.post("/api/db/:table", (req, res) => {
    const { table } = req.params;
    const item = req.body;
    const db = readDb();
    
    if (!db[table]) db[table] = [];
    
    const index = db[table].findIndex((i: any) => i.id === item.id);
    if (index > -1) {
      db[table][index] = { ...db[table][index], ...item, updatedAt: new Date().toISOString() };
    } else {
      db[table].push({ ...item, updatedAt: new Date().toISOString() });
    }
    
    writeDb(db);
    broadcast({ type: "UPDATE", table, data: item });
    res.json({ success: true });
  });

  app.delete("/api/db/:table/:id", (req, res) => {
    const { table, id } = req.params;
    const db = readDb();
    
    if (db[table]) {
      db[table] = db[table].filter((i: any) => i.id !== id);
      writeDb(db);
      broadcast({ type: "DELETE", table, id });
    }
    
    res.json({ success: true });
  });

  // System Settings special case
  app.get("/api/settings", (req, res) => {
    const db = readDb();
    res.json(db.system_settings);
  });

  app.post("/api/settings", (req, res) => {
    const db = readDb();
    db.system_settings = { ...db.system_settings, ...req.body, updatedAt: new Date().toISOString() };
    writeDb(db);
    broadcast({ type: "UPDATE", table: "system_settings", data: db.system_settings });
    res.json({ success: true });
  });

  // API endpoint to export source code
  app.get("/api/export-source", (req, res) => {
    try {
      const zip = new AdmZip();
      const rootDir = __dirname;
      
      const excludes = ["node_modules", "dist", ".git", ".next", "package-lock.json", ".DS_Store", "db.json"];

      const addFilesToZip = (dir: string, zipPath: string = "") => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (excludes.includes(file)) continue;
          const fullPath = path.join(dir, file);
          const stats = fs.statSync(fullPath);
          const currentZipPath = path.join(zipPath, file);
          if (stats.isDirectory()) {
            addFilesToZip(fullPath, currentZipPath);
          } else {
            const content = fs.readFileSync(fullPath);
            zip.addFile(currentZipPath, content);
          }
        }
      };

      addFilesToZip(rootDir);
      const zipBuffer = zip.toBuffer();
      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=cth-sla-source-${new Date().toISOString().slice(0, 10)}.zip`,
        "Content-Length": zipBuffer.length
      });
      res.send(zipBuffer);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Failed to export source code" });
    }
  });

  // API endpoint to get file list for UI display
  app.get("/api/source-files", (req, res) => {
    try {
      const getFiles = (dir: string, baseDir: string = ""): any[] => {
        const results: any[] = [];
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (["node_modules", "dist", ".git", "package-lock.json", "db.json"].includes(file)) continue;
          const fullPath = path.join(dir, file);
          const stats = fs.statSync(fullPath);
          const relativePath = path.join(baseDir, file);
          if (stats.isDirectory()) {
            results.push(...getFiles(fullPath, relativePath));
          } else {
            let category = "Other";
            if (file.endsWith(".tsx") || file.endsWith(".ts")) {
              if (relativePath.includes("services")) category = "Services";
              else if (relativePath.includes("components")) category = "Components";
              else category = "Core";
            } else if (file.endsWith(".sql")) category = "Database";
            else if (file === "package.json") category = "Deployment";
            results.push({ name: relativePath, category });
          }
        }
        return results;
      };
      const fileList = getFiles(__dirname);
      res.json(fileList);
    } catch (error) {
      res.status(500).json({ error: "Failed to get file list" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
