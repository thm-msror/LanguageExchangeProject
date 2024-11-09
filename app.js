//presentation layer
const express = require('express')
const business = require('./business.js')
const flash = require('./flash.js')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const handlebars = require('express-handlebars')

let app = express()

// Set up Handlebars
app.set('views', __dirname + "/templates")
app.set('view engine', 'handlebars')
app.engine('handlebars', handlebars.engine())

// Middleware for parsing form data
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser())
app.use('/static', express.static(__dirname + "/static"))

async function isSessionExpired(sessionKey) {
    if (!sessionKey) {
        return true // No session key means it's expired or doesn't exist.
    }
    
    const session = await business.getSession(sessionKey)
    if (session && new Date(session.expiry) > new Date() && session.sessionData && session.sessionData.username) {
        return false //Session is active
    }
    return true //Session is expired or invalid
}

// Session expiration check middleware
async function sessionExpirationMiddleware(req, res, next) {
    const sessionKey = req.cookies.sessionKey
    if (!sessionKey || await isSessionExpired(sessionKey)) {
        res.clearCookie('sessionKey') // Clear expired session cookie
        return res.redirect('/login') // Redirect to login page if session is expired
    }
    next()
}

// Main landing page
app.get('/', async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    if (sessionKey) {
        const session = await business.getSession(sessionKey)
        if (session) {
            // Redirect to personalized user page if logged in
            return res.redirect('/user')
        }
    }
    res.render('login') // For now just redirecting to the login page if no active session.
})

// User page route (personalized view)
app.get('/user', sessionExpirationMiddleware, async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    const session = await business.getSession(sessionKey)
    console.log('Session data:', session)
    if (session && session.sessionData && session.sessionData.username) {
        return res.render('user', { username: session.sessionData.username })
    }
    res.redirect('/login')
})

// Dashboard route
app.get('/index', sessionExpirationMiddleware, (req, res) => {
    res.render('index')
})

// Render registration page
app.get('/register', async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    let flashMessage = null
    if (sessionKey) {
        flashMessage = await flash.getFlash(sessionKey) // Get flash message for the session
    }
    res.render('register', { error: flashMessage }) // Pass the message to the template
})

app.post('/register', async (req, res) => {
    const username = req.body.username
    const password = req.body.password
    const email = req.body.email

    try {
        await business.registerUser({ username, email, password })
        console.log('Registration successful')
        res.redirect('/login')  // Redirect to login page after successful registration
    } catch (error) {
        console.error('Registration failed:', error.message || error) // Log the error message
        // Pass an error message to the template if registration fails
        res.render('register', { error: 'Registration failed. Please try again.' })
    }
})


// Login route
app.get('/login', async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    let flashMessage = null
    
    // Check if there's an active session
    if (sessionKey && !(await isSessionExpired(sessionKey))) {
        console.log('Session is active')
        return res.redirect('/user')
    }

    // If there's a session key, retrieve the flash message
    if(sessionKey) {
        flashMessage = await flash.getFlash(sessionKey)
    }

    // Render the login page with the flash message
    res.render('login', { success: flashMessage })
})


// Handle user login
app.post('/login', async (req, res) => {
    const username = req.body.username
    const password = req.body.password

    try {
        const { sessionKey } = await business.loginUser(username, password)
        res.cookie('sessionKey', sessionKey, { httpOnly: true })
        res.redirect('/user')
    } catch (error) {
        console.log(error)
        // If sessionKey is undefined or invalid, set a general flash message for authentication failure
        await flash.setFlash('loginError', 'Could not authenticate the user.')
        res.render('login', { message: 'Could not authenticate the user.' })
    }
})

//Handle user logout
app.get('/logout', async (req, res) => {
    const sessionKey = req.cookies.sessionKey // Get the sessionKey from the cookie

    if (sessionKey) {
        // Call the business layer to delete the session from the database
        await business.logoutUser(sessionKey)
        // Clear the session cookie from the client
        res.clearCookie('sessionKey')
    }

    console.log('User logged out')

    // Redirect to the login page, which will show the flash message
    res.redirect('/login')
})

app.get('/verify-email', async (req, res) => {
    const token = req.query.token

    if (!token) {
        return res.status(400).send('Verification token is missing.')
    }

    try {
        // Check if the token is valid
        const user = await business.verifyEmailToken(token)
        if (user) {
            // Mark the user's email as verified
            await business.updateUserEmailVerified(user.username)
            return res.send('Email verified successfully.')
        } else {
            return res.status(400).send('Invalid verification token.')
        }
    } catch (error) {
        console.log(error)
        return res.status(500).send('Internal server error.')
    }
})

// Forgot Password page
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password')
})

// Handle Forgot Password form submission
app.post('/forgot-password', async (req, res) => {
    const email = req.body.email

    // Initiate password reset and log reset link
    await business.initiatePasswordReset(email)

    // Notify the user to check their email for a reset link
    res.send("If the email exists, a reset link has been sent.")
})

// Reset Password page (accessed via reset link)
app.get('/reset-password/:resetKey', async (req, res) => {
    const resetKey = req.params.resetKey
    const valid = await business.verifyResetKey(resetKey)

    if (!valid) {
        return res.send("Invalid or expired reset link.")
    }

    // Proceed with rendering the reset page
    res.render('reset-password', { resetKey })
})


// Handle Reset Password form submission
app.post('/reset-password', async (req, res) => {
    const { resetKey, password, confirmPassword } = req.body

    console.log("Password entered:", password)
    console.log("Confirm Password entered:", confirmPassword)

    if (!password || !confirmPassword) {
        return res.send("Both password fields are required.")
    }

    if (password.trim() !== confirmPassword.trim()) {
        console.log("Passwords do not match.")
        return res.send("Passwords do not match.")
    }

    // Debugging: Log the resetKey and password before calling resetPassword
    console.log("Reset key received:", resetKey)

    const success = await business.resetPassword(resetKey, password)
    
    // Debugging: Check if success is false and log the reason
    if (success) {
        res.redirect('/?message=Password changed. Please log in.')
    } else {
        console.log("Password reset failed. Invalid or expired reset link.")
        res.send("Invalid or expired reset link.")
    }
})

// Start server
app.listen(8000, () => {
    console.log("App running on port 8000")
})
