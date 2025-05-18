const { google } = require("googleapis");
const express = require("express");
const app = express();
const port = 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Generate URL untuk otorisasi
app.get("/authorize", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline", // Untuk mendapatkan refresh token
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
  res.redirect(url);
});

// Tangani callback dari Google
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  // Simpan refresh token dengan aman
  console.log("Refresh token:", tokens.refresh_token);
  res.send("Otorisasi berhasil! Kamu bisa menutup jendela ini.");
});

app.listen(port, () => console.log(`Server berjalan di port ${port}`));
