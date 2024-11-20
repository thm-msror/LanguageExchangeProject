//presentation layer
const express = require('express')
const business = require('./business.js')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const handlebars = require('express-handlebars')
const flash = require('./flash.js')
const fileUpload = require('express-fileupload')

let app = express()

// Set up Handlebars
app.set('views', __dirname + "/templates")
app.set('view engine', 'handlebars')
app.engine('handlebars', handlebars.engine())

// Middleware for parsing form data
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser())
app.use('/static', express.static(__dirname + "/static"))

/**
 * Checks if a session is expired based on the session key.
 * 
 * @param {string} sessionKey - The session key to validate.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the session is expired or invalid, `false` if active.
 */
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


/**
 * Middleware to check for session expiration and redirect to login if expired.
 *
 * @async
 * @param {Object} req - The request object containing session cookies.
 * @param {Object} res - The response object to send redirection if needed.
 * @param {Function} next - The next middleware function to execute.
 * @returns {Promise<void>} Redirects to login if session is expired or proceeds to next middleware if valid.
 */
async function sessionExpirationMiddleware(req, res, next) {
    const sessionKey = req.cookies.sessionKey
    if (!sessionKey || await isSessionExpired(sessionKey)) {
        res.clearCookie('sessionKey') // Clear expired session cookie
        return res.render('login', {error: "Your session expired."}) // Redirect to login page if session is expired
    }
    next()
}


/**
 * Route handler for the root URL, checks session key and redirects to user page if logged in.
 *
 * @async
 * @param {Object} req - The request object containing cookies and query parameters.
 * @param {Object} res - The response object to render login page or redirect.
 * @returns {Promise<void>} Renders the login page with optional message or redirects to user page if session is valid.
 */
app.get('/', async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    let message = req.query.message
    if (sessionKey) {
        const session = await business.getSession(sessionKey)
        if (session) {
            // Redirect to personalized user page if logged in
            return res.redirect('/user')
        }
    }
    res.render('login', { message: message })
})

app.get('/404', async (req, res) => {
    res.render('404')
})

app.get('/500', async (req, res) => {
    res.render('500')
})

// Route to display user profile
app.get('/user', sessionExpirationMiddleware, async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey
        const session = await business.getSession(sessionKey)

        // sessionExpirationMiddleware checks if the session is valid and redirects to login if not

        const userId = session.sessionData.userId
        const username = session.sessionData.username

        // Fetch user profile
        const profile = await business.getUserProfile(userId)

        // Pass user details and CSRF token to the template
        res.render('user', {
            username,
            csrfToken: session.csrfToken, // Use the CSRF token from session
            description: profile.description,
            fluentLang: profile.fluentLang,
            learnLang: profile.learnLang,
            profilePhotoPath: profile.profilePhotoPath || '/static/assets/img/avatars/default.png',
        })
    } catch (error) {
        console.error('Error loading user profile:', error)
        res.status(500).render('500', { error: 'Failed to load profile. Please try again later.' })
    }
})

app.post('/user', sessionExpirationMiddleware, fileUpload(), async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey
        const session = await business.getSession(sessionKey)

        // sessionExpirationMiddleware checks if the session is valid and redirects to login if not

        const userId = session.sessionData.userId
        const csrfToken = req.body.csrfToken

        // Validate CSRF token
        const isValidToken = await business.validateToken(sessionKey, csrfToken)
        if (!isValidToken) {
            return res.status(403).render('404', { error: 'Invalid CSRF token.' })
        }

        // Normalize form data
        const description = req.body.description || null

        let fluentLang = []
        if (Array.isArray(req.body['fluentLang[]'])) {
            fluentLang = req.body['fluentLang[]']
        } else if (req.body['fluentLang[]']) {
            fluentLang = [req.body['fluentLang[]']]
        }

        let learnLang = []
        if (Array.isArray(req.body['learnLang[]'])) {
            learnLang = req.body['learnLang[]']
        } else if (req.body['learnLang[]']) {
            learnLang = [req.body['learnLang[]']]
        }

        let profilePhotoPath = null
        if (req.files?.profilePhoto) {
            const photo = req.files.profilePhoto
            const uploadPath = __dirname + '/static/assets/img/avatars/' + Date.now() + '-' + photo.name
            profilePhotoPath = '/static/assets/img/avatars/' + Date.now() + '-' + photo.name

            await photo.mv(uploadPath) // Move the uploaded file
        }

        // Save profile through the business layer
        await business.saveUserProfile(userId, {
            description,
            fluentLang,
            learnLang,
            profilePhotoPath,
        })

        // Redirect to GET /user to display the updated profile
        res.redirect('/user')

        await business.cancelToken(sessionKey) // Cancel the CSRF token after use

    } catch (error) {
        console.error("Error updating profile:", error)
        res.status(500).render('500', { error: 'Failed to update profile. Please try again later.' })
    }
})


