// flash module uses persistence layer functions
const persistence = require('./persistence.js')

// Function to set a flash message for a session
async function setFlash(sessionKey, message) {
    const sessionData = await persistence.getSessionData(sessionKey)
    if (!sessionData) return
    
    sessionData.flash = message
    await persistence.updateSessionData(sessionKey, sessionData) 
}

// Function to get and clear a flash message from a session
async function getFlash(sessionKey) {
    const sessionData = await persistence.getSessionData(sessionKey)
    if (!sessionData) return undefined

    const message = sessionData.flash
    delete sessionData.flash
    await persistence.updateSessionData(sessionKey, sessionData) 
    
    return message
}

module.exports = {
    setFlash,
    getFlash
}
