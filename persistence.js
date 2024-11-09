// persistence layer
const mongodb = require('mongodb')

let client = undefined
let db = undefined
let users = undefined
let sessions = undefined

// Connect to the database
async function connectDatabase() {
    if (!client) {
        client = new mongodb.MongoClient('mongodb+srv://tehreemmasroor:12class34@cluster0.1ykuj3l.mongodb.net/')
        await client.connect()
        db = client.db('LanguageExchange')
        users = db.collection('UserAccounts')
        sessions = db.collection('SessionData')
    }
}

// User Functions
async function createUser(userData) {
    await connectDatabase()
    const { username, passwordHash, email, verificationToken } = userData
    console.log('User data:', userData)
    // Insert user into the database with the verification token
    await users.insertOne({ username, passwordHash, email, verificationToken, emailVerified: false })
    return await users.findOne({ username })
}

async function getUserDetails(username) {
    await connectDatabase()
    const result = await users.findOne({username})
    return result
}

async function deleteUser(userId) {
    await connectDatabase()
    const result = await users.deleteOne({ _id: new mongodb.ObjectId.createFromHexString(userId) })
    return result.deletedCount // Return number of deleted documents
}

async function getUserByVerificationToken(token) {
    await connectDatabase()
    return await users.findOne({ verificationToken: token })
}

async function updateUserEmailVerified(username) {
    await connectDatabase()
    await users.updateOne({ username }, { $set: { emailVerified: true } })
}

// Session Functions
async function saveSession(sessionData) {
    await connectDatabase()
    const key = sessionData.key
    const expiry = sessionData.expiry
    const data = sessionData.data
    const result = await sessions.insertOne(
        { key: key, 
        expiry: expiry, 
        sessionData: data})
    return result.insertedId // Return the ID of the newly created session
}

async function getSession(key) {
    await connectDatabase()
    const result = await sessions.findOne({key})
    return result
}

async function deleteSession(key) {
    await connectDatabase()
    const result = await sessions.deleteOne({key})
    return result.deletedCount // Return number of deleted documents
}

async function updateSession(sessionKey, sessionData) {
    if (!sessionData) {
        console.log('Invalid session data: ', sessionData) // Log invalid data
        return
    }
    const result = await sessions.updateOne(
        { key: sessionKey },
        { $set: { sessionData: sessionData } }
    )
    console.log('Session updated:', result)
}

async function getUserByEmail(email) {
    await connectDatabase()
    return users.findOne({ email: email })
}

async function setResetKey(username, resetKey) {
    await connectDatabase()
    return users.updateOne({ user: username }, { $set: { resetkey: resetKey } })
}

async function getUserByResetKey(resetKey) {
    await connectDatabase()
    return users.findOne({ resetkey: resetKey })
}

async function updatePassword(username, hashedPassword) {
    await connectDatabase()
    console.log('Updating password for user:', username)
    console.log('New password   :', hashedPassword)
    return users.updateOne({ user: username }, { $set: { passwordHash: hashedPassword, resetkey: null } }) //Error: suppose to reset the password by setting the new password provided as the hashedPassword but is not working 
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
