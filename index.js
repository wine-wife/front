const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();
app.use(express.json());

// 정적 파일 제공
app.use(express.static(path.join(__dirname, "public")));

// MySQL 풀 생성
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "mysql",
  database: "ott_project",
});

// 전체 OTT + 요금제 조회
app.get("/services", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.id AS service_id,
        s.name AS service_name,
        p.id AS plan_id,
        p.plan_name,
        p.price
      FROM ott_services s
      JOIN ott_plans p ON s.id = p.service_id
      ORDER BY s.id, p.price
    `);

    const result = [];
    let currentService = null;

    rows.forEach(row => {
      if (!currentService || currentService.service_id !== row.service_id) {
        currentService = {
          service_id: row.service_id,
          service_name: row.service_name,
          plans: []
        };
        result.push(currentService);
      }
      currentService.plans.push({
        plan_id: row.plan_id,
        plan_name: row.plan_name,
        price: row.price
      });
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "DB 조회 실패" });
  }
});

// 내 구독 목록 + 총합 계산
app.get("/subscriptions", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        us.id AS subscription_id,
        s.name AS service_name,
        p.plan_name,
        p.price
      FROM user_subscriptions us
      JOIN ott_plans p ON us.plan_id = p.id
      JOIN ott_services s ON p.service_id = s.id
      ORDER BY s.id
    `);

    const totalPrice = rows.reduce((sum, sub) => sum + sub.price, 0);

    res.json({
      subscriptions: rows,
      totalPrice
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "구독 목록 조회 실패" });
  }
});

// 구독 추가
app.post("/subscriptions", async (req, res) => {
  const { plan_id } = req.body;

  if (!plan_id) return res.status(400).json({ message: "plan_id가 필요합니다." });

  try {
    const [existing] = await pool.query(
      "SELECT * FROM user_subscriptions WHERE plan_id = ?",
      [plan_id]
    );

    if (existing.length > 0) return res.status(400).json({ message: "이미 구독 중인 요금제입니다." });

    await pool.query("INSERT INTO user_subscriptions (plan_id) VALUES (?)", [plan_id]);

    const [rows] = await pool.query(`
      SELECT 
        us.id AS subscription_id,
        s.name AS service_name,
        p.plan_name,
        p.price
      FROM user_subscriptions us
      JOIN ott_plans p ON us.plan_id = p.id
      JOIN ott_services s ON p.service_id = s.id
      ORDER BY s.id
    `);

    const totalPrice = rows.reduce((sum, sub) => sum + sub.price, 0);

    res.json({
      message: "구독 추가 완료",
      subscriptions: rows,
      totalPrice
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "구독 추가 실패" });
  }
});

// 구독 삭제
app.delete("/subscriptions/:id", async (req, res) => {
  const subscriptionId = req.params.id;

  try {
    await pool.query("DELETE FROM user_subscriptions WHERE id = ?", [subscriptionId]);

    const [rows] = await pool.query(`
      SELECT 
        us.id AS subscription_id,
        s.name AS service_name,
        p.plan_name,
        p.price
      FROM user_subscriptions us
      JOIN ott_plans p ON us.plan_id = p.id
      JOIN ott_services s ON p.service_id = s.id
      ORDER BY s.id
    `);

    const totalPrice = rows.reduce((sum, sub) => sum + sub.price, 0);

    res.json({
      message: "구독 삭제 완료",
      subscriptions: rows,
      totalPrice
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "구독 삭제 실패" });
  }
});

// 사용하지 않는 OTT 조회
app.get("/analysis/unused", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.id AS service_id, s.name AS service_name
      FROM ott_services s
      LEFT JOIN ott_plans p ON s.id = p.service_id
      LEFT JOIN user_subscriptions us ON p.id = us.plan_id
      WHERE us.id IS NULL
      GROUP BY s.id
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "사용하지 않는 OTT 조회 실패" });
  }
});

// 서버 실행
app.listen(3000, () => console.log("✅ 서버 실행: http://localhost:3000"));
