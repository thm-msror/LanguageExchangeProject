//presentation layer
const express = require('express')
const business = require('./business.js')
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
        return res.redirect('/login') // Redirect to login page if session is expired
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


/**
 * Route handler for user page, validates session and renders user view if session is active.
 *
 * @async
 * @param {Object} req - The request object, containing session cookies.
 * @param {Object} res - The response object to render the user page or redirect.
 * @returns {Promise<void>} Renders the user page with username if session is active, otherwise redirects to login.
 * @middleware {Function} sessionExpirationMiddleware - Middleware to check session expiration before accessing user page.
 */
app.get('/user', sessionExpirationMiddleware, async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    const session = await business.getSession(sessionKey)
    if (session && session.sessionData && session.sessionData.username) {
        return res.render('user', { username: session.sessionData.username })
    }
    res.redirect('/login')
})


/**
 * Route handler for index page, renders the dashboard page.
 *
 * @async
 * @param {Object} req - The request object.
 * @param {Object} res - The response object to render the index page.
 * @returns {Promise<void>} Renders the index page.
 * @middleware {Function} sessionExpirationMiddleware - Middleware to check session expiration before accessing index page.
 */
app.get('/index', sessionExpirationMiddleware, (req, res) => {
    res.render('index')
})

/**
 * Route handler for rednering the registration page.
 *
 * @async
 * @param {Object} req - The request object.
 * @param {Object} res - The response object to render the registration page.
 * @returns {Promise<void>} Renders the registration page.
 * @middleware {Function} sessionExpirationMiddleware - Middleware to check session expiration before accessing registration page.
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
 * @returns {Promise<void>} Redirects to login page after successful registration; otherwise, renders registration page with an error message.
 */
app.post('/register', async (req, res) => {
    const username = req.body.username
    const password = req.body.password
    const repeatPassword = req.body.repeatPassword
    const email = req.body.email

    try {
        await business.registerUser(username, email, password, repeatPassword)
        res.redirect('/login')  // Redirect to login page after successful registration

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
 * @returns {Promise<void>} Redirects to the user page if the session is active; otherwise, renders the login page with optional error message.
 */
app.get('/login', async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey

        // Check if there's an active session
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
 * @returns {Promise<void>} Sets a session cookie and redirects to user page if login is successful; otherwise, renders login with an error message.
 */
app.post('/login', async (req, res) => {
    const username = req.body.username
    const password = req.body.password

    try {
        const { sessionKey } = await business.loginUser(username, password)
        res.cookie('sessionKey', sessionKey, { httpOnly: true })
        res.redirect('/user')
    } catch (error) {
        res.render('login', { message: error.message })
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
    res.redirect('/?message=Logged Out.')
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
        return res.status(400).send('<h1>Verification token is missing.</h1>')
    }

    try {
        // Check if the token is valid
        const user = await business.verifyEmailToken(token)
        if (user) {
            // Mark the user's email as verified
            await business.updateUserEmailVerified(user.username)
            return res.send('<h1>Email verified successfully.</h1>')
        } else {
            return res.status(400).send('<h1>Invalid verification token.</h1>')
        }
    } catch (error) {
        return res.status(500).send('<h1>Internal server error.</h1>')
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
        res.send(`This email address does not exist or has not been verified.`)
        return
    }

    // Notify the user to check their email for a reset link
    res.send(`A reset link will be sent shortly...`)
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
        return res.send("Invalid or expired reset link.")
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
    const { resetKey, password, confirmPassword } = req.body
    const success = await business.resetPassword(resetKey, password, confirmPassword)

    // Debugging: Check if success is false and log the reason
    if (success) {
        res.redirect('/?message=Password changed. Please log in.')
    } else {
        res.send("Invalid or expired reset link.")
    }
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
