// Persistence Layer

// Indexes:
// UserAccounts: username, email, contacts, learnLang, fluentLang
// SessionData: key, sessionData.username, expiry, (TTL index, expires in 10 minutes)
// ChatHistory: conversationId, user1, user2
// Badges: title

const mongodb = require('mongodb')

let client = undefined
let db = undefined
let users = undefined
let sessions = undefined
let chats = undefined
let badges = undefined

// tehreem : mongodb+srv://tehreemmasroor:12class34@cluster0.1ykuj3l.mongodb.net/
// manahil : mongodb+srv://60302181:12class34@cluster0.yrpo2.mongodb.net/?

/**
 * Connects to the MongoDB database and initializes the collections.
 * 
 * @async
 * @returns {Promise<void>} Resolves once the connection is established.
 */
async function connectDatabase() {
    if (!client) {
        client = new mongodb.MongoClient('mongodb+srv://60302181:12class34@cluster0.yrpo2.mongodb.net/?')
        await client.connect()
        db = client.db('LanguageExchange')
        users = db.collection('UserAccounts')
        sessions = db.collection('SessionData')
        chats = db.collection("ChatHistory")
        badges = db.collection("Badges")
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
    await users.insertOne({ username, passwordHash, email, verificationToken, emailVerified: false, blockedUsers: [] })
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
async function deleteUser(username) {
    await connectDatabase()

    const result = await users.deleteOne({ username })
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
    const { key, expiry, data, csrfToken } = sessionData
    const result = await sessions.insertOne({
        key,
        expiry: expiry,
        sessionData: data,
        csrfToken: csrfToken
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
 * @param {Object} session - The new session data.
 * @returns {Promise<number>} The number of documents modified (should be 1 if successful, 0 if no session matches).
 * @throws {Error} If the session key or session data is invalid.
 */
async function updateSession(sessionKey, session) {
    if (!sessionKey) {
        throw new Error("Session key is required.")
    }
    if (!session) {
        throw new Error("Valid session data is required.")
    }

    const result = await sessions.updateOne(
        { key: sessionKey }, // Match the session by its key
        { $set: { csrfToken: session.csrfToken } } // Update the session data
    )

    if (result.matchedCount === 0) {
        throw new Error("No session found for the provided session key.")
    }

    return result.modifiedCount // Returns 1 if successfully updated, 0 otherwise
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

//Changes made to setResetKey and getUserByResetKey to ensure time-bound reset key.
/**
 * Sets the password reset key and expiration time for a user.
 * 
 * @async
 * @param {string} username - The username of the user.
 * @param {string} resetKey - The password reset key.
 * @param {Date} expiry - The expiration time for the reset key.
 * @returns {Promise<void>} Resolves once the reset key and expiry are set.
 */
async function setResetKey(username, resetkey, expiry) {
    await connectDatabase()
    await users.updateOne({ username: username }, { $set: { resetkey: resetkey, resetKeyExpiry: expiry } })
}


/**
 * Retrieves a user by their password reset key, if the key has not expired.
 * 
 * @async
 * @param {string} resetKey - The password reset key.
 * @returns {Promise<Object|null>} The user document if found and the key is valid, otherwise null.
 */
async function getUserByResetKey(resetKey) {
    await connectDatabase()
    const user = await users.findOne({ resetkey: resetKey })

    if (!user) {
        return null // No matching user
    }

    if (user && user.resetKeyExpiry > new Date()) {
        return user
    }
    return null
}

/**
 * Updates a user's password with a new hashed password and clears the reset key and its expiry.
 * 
 * @async
 * @param {string} username - The username of the user.
 * @param {string} hashedPassword - The new hashed password.
 * @returns {Promise<void>} Resolves once the password is updated.
 */
async function updatePassword(username, hashedPassword) {
    await connectDatabase()
    await users.updateOne({ username: username }, { $set: { passwordHash: hashedPassword, resetkey: null, resetKeyExpiry: null } })
}


/**
 * Saves the user's profile during the initial setup.
 *
 * @param {string} userId - The user's ID.
 * @param {Object} profileData - The profile data to save.
 * @returns {Promise<void>}
 */
async function saveUserProfile(username, profileData) {
    await connectDatabase()

    const update = {
        $set: {
            description: profileData.description,
            fluentLang: profileData.fluentLang,
            learnLang: profileData.learnLang,
            profilePhotoPath: profileData.profilePhotoPath,
        },
    }

    const result = await users.updateOne({ username }, update)

    if (result.matchedCount === 0) {
        throw new Error("User not found.")
    }
}

/**
 * Fetches the user's profile from the database.
 *
 * @param {string} userId - The user's ID.
 * @returns {Promise<Object>} The user's profile.
 */
async function getUserProfile(username) {
    await connectDatabase()

    const user = await users.findOne({ username })
    if (!user) {
        throw new Error("User not found.")
    }

    return {
        description: user.description || null,
        fluentLang: user.fluentLang || [],
        learnLang: user.learnLang || [],
        profilePhotoPath: user.profilePhotoPath || '/static/assets/img/avatars/default.png',
    }
}

async function getBlockedUsers(username) {
    await connectDatabase();

    let user = await users.findOne({ username })
    return user.blockedUsers
}

async function blockUser(username, blockedUsers) {
    await connectDatabase();

    await users.updateOne({ username },
        { $set: { blockedUsers: blockedUsers } })
}


async function getSuggestedContacts(learnLang, username) {
    await connectDatabase();
    return await users.find({
        fluentLang: { $in: learnLang },
        username: { $ne: username },
    }).toArray();
}

async function getCurrentContacts(username) {
    await connectDatabase();
    const user = await users.findOne({ username });
    return await users.find({ username: { $in: user.contacts || [] } }).toArray();
}

async function addContact(username, contactUsername) {
    await connectDatabase();
    await users.updateOne(
        { username },
        { $addToSet: { contacts: contactUsername } } // Prevent duplicates
    );
}

async function removeContact(username, contactUsername) {
    await connectDatabase();
    await users.updateOne(
        { username },
        { $pull: { contacts: contactUsername } } // Pull removes a matching element
    );
}

async function getBlockedUsers(username) {
    await connectDatabase();

    let user = await users.findOne({ username })
    return user.blockedUsers
}

async function blockUser(username, blockedUsers) {
    await connectDatabase();

    await users.updateOne(
        { username },
        { $set: { blockedUsers: blockedUsers } }
    )

}

//Initiation of chat between users
async function createChat(chatData) {
    await connectDatabase();
    await chats.insertOne(chatData);
    return
}
async function getConversationIdByUsernames(user1, user2) {
    await connectDatabase();
    return await chats.findOne({
        $or: [
            { user1: user1, user2: user2 },
            { user1: user2, user2: user1 }
        ]
    })
}

//Get chat 
async function getChat(conversationId) {
    await connectDatabase();
    let chatHistory = await chats.findOne({ conversationId: conversationId });
    return chatHistory;
}

//update the chats
async function updateMessages(conversationId, messageData) {
    await connectDatabase();
    await chats.updateOne({ conversationId },
        { $set: { messageData: messageData } })
    let userDetails = await getUserDetails(messageData.senderId)

}

async function createNewBadge(badgeData) {
    await connectDatabase()
    await badges.insertOne(badgeData)
}

async function findAllUserConversations(username) {
    await connectDatabase()
    let userConversations = await chats.find({ $or: [
        { user1: username }, 
        { user2: username }
    ]}).toArray()

    return userConversations;
}

async function getUserBadges(username) {
    await connectDatabase();
    const user = await users.findOne({ username }, { badges: 1, _id: 0 });
    return user ? user.badges : [];
}

async function getAllBadges() {
    await connectDatabase()
    return await badges.find().toArray()
}

async function assignBadgeToUser(username, badge) {
    await connectDatabase();
    await users.updateOne(
        { username },
        { $push: { badges: badge } },
    )
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
    updatePassword,
    saveUserProfile,
    getUserProfile,
    getBlockedUsers,
    blockUser,
    getCurrentContacts,
    getSuggestedContacts,
    addContact,
    removeContact,
    createChat,
    getConversationIdByUsernames,
    getChat,
    updateMessages,
    createNewBadge,
    getUserBadges,
    getAllBadges,
    assignBadgeToUser,
    findAllUserConversations
}
