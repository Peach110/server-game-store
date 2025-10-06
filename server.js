const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const os = require("os");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: "10mb" }));
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads"))); // serve static files

// ✅ ใช้ connection pool
const db = mysql
  .createPool({
    connectionLimit: 10,
    host: "202.28.34.203",
    port: "3306",
    user: "mb68_66011212222",
    password: "@Hq27hP@LnQo",
    database: "mb68_66011212222",
  })
  .promise();

// ✅ ทดสอบ connection
(async () => {
  try {
    const conn = await db.getConnection();
    console.log("✅ Connected to MySQL database 'mb68_66011212222'.");
    conn.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
})();

// Upload config
const uploadsDir = path.resolve(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) =>
    cb(null, uuidv4() + path.extname(file.originalname)),
});

const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

// 🔹 REGISTER – สมัครสมาชิกพร้อมรูปภาพ
app.post("/SignUp", upload.single("profile_image"), async (req, res) => {
  const { username, email, password, role } = req.body;
  const file = req.file;

  if (!username || !email || !password)
    return res.status(400).json({ error: "กรอกข้อมูลไม่ครบ" });

  try {
    const [exists] = await db.query(
      "SELECT * FROM user_account WHERE username = ? OR email = ?",
      [username, email]
    );
    if (exists.length > 0)
      return res.status(400).json({ error: "username หรือ email ถูกใช้แล้ว" });

    const hash = await bcrypt.hash(password, 10);
    const imageUrl = file ? `/uploads/${file.filename}` : null;

    const [result] = await db.query(
      "INSERT INTO user_account (username, email, password_hash, role, profile_image_url, wallet_balance) VALUES (?, ?, ?, ?, ?, ?)",
      [username, email, hash, role || "user", imageUrl, 0]
    );

    res.json({
      message: "สมัครสมาชิกสำเร็จ",
      user: {
        id: result.insertId,
        username,
        email,
        role: role || "user",
        wallet_balance: 0,
        profile_image_url: imageUrl,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
  }
});

// 🔹 LOGIN – เข้าสู่ระบบ
app.post("/Login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "กรุณากรอกอีเมลและรหัสผ่าน" });

  try {
    const [rows] = await db.query(
      "SELECT * FROM user_account WHERE email = ?",
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "ไม่พบผู้ใช้งานนี้" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      "SECRET_KEY",
      { expiresIn: "2h" }
    );

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        wallet_balance: user.wallet_balance,
        profile_image_url: user.profile_image_url,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
  }
});

// 🔹 GET USERS - ดึงข้อมูลผู้ใช้ทั้งหมด
app.get("/users", async (_req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, username, email, role, wallet_balance, created_at FROM user_account"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
  }
});

// 🔹 UPDATE PROFILE
app.post("/update-profile", upload.single("profileImg"), async (req, res) => {
  try {
    const { userId, name } = req.body;
    let profile_image_url = "";

    if (req.file) profile_image_url = `/uploads/${req.file.filename}`;

    let query = "";
    const params = [];
    if (profile_image_url) {
      query =
        "UPDATE user_account SET username = ?, profile_image_url = ? WHERE id = ?";
      params.push(name, profile_image_url, userId);
    } else {
      query = "UPDATE user_account SET username = ? WHERE id = ?";
      params.push(name, userId);
    }

    await db.query(query, params);

    const [rows] = await db.query(
      "SELECT id, username, profile_image_url, wallet_balance FROM user_account WHERE id = ?",
      [userId]
    );
    const user = rows[0];

    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/", (req, res) => {
  res.send("Hello Games-Store");
});

app.listen(PORT, () => {
  console.log(`✅ Mydatabase API listening at http://localhost:${PORT}`);
});
