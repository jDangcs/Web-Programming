const express = require("express");
const crypto = require("crypto");
const path = require("path");
const util = require("util");
const mysql = require("mysql2");

const pbkdf2 = util.promisify(crypto.pbkdf2);

const app = express();
app.use(express.urlencoded({ extended: false })); // only plain strings, no nested objects
app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
	host: "localhost",
	user: "root",
	password: process.env.ROOTPASS,
	database: "paws",
	port: 3306
});

// Create the table automatically if it doesn't exist yet
pool.query(
	`CREATE TABLE IF NOT EXISTS users (
		username VARCHAR(50) PRIMARY KEY,
		email VARCHAR(100) NOT NULL UNIQUE,
		password CHAR(128) NOT NULL,
		salt CHAR(32) NOT NULL
	)`,
	function (err) {
		if (err) console.log("Couldn't set up the users table", err);
		else console.log("Database ready");
	}
);

function hashPassword(plain, salt) {
	return pbkdf2(plain, salt, 100000, 64, "sha512"); // async, doesn't block the server
}

function isText(value, maxLength) {
	return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

const registerFail = (msg) => `<p>${msg} <a href="register.html">Try again</a></p>`;
const loginFail = '<p>The login credentials were incorrect. <a href="login.html">Back to login</a></p>';

app.post("/register", async function (req, res) {
	const { username, email, password } = req.body;

	if (!isText(username, 50) || !isText(email, 100) || !isText(password, 200))
		return res.send(registerFail("Please fill in every field."));

	try {
		const salt = crypto.randomBytes(16).toString("hex");
		const hashed = (await hashPassword(password, salt)).toString("hex");
		const sql = "insert into users (username, email, password, salt) values (?,?,?,?)";

		pool.query(sql, [username, email, hashed, salt], function (err) {
			if (err) {
				if (err.code === "ER_DUP_ENTRY")
					return res.send(registerFail("That username or e-mail is already registered."));
				console.log("Register error", err);
				return res.send(registerFail("Registration failed."));
			}
			res.send('<p>You have successfully registered. <a href="login.html">Login here</a></p>');
		});
	} catch (e) {
		console.log("Register error", e);
		res.send(registerFail("Registration failed."));
	}
});

app.post("/login", function (req, res) {
	const { username, password } = req.body;

	if (!isText(username, 50) || !isText(password, 200))
		return res.send(loginFail);

	pool.query("select password, salt from users where username = ?", [username], async function (err, result) {
		if (err || result.length === 0)
			return res.send(loginFail);

		try {
			const attempt = await hashPassword(password, result[0].salt);
			const stored = Buffer.from(result[0].password, "hex");

			if (stored.length === attempt.length && crypto.timingSafeEqual(stored, attempt))
				res.send("<p>You have logged in successfully</p>");
			else
				res.send(loginFail);
		} catch (e) {
			console.log("Login error", e);
			res.send(loginFail);
		}
	});
});

app.listen(3000, () => console.log("Listening on http://localhost:3000"));