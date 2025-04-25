# 🌍 Language Exchange Platform

This is a full-stack web application designed for language learners to connect with native speakers worldwide. It provides a secure and structured way for users to exchange messages, manage contacts, earn badges, and grow their language skills through interaction.

## ✨ Features

- 🧑‍💼 User Registration with email verification (simulated)
- 📄 User Profiles with fluent/learning languages and profile photos
- 🧑‍🤝‍🧑 Contact system (add, remove, block users)
- 💬 Text-only messaging system (non real-time, manual refresh or auto-refresh with JS)
- 🏅 Badge system for:
  - First conversation (`Handshake!`)
  - 100 messages sent (`Century!`)
- 🔐 Secure password reset with expiry
- 🧾 CSRF protection
- 👀 CoreUI template for professional UI
- 📁 Fully layered backend: `app.js`, `business.js`, `persistence.js`

## 🗂️ Directory Structure

<pre> LanguageExchangeProject/ ├── .env # MongoDB connection string (DO NOT SHARE) ├── .gitignore # Prevents committing .env and node_modules ├── app.js # Entry point and route handling ├── business.js # Application logic layer ├── persistence.js # MongoDB access layer │ ├── static/ # Contains CoreUI CSS/JS/assets │ └── ... # CoreUI files │ ├── templates/ # Handlebars templates for HTML views │ └── ... # .hbs files │ ├── package.json # Project dependencies and scripts ├── package-lock.json # Auto-generated package version locking └── node_modules/ # Installed dependencies (auto-generated) </pre>

