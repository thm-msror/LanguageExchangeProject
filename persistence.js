// persistence layer
// Indexes created on the username, email and resetKey fields for optimized querying

const mongodb = require('mongodb')

let client = undefined
let db = undefined
let users = undefined
let sessions = undefined


/**
 * Connects to the MongoDB database and initializes the collections.
 * 
 * @async
 * @returns {Promise<void>} Resolves once the connection is established.
 */
async function connectDatabase() {
    if (!client) {
        client = new mongodb.MongoClient('mongodb+srv://60302181:12class34@cluster0.yrpo2.mongodb.net/')
        await client.connect()
        db = client.db('LanguageExchange')
        users = db.collection('UserAccounts')
        sessions = db.collection('SessionData')
    }
}


/**
 * Creates a new user and inserts it into the database with a verification token.
 * 
 * @async
 * @param {Object} userData - The user data to be inserted.
 * @returns {Promise<Object>} The created user document.
 */
async function createUser(userData) {
    await connectDatabase()

    const { username, passwordHash, email, verificationToken } = userData

    // Insert user into the database with the verification token
    await users.insertOne({ username, passwordHash, email, verificationToken, emailVerified: false })
    return await users.findOne({ username })
}


/**
 * Retrieves user details by username.
 * 
 * @async
 * @param {string} username - The username of the user.
 * @returns {Promise<Object|null>} The user document, or null if not found.
 */
async function getUserDetails(username) {
    await connectDatabase()

    const result = await users.findOne({ username })
    return result
}


/**
 * Deletes a user by their user ID.
 * 
 * @async
 * @param {string} userId - The ID of the user to delete.
 * @returns {Promise<number>} The number of deleted documents.
 */
async function deleteUser(userId) {
    await connectDatabase()

    const result = await users.deleteOne({ _id: new mongodb.ObjectId.createFromHexString(userId) })
    return result.deletedCount // Return number of deleted documents
}


/**
 * Retrieves a user by their email verification token.
 * 
 * @async
 * @param {string} token - The verification token to search for.
 * @returns {Promise<Object|null>} The user document if found, otherwise null.
 */
async function getUserByVerificationToken(token) {
    await connectDatabase()

    return await users.findOne({ verificationToken: token })
}


/**
 * Updates the user's email verification status and clears the verification token.
 * 
 * @async
 * @param {string} username - The username of the user to update.
 * @returns {Promise<void>} Resolves once the user's email verification is updated.
 */
async function updateUserEmailVerified(username) {
    await connectDatabase()
    await users.updateOne({ username }, { $set: { emailVerified: true, verificationToken: null } })
}


// Session Functions

/**
 * Saves a new session to the database.
 * 
 * @async
 * @param {Object} sessionData - The session data to be saved.
 * @returns {Promise<ObjectId>} The ID of the newly created session.
 */
async function saveSession(sessionData) {
    await connectDatabase()

    const key = sessionData.key
    const expiry = sessionData.expiry
    const data = sessionData.data
    const result = await sessions.insertOne({
        key: key,
        expiry: expiry,
        sessionData: data
    })
    return result.insertedId // Return the ID of the newly created session
}


/**
 * Retrieves session data by session key.
 * 
 * @async
 * @param {string} key - The session key to search for.
 * @returns {Promise<Object|null>} The session document, or null if not found.
 */
async function getSession(key) {
    await connectDatabase()

    const result = await sessions.findOne({ key })
    return result
}


/**
 * Deletes a session by its session key.
 * 
 * @async
 * @param {string} key - The session key to delete.
 * @returns {Promise<number>} The number of deleted documents.
 */
async function deleteSession(key) {
    await connectDatabase()

    const result = await sessions.deleteOne({ key })
    return result.deletedCount // Return number of deleted documents
}


/**
 * Updates a session's data by its session key.
 * 
 * @async
 * @param {string} sessionKey - The session key to update.
 * @param {Object} sessionData - The new session data.
 * @returns {Promise<void>} Resolves once the session is updated.
 */
async function updateSession(sessionKey, sessionData) {
    if (!sessionData) {
        return
    }
    const result = await sessions.updateOne(
        { key: sessionKey },
        { $set: { sessionData: sessionData } }
    )
}


/**
 * Retrieves a user by their email address.
 * 
 * @async
 * @param {string} email - The email address of the user.
 * @returns {Promise<Object|null>} The user document if found, otherwise null.
 */
async function getUserByEmail(email) {
    await connectDatabase()
    return await users.findOne({ email: email })
}


/**
 * Sets the password reset key for a user.
 * 
 * @async
 * @param {string} username - The username of the user.
 * @param {string} resetKey - The password reset key.
 * @returns {Promise<void>} Resolves once the reset key is set.
 */
async function setResetKey(username, resetKey) {
    await connectDatabase()
    await users.updateOne({ username: username }, { $set: { resetkey: resetKey } })
}


/**
 * Retrieves a user by their password reset key.
 * 
 * @async
 * @param {string} resetKey - The password reset key.
 * @returns {Promise<Object|null>} The user document if found, otherwise null.
 */
async function getUserByResetKey(resetKey) {
    await connectDatabase()
    return await users.findOne({ resetkey: resetKey })
}


/**
 * Updates a user's password with a new hashed password.
 * 
 * @async
 * @param {string} username - The username of the user.
 * @param {string} hashedPassword - The new hashed password.
 * @returns {Promise<void>} Resolves once the password is updated.
 */
async function updatePassword(username, hashedPassword) {
    await connectDatabase()
    await users.updateOne({ username: username }, { $set: { passwordHash: hashedPassword, resetkey: null } })
}


// Exported Functions
module.exports = {
    createUser,
    getUserDetails,
    deleteUser,
    getUserByVerificationToken,
    updateUserEmailVerified,
    saveSession,
    getSession,
    deleteSession,
    updateSession,
    getUserByEmail,
    setResetKey,
    getUserByResetKey,
    updatePassword
}
