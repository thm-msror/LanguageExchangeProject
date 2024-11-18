const persistence = require('./persistence')

async function setFlash(session, message) {
    console.log(`Trying to set the flash message ${session} ${message}` )

    let sd = await persistence.getSession(session)
    sd.flash = message
    await persistence.updateSession(sd)
}

async function getFlash(session) {
    console.log("getting flash message")
    let sd = await persistence.getSession(session)
    console.log(sd)
    if (!sd) {
        return undefined
    }
    let result = sd.flash
    delete sd.flash
    await persistence.updateSession(sd)
    return result
}

module.exports = {
    setFlash, getFlash
}