import dotenv from "dotenv";
import pg from "pg";

dotenv.config();
const { Pool } = pg;

// Create database connection pool (reuses connections for efficiency)
// Uses DATABASE_URL if available (for cloud deployments), otherwise uses individual connection parameters
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "",
        database: process.env.PGDATABASE || "postgres",
      }
);

// Retrieve all students from the database
export async function getAllStudents() {
  const { rows } = await pool.query(
    `SELECT student_id, first_name, last_name, email, enrollment_date
     FROM students
     ORDER BY student_id;`
  );
  return rows;
}


// Add a new student to the database
// Using parameterized queries ($1, $2, etc.) prevents SQL injection attacks
export async function addStudent(first_name, last_name, email, enrollment_date) {
  const { rows } = await pool.query(
    `INSERT INTO students (first_name, last_name, email, enrollment_date)
     VALUES ($1, $2, $3, $4)
     RETURNING student_id, first_name, last_name, email, enrollment_date;`,
    [first_name, last_name, email, enrollment_date]
  );
  return rows[0];
}

// Update a student's email address
export async function updateStudentEmail(student_id, new_email) {
  const { rows } = await pool.query(
    `UPDATE students
     SET email = $2
     WHERE student_id = $1
     RETURNING student_id, first_name, last_name, email, enrollment_date;`,
    [student_id, new_email]
  );
  return rows[0] ?? null;
}

// Delete a student from the database
export async function deleteStudent(student_id) {
  const res = await pool.query(`DELETE FROM students WHERE student_id = $1;`, [student_id]);
  return res.rowCount;
}

// Handle command-line interface interactions
async function runCLI() {
  const [cmd, ...args] = process.argv.slice(2);

  try {
    switch (cmd) {
      case "list": {
        const rows = await getAllStudents();
        console.table(rows);
        break;
      }
      case "add": {
        const [first, last, email, date] = args;
        if (!first || !last || !email || !date) {
          throw new Error('Usage: add "<first>" "<last>" "<email>" "<YYYY-MM-DD>"');
        }
        const row = await addStudent(first, last, email, date);
        console.log("Inserted:", row);
        break;
      }
      case "update": {
        const [idStr, newEmail] = args;
        if (!idStr || !newEmail) {
          throw new Error('Usage: update <student_id> "<new_email>"');
        }
        const id = Number(idStr);
        const row = await updateStudentEmail(id, newEmail);
        if (!row) console.log("No student found for id =", id);
        else console.log("Updated:", row);
        break;
      }
      case "delete": {
        const [idStr] = args;
        if (!idStr) throw new Error("Usage: delete <student_id>");
        const id = Number(idStr);
        const count = await deleteStudent(id);
        console.log(count === 1 ? "Deleted." : "No student deleted (not found).");
        break;
      }
      case undefined:
      default:
        console.log(`Commands:
  list
  add "<first>" "<last>" "<email>" "<YYYY-MM-DD>"
  update <student_id> "<new_email>"
  delete <student_id>`);
    }
  } catch (err) {
    // Handle PostgreSQL error codes
    if (err.code === "23505") {
      console.error("Error: duplicate email (violates UNIQUE constraint).");
    } else if (err.code === "22P02") {
      console.error("Error: invalid input syntax (check IDs and dates).");
    } else {
      console.error(err.message || err);
    }
  } finally {
    await pool.end();
  }
}

// Run CLI if this file is executed directly (not imported as a module)
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI();
}
