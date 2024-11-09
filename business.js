//business layer
const crypto = require('crypto')
const persistence = require("./persistence")

// Function to hash passwords with a salt
function hashPassword(password, salt = null) {
    if (!salt) {
        // Generate a new salt if one isn't provided (for registration)
        salt = crypto.randomBytes(4).toString('hex')
    }
    const hash = crypto.createHash('sha512')
    hash.update(salt + password) // Prepend salt to password before hashing
    const hashedPassword = hash.digest('hex')
    return `${salt}:${hashedPassword}` // Return salt and hash in "salt:hash" format
}

// Function to generate a UUID
function generateSessionKey() {
    return crypto.randomUUID() // Generating a unique session key using crypto
}

// User login
async function loginUser(username, password) {
    const user = await persistence.getUserDetails(username)
    if (!user) {
        throw new Error('User not found')
    }

    // Extract the salt and hash from the stored password hash
    const [storedSalt, storedHash] = user.passwordHash.split(':')
    
    // Hash the entered password with the stored salt
    const hashedPassword = hashPassword(password, storedSalt).split(':')[1] // Only get the hash part

    if (hashedPassword !== storedHash) {
        throw new Error('Invalid password')
    }

    // Create a new session
    const sessionKey = generateSessionKey()
    const expiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minute expiry for testing

    await persistence.saveSession({
        key: sessionKey,
        expiry: expiry,
        data: {
            username: user.username,
        }
    })

    return { sessionKey, user }
}

// Get user session data
async function getSession(sessionKey) {
    return await persistence.getSession(sessionKey)
}

// Logout user
async function logoutUser(sessionKey) {
    await persistence.deleteSession(sessionKey) // Deletes the session from the database
}

// Function to generate a verification token
function generateVerificationToken() {
    return crypto.randomBytes(16).toString('hex')  // Generate a random token
}

async function registerUser(userData) {
    try {
        const existingUser = await persistence.getUserDetails(userData.username)
        if (existingUser) {
            throw new Error('Username already exists')
        }

        const passwordHash = hashPassword(userData.password)
        userData.passwordHash = passwordHash
        const verificationToken = generateVerificationToken()
        userData.verificationToken = verificationToken

        await persistence.createUser(userData)
        await logVerificationEmail(userData.email, verificationToken)

        return await persistence.getUserDetails(userData.username)
    } catch (error) {
        console.error('Error in registration:', error.message || error)
        throw error
    }
}


// Function to simulate sending the verification email (log it to console)
async function logVerificationEmail(email, token) {
    const verificationLink = `http://localhost:8000/verify-email?token=${token}`  // The verification link

    console.log(`\n[Email Sent to ${email}]\n`)
    console.log(`Please verify your email by clicking on the following link:`)
    console.log(`${verificationLink}\n`)
}

async function verifyEmailToken(token) {
    const user = await persistence.getUserByVerificationToken(token)
    if (!user) {
        throw new Error('Invalid or expired token')
    }
    return user
}

async function updateUserEmailVerified(username) {
    await persistence.updateUserEmailVerified(username, { emailVerified: true })
}

// Initiate password reset
async function initiatePasswordReset(email) {
    const user = await persistence.getUserByEmail(email)
    const resetKey = crypto.randomUUID()

    if (user) {
        await persistence.setResetKey(user.user, resetKey)
    }

    // Simulate sending an email by logging to the console
    console.log(`Email sent to ${email}`)
    console.log(`Subject: Password Reset`)
    console.log(`Message: Click the following link to reset your password: http://127.0.0.1:8000/reset-password/${resetKey}`)
}

// Verify the reset key
async function verifyResetKey(resetKey) {
    const user = await persistence.getUserByResetKey(resetKey) // Make sure persistence layer is checking the correct key
    
    if (!user) {
        return false // Invalid or expired key
    }
    
    // Optionally, check if the key has expired (if applicable)
    const resetKeyExpirationTime = user.resetKeyExpirationTime // Ensure you store this in the database
    if (new Date() > resetKeyExpirationTime) {
        return false // Expired key
    }
    
    return true // Valid reset key
}

// Reset the password
async function resetPassword(resetKey, newPassword) {
    const user = await persistence.getUserByResetKey(resetKey)
    console.log("In business layer checking reset password" + resetKey)
    console.log("In business layer checking reset password" +newPassword)
    if (!user) return false

    const hashedPassword = hashPassword(newPassword)
    await persistence.updatePassword(user.username, hashedPassword)
    return true
}

module.exports = {
    registerUser,
    loginUser,
    verifyEmailToken,
    updateUserEmailVerified,
    logVerificationEmail,
    getSession,
    initiatePasswordReset,
    verifyResetKey,
    resetPassword,
    logoutUser
}
