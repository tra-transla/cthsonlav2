import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API endpoint to export source code
  app.get("/api/export-source", (req, res) => {
    try {
      const zip = new AdmZip();
      const rootDir = __dirname;
      
      // List of directories/files to exclude
      const excludes = [
        "node_modules",
        "dist",
        ".git",
        ".next",
        "package-lock.json",
        ".DS_Store"
      ];

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
          if (["node_modules", "dist", ".git", "package-lock.json"].includes(file)) continue;
          
          const fullPath = path.join(dir, file);
          const stats = fs.statSync(fullPath);
          const relativePath = path.join(baseDir, file);

          if (stats.isDirectory()) {
            results.push(...getFiles(fullPath, relativePath));
          } else {
            // Determine category based on extension or path
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
