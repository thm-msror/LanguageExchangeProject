//Business Layer
const crypto = require('crypto')
const persistence = require("./persistence")
const mongodb = require('mongodb')

const firstBadge = "Handshake!";
const secondBadge = "Century!"
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
        const expiry = new Date(Date.now() + 10 * 60 * 1000) // 10-minute expiry

        await persistence.saveSession({
            key: sessionKey,
            expiry: expiry,
            data: {
                userId: user._id.toString(), // Store the ObjectId as a string
                username: user.username,
            },
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
            verificationToken: verificationToken,
            contacts: [],
            blockedUsers: [],
            badges: []
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
    await persistence.getUserDetails(username);
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
    let resetExpiry = new Date(Date.now() + 2 * 60 * 1000)
    await persistence.setResetKey(user.username, resetKey, resetExpiry)

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
 * @param {string} username - The user's uunique username.
 * @param {Object} profileData - The profile data to save.
 * @returns {Promise<void>}
 */
async function saveUserProfile(username, profileData) {
    if (!username) {
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
    await persistence.saveUserProfile(username, validatedProfileData)
}

/**
 * Fetches the user profile.
 *
 * @param {string} username - The user's unique username.
 * @returns {Promise<Object>} The user's profile.
 */
async function getUserProfile(username) {
    if (!username) {
        throw new Error("User ID is required.")
    }
    return await persistence.getUserProfile(username)
}


/**
 * Retrieves the CSRF token for a given session key.
 *
 * @async
 * @param {string} key - The session key to retrieve the CSRF token for.
 * @returns {Promise<void>} Resolves after the CSRF token is created.
 */
async function generateToken(key) {
    let sd = await persistence.getSession(key)
    if (sd) {
        const token = crypto.randomBytes(32).toString('hex') // Generate CSRF token
        sd.csrfToken = token
        await persistence.updateSession(key, sd)
    } else {
        throw new Error("Invalid Session key")
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
    const token = session.csrfToken;
    return session && token === csrfToken
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

// Fetch suggesnted contacts using persistence
async function getSuggestedContacts(username) {
    const userProfile = await persistence.getUserProfile(username)
    const suggestedContacts = await persistence.getSuggestedContacts(userProfile.learnLang, username)
    let temp = []
    for (contact of suggestedContacts) {
        let blocked = await isBlockedByUser(username, contact);
        if (!blocked) {
            temp.push(contact)
        }
    }
    return temp
}
// Get current contacts
async function getCurrentContacts(username) {
    return await persistence.getCurrentContacts(username)
}

// Add contact using persistence
async function addContact(username, contactUsername) {
    // Decided on the business logic that everytime someone adds a user to their contacts, they 
    // are also added to that user's contact list

    await persistence.addContact(username, contactUsername)
    await persistence.addContact(contactUsername, username)

    if (! await persistence.getConversationIdByUsernames(username, contactUsername)) {
        await createChat(username, contactUsername)
    }

}

// Remove contact using persistence
async function removeContact(username, contactUsername) {
    // Decided on the business logic that everytime someone removes a user from their contacts, they 
    // are also removed from that user's contact list, but can still show up as a suggested contact

    await persistence.removeContact(username, contactUsername)
    await persistence.removeContact(contactUsername, username)

}

async function blockUser(username, blockUsername) {
    // Decided on the business logic that everytime someone blocks a user, they are removed from both
    // their contact list and the blocked user's contact list, and also removed from the suggested contacts
    if (!username) {
        throw new Error("User ID is required.")
    }
    if (!blockUsername) {
        throw new Error("Must specify user to block")
    }

    let blockedUsers = await persistence.getBlockedUsers(username);

    if (blockUsername in blockedUsers) {
        throw new Error("User is already blocked")
    } else {
        blockedUsers.push(blockUsername);
    }

    await persistence.blockUser(username, blockedUsers);

    await removeContact(username, blockUsername)
    await removeContact(blockUsername, username)
}

async function isBlockedByUser(username, contact) {
    let blockedUsers = await persistence.getBlockedUsers(username)
    if (!blockedUsers) {
        return true
    }
    for (let blockedUser of blockedUsers) {
        if (blockedUser === contact.username) {
            return true
        }
    }
    return false

}

// Store a message sent by the current user
async function createChat(currentUser, contactUser) {
    if (!currentUser || !contactUser) {
        throw new Error("User(s) not specified");
    }

    let chatData = {
        conversationId: crypto.randomUUID(),
        user1: currentUser,
        user2: contactUser,
        messageData: []
    }

    return await persistence.createChat(chatData);
}

async function getConversationIdByUsernames(user1, user2) {
    if (!user1 || !user2) {
        throw new Error("User(s) not specified")
    }
    let conversation = await persistence.getConversationIdByUsernames(user1, user2)
    if (!conversation) {
        throw new Error("Conversation not found")
    }

    return conversation.conversationId
}

async function getChatHistory(conversationId) {
    if (!conversationId) {
        throw new Error("No conversation specified")
    }
    let chatHistory = await persistence.getChat(conversationId)
    return chatHistory.messageData;
}

// Store a message sent by the current user
async function updateMessages(conversationId, senderUsername, message) {
    if (!conversationId) {
        throw new Error("No conversation specified")
    }

    if (!senderUsername) {
        throw new Error("No sender specified")
    }

    if (message !== "") {
        let chatHistory = await getChatHistory(conversationId);
        let currentDate = new Date(Date.now());
        let newMessage = {
            time: `${currentDate.getHours()}:${currentDate.getMinutes()}`,
            message: message,
            sender: senderUsername
        }

        chatHistory.push(newMessage)
        await persistence.updateMessages(conversationId, chatHistory)

        await handleBadges(senderUsername)
    }
}

async function handleBadges(username) {
    // Checking for Century badge
    await handleCenturyBadge(username);
    // Checking for Handshake badge
    await handleHandshakeBadge(username);
}

async function handleHandshakeBadge(username) {
    try {
        const badges = await persistence.getUserBadges(username);

        const alreadyEarned = badges.some(badge => badge.title === "Handshake!");
        if (!alreadyEarned) {
            const conversations = await persistence.findAllUserConversations(username);

            // Initialize variables outside the loop
            let hasSent = false;
            let hasReceived = false;

            // Loop through conversations
            for (let conversation of conversations) {
                if (Array.isArray(conversation.messageData)) {
                    // Checking if the user has sent any messages in this conversation
                    const messagesSent = conversation.messageData.filter(
                        message => message.sender === username
                    );
                    if (messagesSent.length > 0) {
                        hasSent = true;
                    }

                    // Checking if the user has received any messages in this conversation
                    const messagesReceived = conversation.messageData.filter(
                        message => message.sender !== username
                    );
                    if (messagesReceived.length > 0) {
                        hasReceived = true;
                    }
                }

                // If both conditions are met, no need to check further
                if (hasSent && hasReceived) break;
            }

            // Only award the badge if both conditions have been met
            if (hasSent && hasReceived) {
                const newBadge = {
                    title: "Handshake!",
                    description: "Sent and received first message",
                    photoPath: "/static/assets/img/badges/badge2.png",
                    dateEarned: new Date().toISOString()
                };

                await persistence.assignBadgeToUser(username, newBadge);
            }
        }
    } catch (error) {
        console.error("Error handling Handshake badge:", error);
        throw error;
    }
}

async function handleCenturyBadge(username) {
    try {
        const badges = await getUserBadges(username);

        const alreadyEarned = badges.some(badge => badge.title === "Century!");
        if (!alreadyEarned) {
            const conversations = await persistence.findAllUserConversations(username);
            let totalMessages = 0;

            conversations.forEach(conversation => {
                if (Array.isArray(conversation.messageData)) {
                    // Counting the number of messages sent by the user in this conversation
                    totalMessages += conversation.messageData.filter(
                        message => message.sender === username
                    ).length;
                }
            });

            if (totalMessages >= 100) {
                const newBadge = {
                    title: "Century!",
                    description: "Sent 100 messages in total.",
                    photoPath: "/static/assets/img/badges/badge1.png",
                    dateEarned: new Date().toISOString()
                };

                await persistence.assignBadgeToUser(username, newBadge);
            }
        }
    } catch (error) {
        console.error("Error handling Century badge:", error);
        throw error;
    }
}


async function getUserBadges(username) {
    if (!username) {
        throw new Error("Username not specified");
    }

    return await persistence.getUserBadges(username)
}

async function createNewBadge(badgeData) {
    if (badgeData) {
        return await persistence.createNewBadge(badgeData)
    }

    throw new Error("Badge data not specified");
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
    generateToken,
    validateToken,
    cancelToken,
    blockUser,
    isBlockedByUser,
    getSuggestedContacts,
    getCurrentContacts,
    addContact,
    removeContact,
    createChat,
    getConversationIdByUsernames,
    getChatHistory,
    updateMessages,
    createNewBadge,
    handleHandshakeBadge,
    handleCenturyBadge,
    getUserBadges
}
