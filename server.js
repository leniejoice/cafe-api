require("dotenv").config(); // Load environment variables from .env file

const express = require("express");
const mysql = require("mysql2/promise"); // Use the promise-based version for async/await
const cors = require("cors");

const app = express();
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Enable JSON body parsing

// Database connection using environment variables
// Using createConnection for a single connection, or createPool for multiple connections
// For a simple app, createConnection is fine. For high traffic, use createPool.
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

// Test database connection
db.then(() => {
  console.log("Connected to MySQL database:", process.env.DB_NAME);
}).catch((err) => {
  console.error("MySQL connection error:", err);
  process.exit(1); // Exit if database connection fails
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("Welcome to the Café API!");
});

// Endpoint to get all products
// Updated to use async/await with the promise-based connection
app.get("/api/products", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT product_id, name, description, price, category FROM products"
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching products:", error);
    res
      .status(500)
      .json({ message: "Error fetching products", error: error.message });
  }
});

// Endpoint to place a new order
app.post("/api/orders", async (req, res) => {
  const {
    customerName,
    customerContact,
    customerAddress,
    cartItems,
    totalAmount,
  } = req.body;

  // Basic validation
  if (
    !customerName ||
    !customerContact ||
    !customerAddress ||
    !cartItems ||
    cartItems.length === 0 ||
    totalAmount === undefined
  ) {
    return res.status(400).json({ message: "Missing required order details." });
  }

  let connection; // Declare connection variable outside try-block for finally access
  try {
    // Get a connection from the pool (if using pool) or use the direct connection
    // Since we are using createConnection, we will use db directly for queries.
    // If you switch to createPool, you'd do: connection = await pool.getConnection();
    connection = await db; // Use the direct connection

    // Start a transaction for atomicity
    await connection.beginTransaction();

    // 1. Insert into customers table
    // For simplicity, always inserting a new customer. In a real app, you might
    // check if customer exists by contact_number and reuse their ID.
    const [customerResult] = await connection.execute(
      "INSERT INTO customers (name, contact_number, address) VALUES (?, ?, ?)",
      [customerName, customerContact, customerAddress]
    );
    const customerId = customerResult.insertId;

    // 2. Insert into orders table
    const [orderResult] = await connection.execute(
      "INSERT INTO orders (customer_id, total_amount, status) VALUES (?, ?, ?)",
      [customerId, totalAmount, "pending"]
    );
    const orderId = orderResult.insertId;

    // 3. Insert into order_items table for each item in the cart
    for (const item of cartItems) {
      // Fetch product_id and current unit_price from the database to ensure data integrity
      const [productRows] = await connection.execute(
        "SELECT product_id, price FROM products WHERE name = ?",
        [item.name]
      );

      if (productRows.length === 0) {
        // If a product from the cart is not found in the DB, log a warning
        // and skip this item, or you could choose to throw an error and rollback the whole order.
        console.warn(
          `Product "${item.name}" not found in database. Skipping for order ${orderId}.`
        );
        continue;
      }
      const productId = productRows[0].product_id;
      const unitPrice = productRows[0].price; // Use price from DB to prevent client-side tampering

      await connection.execute(
        "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
        [orderId, productId, item.quantity, unitPrice]
      );
    }

    // Commit the transaction if all operations are successful
    await connection.commit();
    res
      .status(201)
      .json({ message: "Order placed successfully!", orderId: orderId });
  } catch (error) {
    // Rollback the transaction if any error occurs
    if (connection) {
      await connection.rollback();
    }
    console.error("Error placing order:", error);
    res
      .status(500)
      .json({ message: "Failed to place order", error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(
    "Ensure your .env file has DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, and DB_PORT set."
  );
});
