const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: "localhost",
  user: "root", // change if you use a different MySQL user
  password: "root", // add your password if set in MySQL Workbench
  database: "cafe_shop", // make sure this matches your actual database name
});

db.connect((err) => {
  if (err) {
    console.error("MySQL connection error:", err);
    return;
  }
  console.log("Connected to MySQL");
});

app.get("/products", (req, res) => {
  db.query("SELECT * FROM products", (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error fetching products");
    } else {
      res.json(results);
    }
  });
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
