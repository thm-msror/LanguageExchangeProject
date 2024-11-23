//presentation layer
const express = require('express')
const business = require('./business.js')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const handlebars = require('express-handlebars')
const fileUpload = require('express-fileupload')
const defaultProfilePhoto = '/static/assets/img/avatars/default.png'

let app = express()

// Set up Handlebars

// Helper function for comparing two values in if statements
const hbs = handlebars.create({
    helpers: { eq: (a, b) => a === b, },
    extname: '.handlebars'
})

app.set('views', __dirname + "/templates")
app.set('view engine', 'handlebars')
app.engine('handlebars', hbs.engine)


// Middleware for parsing form data
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser())
app.use('/static', express.static(__dirname + "/static"))
app.use(bodyParser.json())

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
        res.cookie("sessionKey", "", { expires: new Date(Date.now()) }) // Clear expired session cookie
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
            return res.redirect('/user')
        }
    }

    res.render('login', { message: message })
})

// Route to display user profile
app.get('/user', sessionExpirationMiddleware, async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey
        // Generating the CSRF token if submission of form is required
        await business.generateToken(sessionKey)

        const session = await business.getSession(sessionKey)
        // sessionExpirationMiddleware checks if the session is valid and redirects to login if not

        const username = session.sessionData.username
        const profile = await business.getUserProfile(username)

        // Passing user details and CSRF token to the template
        res.render('user', {
            username,
            csrfToken: session.csrfToken,
            description: profile.description,
            fluentLang: profile.fluentLang,
            learnLang: profile.learnLang,
            profilePhotoPath: profile.profilePhotoPath || defaultProfilePhoto,
        })
    } catch (error) {
        console.error('Error loading user profile:', error)
        res.status(500).render('500', { error: 'Failed to load profile. Please try again later.' })
    }
})

app.post('/user', sessionExpirationMiddleware, fileUpload(), async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey
        let session = await business.getSession(sessionKey)

        const username = session.sessionData.username
        const profile = business.getUserProfile(username)
        
        const csrfToken = req.body.csrfToken

        // Validating the CSRF token
        const isValidToken = await business.validateToken(sessionKey, csrfToken)
        if (!isValidToken) {
            return res.status(403).render('404', { error: 'Invalid CSRF token.' })
        }
        // Cancelling the CSRF token imeediately after use
        await business.cancelToken(sessionKey)


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

        if (!fluentLang || fluentLang.length < 1 || fluentLang.length > 5) {
            // Generating the CSRF token if submission of form is required
            await business.generateToken(sessionKey)
            // Getting updated session data
            session = await business.getSession(sessionKey)

            return res.render('user', {
                error: "Select 1 to 5 fluent languages.",
                username,
                csrfToken: session.csrfToken,
                description: profile.description,
                fluentLang: profile.fluentLang,
                learnLang: profile.learnLang,
                profilePhotoPath: profile.profilePhotoPath || defaultProfilePhoto,
            })
        }
        if (!learnLang || learnLang.length < 1 || learnLang.length > 5) {
            // Generating the CSRF token if submission of form is required
            await business.generateToken(sessionKey)
            session = await business.getSession(sessionKey)

            return res.render('user', {
                error: "Select 1 to 5 languages you want to learn.",
                username,
                csrfToken: session.csrfToken,
                description: profile.description,
                fluentLang: profile.fluentLang,
                learnLang: profile.learnLang,
                profilePhotoPath: profile.profilePhotoPath || defaultProfilePhoto,
            })
        }


        let profilePhotoPath = null
        if (req.files?.profilePhoto) {
            const photo = req.files.profilePhoto
            const uploadPath = __dirname + '/static/assets/img/avatars/' + Date.now() + '-' + photo.name
            profilePhotoPath = '/static/assets/img/avatars/' + Date.now() + '-' + photo.name

            await photo.mv(uploadPath) // Move the uploaded file
        }

        // Save profile through the business layer
        await business.saveUserProfile(username, {
            description,
            fluentLang,
            learnLang,
            profilePhotoPath,
        })

        // Redirect to GET /user to display the updated profile
        res.redirect('/user')

    } catch (error) {
        console.error("Error updating profile:", error)
        res.status(500).render('500', { error: 'Failed to update profile. Please try again later.' })
    }
})


//Contact page functionality 

// Route to render the contact page
app.get('/contact', sessionExpirationMiddleware, async (req, res) => {
    const sessionKey = req.cookies.sessionKey;
    const session = await business.getSession(sessionKey);

    // We assume the session is valid due to the sessionExpirationMiddleware
    const username = session.sessionData.username;

    // Use business layer to get user profile
    const profile = await business.getUserProfile(username);

    res.render('contact', { profilePhotoPath: profile.profilePhotoPath || defaultProfilePhoto });
});

// Fetch suggested contacts
app.get('/api/contacts/suggested', sessionExpirationMiddleware, async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey;
        const session = await business.getSession(sessionKey);

        const username = session.sessionData.username;

        // Fetch logged-in user and their suggested contacts via business layer
        const suggestedContacts = await business.getSuggestedContacts(username);

        res.json(suggestedContacts);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch suggested contacts' });
    }
});

