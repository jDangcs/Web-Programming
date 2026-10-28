const express = require("express");
const crypto = require("crypto");
const path = require("path");
const util = require("util");
const mysql = require("mysql2");
const session = require("express-session"); // adds req.session to every request

const pbkdf2 = util.promisify(crypto.pbkdf2);

const app = express();
app.use(express.urlencoded({ extended: false })); // only plain strings, no nested objects
app.use(express.static(path.join(__dirname, "public")));

// Session middleware: data is kept on the server; the browser stores only a signed cookie with the session id
app.use(session({
	secret: process.env.SESSION_SECRET || "dev-only-secret-change-me", // signs the session id cookie
	resave: false,            // don't re-save unchanged sessions
	saveUninitialized: false, // don't create a session until something is stored in it
	cookie: {
		maxAge: 60000 * 60,   // session lasts 1 hour
		httpOnly: true,       // page JavaScript can't read the cookie
		secure: false         // set to true when served over HTTPS
	}
}));

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

// Escapes text before it goes into HTML so usernames display as plain text
function escapeHtml(text) {
	return String(text)
		.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
			{
				// Password is correct: start a fresh session id, then STORE the username in the session
				req.session.regenerate(function (err) {
					if (err) return res.send(loginFail);
					req.session.username = username; // remembered on every later request from this browser
					res.send('<p>You have logged in successfully. Visit your <a href="/profile">Profile</a></p>');
				});
			}
			else
				res.send(loginFail);
		} catch (e) {
			console.log("Login error", e);
			res.send(loginFail);
		}
	});
});

// /profile reads the session variable that /login stored
app.get("/profile", function (req, res) {
	// No username in the session means the visitor hasn't logged in
	if (!req.session.username)
		return res.send('<p>You are not logged in. <a href="login.html">Login here</a></p>');

	res.send(`<h2>Profile</h2><p>Hi ${escapeHtml(req.session.username)}, you are logged in.</p><p><a href="/logout">Logout</a></p>`);
});

// /logout destroys the session, so the stored username is gone
app.get("/logout", function (req, res) {
	req.session.destroy(function (err) { // deletes the server-side session data
		if (err) return res.send("<p>Error logging out.</p>");
		res.clearCookie("connect.sid");  // removes the session cookie from the browser
		res.send('<p>You have been logged out. <a href="login.html">Login again</a></p>');
	});
});

app.listen(3000, () => console.log("Listening on http://localhost:3000"));