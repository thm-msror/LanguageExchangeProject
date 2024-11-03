//business layer
const crypto = require('crypto')
const persistence = require("./persistence")

// Function to hash passwords
function hashPassword(password) {
    const hash = crypto.createHash('sha256') // Using SHA-256 hash algorithm
    hash.update(password)
    return hash.digest('hex') // Returning hashed password as hex string
}

// Function to generate a UUID
function generateSessionKey() {
    return crypto.randomUUID() // Generating a unique session key using crypto
}

// Register a new user
async function registerUser(userData) {
    // Check if the user already exists
    const existingUser = await persistence.getUserDetails(userData.username)
    if (existingUser) {
        throw new Error('Username already exists')
    }

    // Hash the password before saving
    userData.passwordHash = hashPassword(userData.password) // Hash the password

    // Insert the new user into the database
    await persistence.createUser(userData) // Ensure to await this operation
}

// User login
async function loginUser(username, password) {
    const user = await persistence.getUserDetails(username)
    console.log(user)
    if (!user) {
        throw new Error('User not found')
    }
    
    // Verify the password using the hashed password
    const hashedPassword = hashPassword(password)
    if (hashedPassword !== user.passwordHash) {
        throw new Error('Invalid password')
    }
    
    // Create a new session
    const sessionKey = generateSessionKey()
    const expiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minute expiry
    
    // Pass a single object to saveSession
    await persistence.saveSession({
        sessionToken: sessionKey,
        expiry: expiry,
        userId: user._id //BUG : userId is not defined

    })

    return { sessionKey, user } // Return session key and user details
}

// Get user session data
async function getUserSession(sessionKey) {
    return await persistence.getSessionData(sessionKey)
}

// Logout user
async function logoutUser(sessionKey) {
    await persistence.deleteSession(sessionKey) // Deletes the session from the database
}

module.exports = {
    registerUser,
    loginUser,
    getUserSession,
    logoutUser
}