// Add contact
app.post('/api/contacts/add', sessionExpirationMiddleware, async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey;
        const session = await business.getSession(sessionKey);

        const username = session.sessionData.username;
        const contactUsername = req.body.contactUsername

        // Add contact using the business layer
        await business.addContact(username, contactUsername);

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add contact' });
    }
});

// Fetch current contacts
app.get('/api/contacts/current', sessionExpirationMiddleware, async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey;
        const session = await business.getSession(sessionKey);

        const username = session.sessionData.username;
        // Fetch current contacts via business layer
        const currentContacts = await business.getCurrentContacts(username);

        res.json(currentContacts);


    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch current contacts' });
    }
});

app.get('/user/:contactUsername', sessionExpirationMiddleware, async (req, res) => {
    try {
        const contactUsername = req.params.contactUsername; // Get the contact username from the URL parameters
        const sessionKey = req.cookies.sessionKey; // Get the session key from cookies
        const session = await business.getSession(sessionKey); // Fetch the session from the business layer

        const currentUsername = session.sessionData.username; // Get the current logged-in username

        // Fetch the profile of the logged-in user
        const currentUserProfile = await business.getUserProfile(currentUsername);

        // Fetch the profile of the contact user
        const contactProfile = await business.getUserProfile(contactUsername);

        // Check if the contact profile exists
        if (!contactProfile) {
            return res.render('404', { error: "User  not found." });
        }

        // Render the user profile page with both the logged-in user's and the contact's information
        res.render('contactprofile', {
            currentUsername, // Current logged-in user's username
            currentUserProfile, // Current user's profile data
            contactProfile, // Contact's profile data
            contactUsername, // Contact's username
            profilePhotoPath: currentUserProfile.profilePhotoPath || defaultProfilePhoto, // Default profile photo for current user
        });

    } catch (error) {
        console.error('Error loading user profile:', error);
        res.status(500).render('500', { error: 'Failed to load profile. Please try again later.' });
    }
});

// Remove contact
app.delete('/api/contacts/remove/:contactUsername', sessionExpirationMiddleware, async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey;
        const session = await business.getSession(sessionKey);

        const username = session.sessionData.username;
        const { contactUsername } = req.params;

        // Remove contact using the business layer
        await business.removeContact(username, contactUsername);

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to remove contact' });
    }
});


// Block contact
app.delete('/api/contacts/block/:contactUsername', sessionExpirationMiddleware, async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey;
        const session = await business.getSession(sessionKey);

        const username = session.sessionData.username;
        const { contactUsername } = req.params;

        // block contact using the business layer
        await business.blockUser(username, contactUsername);

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to remove contact' });
    }
});

// Route to render the message page
app.get('/message', sessionExpirationMiddleware, async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey
        const session = await business.getSession(sessionKey)

        const username = session.sessionData.username
        const profile = await business.getUserProfile(username)
        const contacts = await business.getCurrentContacts(username)

        await business.generateToken(sessionKey);

        res.render('message', {
            profilePhotoPath: profile.profilePhotoPath || defaultProfilePhoto,
            username,
            contacts,
            crsfToken: session.crsfToken
        })
    } catch (error) {
        console.error(error);
        res.status(500).render('500', { error: 'Failed to load messages page' });
    }
})


app.get("/message/:contactUsername", async (req, res) => {
    try {
        const sessionKey = req.cookies.sessionKey
        const session = await business.getSession(sessionKey)

        const username = session.sessionData.username
        const userProfile = await business.getUserProfile(username);

        const contact = req.params.contactUsername;


        const conversationId = await business.getConversationIdByUsernames(username, contact);
        //const chatHistory = await business.getChatHistory(conversationId)
        const allContacts = await business.getCurrentContacts(username);
        const chatHistory = [
            { senderUsername: 'user1', time: '10:00 AM', message: 'Hello!' },
            { senderUsername: 'user2', time: '10:05 AM', message: 'Hi there!' }
        ]

        res.render("message", {
            profilePhotoPath: userProfile.profilePhotoPath || defaultProfilePhoto,
            username: username,
            contacts: allContacts,
            contactUsername: contact,
            messages: chatHistory.length > 0 ? chatHistory : null,
        })
    } catch (error) {
        res.status(500).render('500', { error: 'Failed to load chat' });
    }
})


app.post("/message/:contactUsername", async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    const session = await business.getSession(sessionKey)

    const username = session.sessionData.username
    const contact = req.params.contactUsername;


})

// Route to render the badge page
app.get('/badge', sessionExpirationMiddleware, async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    const session = await business.getSession(sessionKey)

    const username = session.sessionData.username
    const profile = await business.getUserProfile(username)
    res.render('badge', { profilePhotoPath: profile.profilePhotoPath || defaultProfilePhoto })
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
        res.cookie("sessionKey", "", { expires: new Date(Date.now()) }) // Clear and expire session cookie
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


app.get('/404', async (req, res) => {
    res.render('404')
})



app.get('/500', async (req, res) => {
    res.render('500')
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