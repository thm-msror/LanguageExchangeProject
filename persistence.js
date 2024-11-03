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
    const result = await users.insertOne(userData)
    return result.insertedId // Return the ID of the newly created user
}

async function getUserDetails(username) {
    await connectDatabase()
    const result = await users.findOne({ username }) //TypeError: Cannot read properties of undefined (reading 'findOne')
    return result
}

async function deleteUser(userId) {
    await connectDatabase()
    const result = await users.deleteOne({ _id: new mongodb.ObjectId(userId) })
    return result.deletedCount // Return number of deleted documents
}

// Session Functions
async function saveSession(sessionData) {
    await connectDatabase()
    const result = await sessions.insertOne(sessionData)
    return result.insertedId // Return the ID of the newly created session
}

async function getSessionData(key) {
    await connectDatabase()
    const result = await sessions.findOne({ sessionToken: key })
    return result
}

async function deleteSession(key) {
    await connectDatabase()
    const result = await sessions.deleteOne({ sessionToken: key })
    return result.deletedCount // Return number of deleted documents
}

async function updateSessionData(sessionKey, sessionData) {
    await connectDatabase()
    const result = await sessions.updateOne({ sessionToken: sessionKey }, { $set: sessionData })
    return result.modifiedCount // Return number of modified documents
}

// Exported Functions
module.exports = {
    createUser,
    getUserDetails,
    deleteUser,
    saveSession,
    getSessionData,
    deleteSession,
    updateSessionData
}
