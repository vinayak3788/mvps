const express = require("express");
const fileUpload = require("express-fileupload");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const csv = require("csv-writer").createObjectCsvWriter;
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Configure directories
const DATA_DIR = path.join(__dirname, "Data");
const ORDERS_CSV = path.join(DATA_DIR, "orders.csv");

// Ensure Data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Initialize CSV file with headers if it doesn't exist
if (!fs.existsSync(ORDERS_CSV)) {
  fs.writeFileSync(ORDERS_CSV, "OrderID,FileName,Pages,Type,Cost,Date\n");
}

// Middleware
app.use(express.static("public"));
app.use("/static", express.static("static"));
app.use("/templates", express.static("templates"));
app.use(
  fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // limit file size to 50 MB
  }),
);
app.use(express.json());

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["http://localhost:3000"],
    credentials: true,
  }),
);

app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// Convert Word to PDF using LibreOffice (installed on Replit)
async function convertToPdf(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    exec(
      `libreoffice --headless --convert-to pdf --outdir ${path.dirname(outputPath)} ${inputPath}`,
      (error, stdout, stderr) => {
        if (error) {
          console.error("Conversion error:", stderr);
          return reject(error);
        }
        resolve(true);
      },
    );
  });
}

// API Endpoints
app.post("/api/orders", async (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const file = req.files.file;
  const printType = req.body.type;
  const orderId = await getNextOrderId();

  try {
    // Save original file temporarily
    const tempPath = path.join(DATA_DIR, `temp_${file.name}`);
    await file.mv(tempPath);

    // Process different file types
    let pdfPath, pageCount;
    const ext = path.extname(file.name).toLowerCase();

    if (ext === ".pdf") {
      pdfPath = path.join(DATA_DIR, `${orderId}.pdf`);
      fs.renameSync(tempPath, pdfPath);
      pageCount = await getPdfPageCount(pdfPath);
    } else if (ext === ".docx" || ext === ".doc") {
      pdfPath = path.join(DATA_DIR, `${orderId}.pdf`);
      const converted = await convertToPdf(tempPath, pdfPath);
      if (!converted) throw new Error("Conversion failed");
      pageCount = await getPdfPageCount(pdfPath);
      fs.unlinkSync(tempPath); // Remove temp file
    } else {
      fs.unlinkSync(tempPath); // Remove temp file
      return res.status(400).json({ error: "Unsupported file type" });
    }

    // Calculate cost
    const cost = printType === "color" ? pageCount * 5 : pageCount * 2;

    // Add to CSV
    await addOrderToCsv({
      OrderID: orderId,
      FileName: file.name,
      Pages: pageCount,
      Type: printType === "color" ? "Color" : "Black & White",
      Cost: cost,
      Date: new Date().toISOString(),
    });

    res.json({
      success: true,
      order: {
        id: orderId,
        fileName: file.name,
        pages: pageCount,
        type: printType === "color" ? "Color" : "Black & White",
        cost,
        date: new Date().toLocaleDateString(),
      },
    });
  } catch (error) {
    console.error("Order processing error:", error);
    res.status(500).json({ error: "Order processing failed" });
  }
});

app.get("/api/orders", async (req, res) => {
  console.log("Orders endpoint hit"); // Debug log
  try {
    const orders = await readOrdersCsv();
    res.json(orders);
  } catch (error) {
    console.error("CSV read error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "templates/dashboard.html"));
});

// Helper functions
async function getPdfPageCount(pdfPath) {
  const pdfjsLib = require("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
    "pdfjs-dist/build/pdf.worker.min.js",
  );

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument(data).promise;
  return doc.numPages;
}

async function getNextOrderId() {
  const orders = await readOrdersCsv();
  return orders.length > 0 ? Math.max(...orders.map((o) => o.OrderID)) + 1 : 10;
}

async function readOrdersCsv() {
  try {
    const content = fs.readFileSync(ORDERS_CSV, "utf8");
    const lines = content.trim().split("\n");

    // Return empty array if only headers exist
    if (lines.length <= 1) return [];

    const headers = lines[0].split(",");
    return lines
      .slice(1)
      .filter((line) => line.trim())
      .map((line) => {
        const values = line.split(",");
        return headers.reduce((obj, header, i) => {
          obj[header] = values[i] || "";
          return obj;
        }, {});
      });
  } catch (error) {
    console.error("CSV read error:", error);
    return [];
  }
}

async function addOrderToCsv(order) {
  fs.appendFileSync(
    ORDERS_CSV,
    `${order.OrderID},${order.FileName},${order.Pages},${order.Type},${order.Cost},${order.Date}\n`,
  );
}

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on:
  - Local: http://localhost:${PORT}
  - External: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
  console.log(`Files will be stored in: ${DATA_DIR}`);
});
