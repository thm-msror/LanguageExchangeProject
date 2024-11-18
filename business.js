//business layer
const crypto = require('crypto')
const persistence = require("./persistence")
const mongodb = require('mongodb')


/**
 * Hashes a password with a salt.
 * 
 * Generates a new salt if none is provided and returns the salt and hashed password in "salt:hash" format.
 * 
 * @param {string} password - The password to hash.
 * @param {string|null} [salt=null] - The optional salt generates a new one if null.
 * @returns {string} A string in "salt:hash" format.
 */
function hashPassword(password, salt = null) {
    // Generate a new salt if one isn't provided (for new password registration)
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

        if (!user.emailVerified) {
            throw new Error('Email not verified')
        }

        // Extract the salt and hash from the stored password hash
        const [storedSalt, storedHash] = user.passwordHash.split(':')
        // Hash the entered password with the stored salt
        const hashedPassword = hashPassword(password, storedSalt).split(':')[1]
        if (hashedPassword !== storedHash) {
            throw new Error('Invalid password')
        }

        // Create or start a new session
        const sessionKey = generateSessionKey()
        const csrfToken = crypto.randomBytes(32).toString('hex') // Generate CSRF token
        const expiry = new Date(Date.now() + 10 * 60 * 1000) // 10-minute expiry

        await persistence.saveSession({
            key: sessionKey,
            expiry,
            data: {
                userId: user._id.toString(), // Store the ObjectId as a string
                username: user.username,
            },
            csrfToken: csrfToken,
        })

        return { sessionKey, user}
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
    const session = await persistence.getSession(sessionKey)
    if (session && session.sessionData && session.sessionData.userId) {
        session.sessionData.userId = new mongodb.ObjectId(session.sessionData.userId) // Convert back to ObjectId
    }
    return session
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

    return false // Invalid or expired reset key
}


/**
 * Resets the user's password using the provided reset key and new passwords.
 * Ensures the new password is not the same as the current password.
 * 
 * @async
 * @param {string} resetKey - The reset key to verify.
 * @param {string} password - The new password.
 * @param {string} confirmPassword - The password confirmation.
 * @returns {Promise<boolean>} `true` if the password was reset successfully, otherwise `false`.
 */
async function resetPassword(resetKey, password) {
    const user = await persistence.getUserByResetKey(resetKey)

    if (!user) {
        console.log("Reset key is invalid or expired:", resetKey)
        return false // Invalid reset key
    }

    // Retrieve the stored password and salt from the database
    const [storedSalt, storedHashedPassword] = user.passwordHash.split(":")

    // Hash the new password using the stored salt
    const hashedPassword = hashPassword(password, storedSalt).split(":")[1] // Only get the hashed part

    // Check if the new hashed password is the same as the stored hashed password
    if (hashedPassword === storedHashedPassword) {
        return false // Prevent using the same password
    }

    // Update the password in the database with the new hash
    const newHash = hashPassword(password) // This will generate a new salt and hash
    await persistence.updatePassword(user.username, newHash)

    // Clear the reset key only after a successful password update
    await persistence.setResetKey(user.username, null)

    return true // Password reset successful
}

/**
 * Saves the user's profile during the initial setup.
 *
 * @param {string} userId - The user's ID.
 * @param {Object} profileData - The profile data to save.
 * @returns {Promise<void>}
 */
async function saveUserProfile(userId, profileData) {
    if (!userId) {
        throw new Error("User ID is required.")
    }

    // Ensure valid data
    const validatedProfileData = {
        description: profileData.description || null,
        fluentLang: Array.isArray(profileData.fluentLang) ? profileData.fluentLang : [],
        learnLang: Array.isArray(profileData.learnLang) ? profileData.learnLang : [],
        profilePhotoPath: profileData.profilePhotoPath || '/static/assets/img/avatars/default.png',
    }

    // Pass the validated data to the persistence layer
    await persistence.saveUserProfile(userId, validatedProfileData)
}


/**
 * Fetches the user profile.
 *
 * @param {string} userId - The user's ID.
 * @returns {Promise<Object>} The user's profile.
 */
async function getUserProfile(userId) {
    if (!userId) {
        throw new Error("User ID is required.")
    }
    return await persistence.getUserProfile(userId)
}


/**
 * Regenerate the CSRF token after every successful request
 *
 * @param {string} sessionKey - The session key.
 * @returns {Promise<string>} The generated token.
 */
async function renewToken(sessionKey) {
    // Generate a secure random token (32 bytes = 64 hex characters)
    const newToken = crypto.randomBytes(32).toString('hex')
    await persistence.updateSession(sessionKey, { csrfToken: newToken })
    return newToken
}

/**
 * Retrieves the CSRF token for a given session key.
 *
 * @async
 * @param {string} key - The session key to retrieve the CSRF token for.
 * @returns {Promise<string>} The CSRF token stored in the session.
 */
async function getToken(key) {
    let sd = await persistence.getSession(key)
    if (sd) {
        sd.csrfToken = token
    } else {
        console.error("sd is null or undefined")
    }    
}

/**
 * Validates a CSRF token.
 *
 * @param {string} sessionKey - The session key.
 * @param {string} csrfToken - The CSRF token.
 * @returns {Promise<boolean>} True if the token is valid, false otherwise.
 */
async function validateToken(sessionKey, csrfToken) {
    const session = await persistence.getSession(sessionKey)
    return session && session.csrfToken === csrfToken
}

/**
 * Cancels the CSRF token for a given session by removing it.
 *
 * @async
 * @param {string} key - The session key to cancel the CSRF token for.
 * @returns {Promise<void>} Resolves after the CSRF token is removed.
 */
async function cancelToken(key) {
    let sd = await persistence.getSession(key)
    if (sd) {
        delete sd.csrfToken // Remove the CSRF token
        await persistence.updateSession(key, sd)
    }
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
    logoutUser,
    getUserProfile,
    saveUserProfile,
    renewToken,
    getToken,
    validateToken,
    cancelToken
}
