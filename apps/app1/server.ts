import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs-extra";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Ensure directories exist
const INVOICES_DIR = path.join(process.cwd(), "public", "invoices");
const EXPORTS_DIR = path.join(process.cwd(), "public", "exports");
fs.ensureDirSync(INVOICES_DIR);
fs.ensureDirSync(EXPORTS_DIR);

app.use(express.json({ limit: '50mb' }));
app.use('/invoices', express.static(INVOICES_DIR));
app.use('/exports', express.static(EXPORTS_DIR));

// API Routes
app.get("/api/list-invoices", async (req, res) => {
  try {
    const files = await fs.readdir(INVOICES_DIR);
    const invoices = files
      .filter(file => !file.startsWith('.'))
      .map(file => {
        const nameWithoutExt = path.parse(file).name;
        const parts = nameWithoutExt.split("-");
        return {
          fileName: file,
          date: parts[0] || "未知日期",
          type: parts[1] || "其他",
          amount: parts[2] || "0",
          url: `/invoices/${file}`
        };
      });
    res.json({ success: true, invoices });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to list invoices" });
  }
});

app.get("/api/list-exports", async (req, res) => {
  try {
    const files = await fs.readdir(EXPORTS_DIR);
    const exports = files
      .filter(file => !file.startsWith('.'))
      .map(file => ({
        fileName: file,
        url: `/exports/${file}`,
        date: fs.statSync(path.join(EXPORTS_DIR, file)).mtime
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    res.json({ success: true, exports });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to list exports" });
  }
});

app.post("/api/save-export", async (req, res) => {
  try {
    const { fileName, base64Data } = req.body;
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(path.join(EXPORTS_DIR, fileName), buffer);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to save export" });
  }
});

app.post("/api/save-invoice", async (req, res) => {
  try {
    const { fileName, base64Data, date, type, amount } = req.body;
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Use the same naming convention as list-invoices expects: date-type-amount-filename
    const safeFileName = `${date}-${type}-${amount}-${fileName.replace(/[\\/:*?"<>|]/g, "")}`;
    await fs.writeFile(path.join(INVOICES_DIR, safeFileName), buffer);
    
    res.json({ success: true, fileName: safeFileName });
  } catch (error: any) {
    console.error("Save invoice error:", error);
    res.status(500).json({ error: "Failed to save invoice" });
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
  app.use(express.static("dist"));
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Increase timeout to 10 minutes for long-running email fetches
server.timeout = 600000;
server.keepAliveTimeout = 600000;
