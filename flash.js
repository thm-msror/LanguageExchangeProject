// flash.js
const flashMessages = {}

// Set a flash message
async function setFlash(key, message) {
    flashMessages[key] = message
}

// Get a flash message
async function getFlash(key) {
    const message = flashMessages[key]
    delete flashMessages[key]  // Clear the message after it's been retrieved
    return message
}

module.exports = { setFlash, getFlash }