/**
 * Route handler for rendering the registration page.
 *
 * @async
 * @param {Object} req - The request object.
 * @param {Object} res - The response object to render the registration page.
 * @returns {Promise<void>} Renders the registration page.
 */
app.get('/register', async (req, res) => {
    res.render('register')
})


/**
 * Handles user registration by collecting form data and creating a new user.
 *
 * @async
 * @param {Object} req - The request object containing user registration details (username, password, repeatPassword, email).
 * @param {Object} res - The response object to redirect or render the registration view with error.
 * @returns {Promise<void>} Redirects to login page after successful registration otherwise, renders registration page with an error message.
 */
app.post('/register', async (req, res) => {
    const username = req.body.username
    const password = req.body.password
    const repeatPassword = req.body.repeatPassword
    const email = req.body.email

    try {
        await business.registerUser(username, email, password, repeatPassword)
        res.render('login', { success: "Registration sucessful, A verification email has been sent to your email address. Please verify your email!" })  // Redirect to login page after successful registration
    } catch (error) {
        // Pass an error message to the template if registration fails
        res.render('register', { error: error.message })
    }
})


/**
 * Renders the login page or redirects to the user page if the session is active.
 *
 * @async
 * @param {Object} req - The request object, which may contain an active session key in cookies.
 * @param {Object} res - The response object to render the login view or redirect to the user page.
 * @returns {Promise<void>} Redirects to the user page if the session is active otherwise, renders the login page with optional error message.
 */
app.get('/login', async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey

        // Check if there's an active session, checked specifically for the login page to redirect to user page if logged in
        if (sessionKey && !(await isSessionExpired(sessionKey))) {
            return res.redirect('/user')
        }
        // Render the login page
        res.render('login')

    } catch (error) {
        console.error('Login failed:', error.message || error) // Log the error message
        // Pass an error message to the template if login fails
        res.render('login', { error: 'Login failed. Please try again.' })
    }
})


/**
 * Authenticates user login, sets session cookie, and redirects to user page upon success.
 *
 * @async
 * @param {Object} req - The request object containing the username and password in the body.
 * @param {Object} res - The response object to set the session cookie and render views.
 * @returns {Promise<void>} Sets a session cookie and redirects to user page if login is successful otherwise, renders login with an error message.
 */
app.post('/login', async (req, res) => {
    const username = req.body.username
    const password = req.body.password

    try {
        const { sessionKey } = await business.loginUser(username, password)
        res.cookie('sessionKey', sessionKey, { httpOnly: true })
        res.redirect('/user')
    } catch (error) {
        res.render('login', { error: error.message })
    }
})

/**
 * Logs out the user by deleting the session, clearing the session cookie, and redirecting to the login page.
 *
 * @async
 * @param {Object} req - The request object with sessionKey from cookies.
 * @param {Object} res - The response object to clear the session cookie and redirect.
 * @returns {Promise<void>} Redirects to the login page with a message after logging out the user.
 */
app.get('/logout', async (req, res) => {
    const sessionKey = req.cookies.sessionKey // Get the sessionKey from the cookie

    if (sessionKey) {
        // Call the business layer to delete the session from the database
        await business.logoutUser(sessionKey)

        // Clear the session cookie from the client
        res.clearCookie('sessionKey')
    }

    // Redirect to the login page
    res.render('login', { success: "You have been logged out." })
})


/**
 * Verifies a user's email based on a verification token, marking the email as verified if valid.
 *
 * @async
 * @param {Object} req - The request object containing the verification token in the query.
 * @param {Object} res - The response object to send verification status messages.
 * @returns {Promise<void>} Sends a status message based on verification success, failure, or errors.
 */
app.get('/verify-email', async (req, res) => {
    const token = req.query.token

    if (!token) {
        return res.render('404', { error: "Invalid verification token!" })
    }

    try {
        // Check if the token is valid
        const user = await business.verifyEmailToken(token)
        if (user) {
            // Mark the user's email as verified
            await business.updateUserEmailVerified(user.username)
            return res.send('<h2>Email verified successfully. You can close this page now.</h2>')
        } else {
            return res.render('404', { error: "Invalid verification token! You can try again!" })
        }
    } catch (error) {
        return res.render('500', { error: "Internal Server error! Please try again!" })
    }
})

/**
 * Renders the "Forgot Password" page for users to initiate password reset.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object to render the forgot-password page.
 */
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password')
})

