//business layer
const crypto = require('crypto')
const persistence = require("./persistence")


/**
 * Hashes a password with a salt.
 * 
 * Generates a new salt if none is provided and returns the salt and hashed password in "salt:hash" format.
 * 
 * @param {string} password - The password to hash.
 * @param {string|null} [salt=null] - The optional salt; generates a new one if null.
 * @returns {string} A string in "salt:hash" format.
 */
function hashPassword(password, salt = null) {
    // Generate a new salt if one isn't provided (for registration)
    if (!salt) {
        salt = crypto.randomBytes(4).toString('hex')
    }

    const hash = crypto.createHash('sha512')
    hash.update(salt + password) // Prepend salt to password before hashing
    const hashedPassword = hash.digest('hex')
    return `${salt}:${hashedPassword}` // Return salt and hash in "salt:hash" format
}


/**
 * Generates a unique session key using the`crypto` module to create a random UUID.
 * 
 * @returns {string} The generated session key.
 */
function generateSessionKey() {
    return crypto.randomUUID() // Generating a unique session key using crypto
}


/**
 * Logs in a user by verifying credentials and creating a session.
 * Checks the username, email verification, and password. If valid, a session key is created and stored.
 * 
 * @async
 * @param {string} username - The username of the user trying to log in.
 * @param {string} password - The password provided by the user.
 * @returns {Promise<Object>} The session key and user details if login is successful.
 * @throws {Error} Throws an error if user not found, email not verified, or invalid password.
 */
async function loginUser(username, password) {
    try {
        const user = await persistence.getUserDetails(username)
        if (!user) {
            throw new Error('User not found')
        }

        if (user.emailVerified === false) {
            throw new Error("Email not verified")
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

    } catch (error) {
        throw error
    }
}


/**
 * Retrieves the session data for a given session key.
 * 
 * @async
 * @param {string} sessionKey - The session key to fetch session data.
 * @returns {Promise<Object>} The session data.
 */
async function getSession(sessionKey) {
    return await persistence.getSession(sessionKey)
}


/**
 * Logs out the user by deleting their session.
 * 
 * @async
 * @param {string} sessionKey - The session key to delete the session.
 * @returns {Promise<void>} Resolves once the session is deleted.
 */
async function logoutUser(sessionKey) {
    await persistence.deleteSession(sessionKey)
}


/**
 * Generates a random verification token.
 * 
 * @returns {string} A hex-encoded string of the verification token.
 */
function generateVerificationToken() {
    return crypto.randomBytes(16).toString('hex')
}


/**
 * Validates if two passwords match.
 * 
 * @param {string} pass1 - The first password.
 * @param {string} pass2 - The second password.
 * @returns {Promise<boolean>} `true` if the passwords match, otherwise `false`.
 */
async function validatePassword(pass1, pass2) {
    if (pass1 !== pass2) {
        return false
    }
    return true
}


/**
 * Registers a new user by validating the username, password, and creating a new account.
 * Checks if the username already exists, validates the password match, hashes the password, generates a verification token,
 * and creates the user in the persistence layer. A verification email is sent to the user.
 * 
 * @async
 * @param {string} username - The desired username of the user.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @param {string} repeatPassword - The password confirmation.
 * @returns {Promise<Object>} The newly created user details.
 * @throws {Error} Throws an error if the username already exists or passwords do not match.
 */
async function registerUser(username, email, password, repeatPassword) {
    try {
        const existingUser = await persistence.getUserDetails(username)
        if (existingUser) {
            throw new Error("Username already exists.")
        }

        const passwordMatch = await validatePassword(password, repeatPassword)
        if (!passwordMatch) {
            throw new Error("Both passwords do no match.")
        }

        const passwordHash = hashPassword(password)
        const verificationToken = generateVerificationToken()

        await persistence.createUser({
            username: username,
            email: email,
            passwordHash: passwordHash,
            verificationToken: verificationToken
        })

        await logVerificationEmail(email, verificationToken)

        return await persistence.getUserDetails(username)
    } catch (error) {
        throw error
    }
}


/**
 * Simulates sending a verification email by logging the verification link to the console.
 * 
 * @async
 * @param {string} email - The email address to send the verification to.
 * @param {string} token - The verification token.
 * @returns {Promise<void>} Logs the verification email to the console.
 */
async function logVerificationEmail(email, token) {
    const verificationLink = `http://localhost:8000/verify-email?token=${token}`  // The verification link

    console.log(`\n[Email Sent to ${email}]\n`)
    console.log(`Please verify your email by clicking on the following link:`)
    console.log(`${verificationLink}\n`)
}


/**
 * Verifies the given email verification token and returns the user if valid.
 * 
 * @async
 * @param {string} token - The verification token to validate.
 * @returns {Promise<Object>} The user associated with the token if valid.
 * @throws {Error} Throws an error if the token is invalid or expired.
 */
async function verifyEmailToken(token) {
    const user = await persistence.getUserByVerificationToken(token)
    if (!user) {
        throw new Error('Invalid or expired token')
    }
    return user
}

/**
 * Updates the user's email verification status to true.
 * 
 * @async
 * @param {string} username - The username of the user to update.
 * @returns {Promise<void>} Resolves when the email verification status is updated.
 */
async function updateUserEmailVerified(username) {
    await persistence.updateUserEmailVerified(username)
}


/**
 * Initiates a password reset by generating a reset key and sending a reset link to the user's email.
 * 
 * @async
 * @param {string} email - The user's email address.
 * @returns {Promise<boolean>} `true` if the password reset email is successfully sent, otherwise `false`.
 */
async function initiatePasswordReset(email) {
    const user = await persistence.getUserByEmail(email)
    if (!user || !user.emailVerified) {
        return false
    }

    const resetKey = crypto.randomUUID()
    await persistence.setResetKey(user.username, resetKey)

    // Simulate sending an email by logging to the console
    console.log(`Email sent to ${email}`)
    console.log(`Subject: Password Reset`)
    console.log(`Message: Click the following link to reset your password: http://127.0.0.1:8000/reset-password/${resetKey}`)
    return true
}


/**
 * Verifies if the provided reset key is valid.
 * 
 * @async
 * @param {string} resetKey - The reset key to verify.
 * @returns {Promise<boolean>} `true` if the reset key is valid, otherwise `false`.
 */
async function verifyResetKey(resetKey) {
    const user = await persistence.getUserByResetKey(resetKey)
    if (user) {
        return true // Valid reset key    
    }

    return false // Invalid or expired key
}

/**
 * Resets the user's password using the provided reset key and new passwords.
 * 
 * @async
 * @param {string} resetKey - The reset key to verify.
 * @param {string} password - The new password.
 * @param {string} confirmPassword - The password confirmation.
 * @returns {Promise<boolean>} `true` if the password was reset successfully, otherwise `false`.
 */
async function resetPassword(resetKey, password, confirmPassword) {
    const user = await persistence.getUserByResetKey(resetKey)
    const passwordMatch = await validatePassword(password, confirmPassword)

    if (!user || !passwordMatch) {
        return false
    }

    const hashedPassword = hashPassword(password)
    await persistence.updatePassword(user.username, hashedPassword)
    await persistence.setResetKey(user.username, null)

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
