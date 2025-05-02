# 🌍 Language Exchange Project

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
```plaintext
LanguageExchangeProject/
├── .env                             # MongoDB connection string (DO NOT SHARE)
├── .gitignore                       # Ignores node_modules and .env
├── app.js                           # Entry point and route definitions
├── business.js                      # Application logic layer
├── persistence.js                   # MongoDB database access layer
├── package.json                     # Project dependencies and scripts
├── package-lock.json                # Dependency lock file
├── node_modules/                    # Installed packages (auto-generated)
|
├── static/                          # CoreUI assets (CSS, JS, images)
│   ├── assets/
│   ├── css/
│   ├── icons/
│   ├── js/
│   ├── svg/
│   └── vendors/
|
├── templates/                       # Handlebars view templates (.handlebars)
│   ├── layouts/
│   │   └── main.handlebars          # Master layout applied across all pages
│   ├── register.handlebars
|   ├── verify-link.handlebars
|   ├── verification-success.handlebars
│   ├── login.handlebars
│   ├── forgot-password.handlebars
│   ├── reset-password.handlebars
│   ├── reset-link.handlebars
│   ├── 404.handlebars
│   ├── 500.handlebars
│   ├── user.handlebars              # User profile and language setup
│   ├── contact.handlebars           # View and manage contacts
│   ├── contactprofile.handlebars    # Contact profile view
│   ├── message.handlebars           # Messaging UI
│   └── badge.handlebars             # Badge system UI
```
## 🔄 User Flow

1. **Registration**
   - A new user signs up with a username, password, and email.=
   - After registration, click the verification link shown on the page
   - Successful verification redirects to login page

2. **Login**
   - Once verified, the user logs in using their credentials.
   - A secure session is created and stored in the database.

3. **Profile Setup**
   - After login, the user is prompted to complete their profile.
   - They can write a short description, upload a profile photo, select languages they are fluent in, and choose the languages they want to learn.

4. **Finding Contacts**
   - The system suggests users who are fluent in the language(s) the current user wants to learn.
   - The user can add contacts from this list, view their profiles, or remove/block them.

5. **Messaging**
   - Users can send plain-text messages to contacts.
   - Conversations are stored and can be viewed at any time.
   - Users must refresh the page (or use optional JavaScript auto-refresh) to view new messages.

6. **Badges**
   - As users interact, they automatically earn badges:
     - 🫱 Handshake! — First message sent and replied to.
     - 💯 Century! — 100 total messages sent.
   - Badges appear on their profile and are awarded dynamically based on message activity.

7. **Password Reset**
   - If a user forgets their password, they can request a reset link.
   - Use the reset link displayed on the page within 2 minutes
   - Passwords must be different from previous ones

8. **Security & Protection**
   - CSRF tokens are used to secure forms.
   - Users can block others, which removes them from contacts and prevents further interactions.


## 🚀 Getting Started (Setup Instructions)

Follow these steps to run the project locally on your machine:

### 1. Clone the repository
```bash
git clone https://github.com/your-username/LanguageExchangeProject.git
cd LanguageExchangeProject
```

### Install the dependencies
```bash
npm install
```

### Create a .env file in the root directory
- Add the following line to .env: `MONGO_URI=mongodb+srv:/<your-username>:<your-password>@cluster.mongodb.net/`
- ⚠️ Important: Replace the MongoDB URI with your own from MongoDB Atlas.

### Start the application using node or nodemon
- Use node : `node app.js`
- Use nodemon: `nodemon app.js`

## Default port 
- The app runs locally at: http://localhost:8000