/**
 * Handles password reset requests.
 * Initiates a password reset process by verifying the provided email address. If the email exists and is verified,
 * a reset link will be sent to the user's email. If not, an error message is returned.
 * 
 * @async
 * @param {Object} req - The request object containing the user's email in `req.body.email`.
 * @param {Object} res - The response object used to send the status message back to the user.
 * @returns {void} Sends a message to the user based on the result of the password reset initiation.
 */
app.post('/forgot-password', async (req, res) => {
    const email = req.body.email

    // Initiate password reset and log reset link
    verified = await business.initiatePasswordReset(email)

    if (!verified) {
        return res.render('forgot-password', {
            error: "This email address does not exist or has not been verified."
        })
    }

    // Notify the user to check their email for a reset link
    return res.render('forgot-password', { success: "A reset link will be sent shortly...Close this window!" })
})

/**
 * Verifies the password reset key and renders the reset page.
 * Renders the reset password page if reset key is valid, otherwise, returns an error message.
 * 
 * @async
 * @param {Object} req - The request object containing the reset key in `req.params.resetKey`.
 * @param {Object} res - The response object used to render the reset page or send an error message.
 * @returns {void} Renders the reset password page or sends an error message.
 */
app.get('/reset-password/:resetKey', async (req, res) => {
    const resetKey = req.params.resetKey
    const valid = await business.verifyResetKey(resetKey)

    if (!valid) {
        return res.render('forgot-password', {
            error: "Invalid or expired reset link. Please try again."
        })
    }

    // Proceed with rendering the reset page
    res.render('reset-password', { resetKey })
})


/**
 * Resets the user's password using the provided reset key and new passwords.
 * 
 * Verifies the reset key and new password confirmation. If successful, the user is redirected to the login page. 
 * Otherwise, an error message is sent if the reset link is invalid or expired.
 * 
 * @async
 * @param {Object} req - The request object containing the reset key, new password, and password confirmation in `req.body`.
 * @param {Object} res - The response object used to redirect the user or send an error message.
 * @returns {void} Redirects on success or sends an error message.
 */
app.post('/reset-password', async (req, res) => {
    const resetKey = req.body.resetKey
    const password = req.body.password
    const confirmPassword = req.body.confirmPassword
    // Check if the passwords match
    if (password !== confirmPassword) {
        return res.render('reset-password', {
            resetKey,
            error: "Passwords do not match. Please try again."
        })
    }

    const valid = await business.verifyResetKey(resetKey)
    if (!valid) {
        return res.render('forgot-password', {
            error: "Invalid or expired reset link. Please try again."
        })
    }

    // Call the business logic to reset the password
    let success = await business.resetPassword(resetKey, password)
    if (success) {
        // Redirect to login page after successful password reset
        return res.render('login', { success: "Password reset successfully. Please login." })
    }
    else {
        // Password reset failed since the user entered the same password as the old one
        return res.render('reset-password', {
            resetKey,
            error: "New password cannot be the same as the current password. Please try again!"
        })
    }

})

// Route to render the contact page
app.get('/contact', sessionExpirationMiddleware, async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    const session = await business.getSession(sessionKey)

    // You can assume the session is valid here due to the sessionExpirationMiddleware

    const userId = session.sessionData.userId
    const profile = await business.getUserProfile(userId)

    res.render('contact', { profilePhotoPath: profile.profilePhotoPath || '/static/assets/img/avatars/default.png' })
})

// Route to render the message page
app.get('/message', sessionExpirationMiddleware, async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    const session = await business.getSession(sessionKey)

    // You can assume the session is valid here due to the sessionExpirationMiddleware

    const userId = session.sessionData.userId
    const profile = await business.getUserProfile(userId)
    res.render('message', { profilePhotoPath: profile.profilePhotoPath || '/static/assets/img/avatars/default.png' })
})

// Route to render the badge page
app.get('/badge', sessionExpirationMiddleware, async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    const session = await business.getSession(sessionKey)

    // You can assume the session is valid here due to the sessionExpirationMiddleware

    const userId = session.sessionData.userId
    const profile = await business.getUserProfile(userId)
    res.render('badge', { profilePhotoPath: profile.profilePhotoPath || '/static/assets/img/avatars/default.png' })
})

/**
 * Starts the Express server and listens for incoming connections.
 * 
 * @function
 * @param {number} port - The port number on which the server will listen.
 * @param {Function} callback - A callback function that runs once the server starts.
 * @returns {void} Logs a message indicating the server is running.
 */
app.listen(8000, () => {
    console.log("App running on port 8000")
})