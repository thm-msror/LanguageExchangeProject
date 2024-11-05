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

// Main landing page
app.get('/', async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    // let flashMessage = await flash.getFlash(sessionKey) Will use flash message when anonymous user is created

    if (sessionKey) {
        const session = await business.getUserSession(sessionKey)
        if (session) {
            // Redirect to personalized user page if logged in
            return res.redirect('/user')
        }
    }

    res.render('login') // For now just redirecting to the login page if no active session.
    return
})

// User page route (personalized view)
app.get('/user', async (req, res) => {
    const sessionKey = req.cookies.sessionKey
    const flashMessage = await flash.getFlash(sessionKey)

    if (sessionKey) {
        const session = await business.getUserSession(sessionKey)
        console.log(session) 
        if (session) {
            return res.render('user', { username: session.username, message: flashMessage }) //TypeError: Cannot read properties of undefined (reading 'username')

        }
    }
    // If no session, redirect to login
    res.redirect('/login')
})

// Render registration page
app.get('/register', (req, res) => {
    res.render('register')
})

app.post('/register', async (req, res) => {
    const username = req.body.username //Changed from req.body to 2 separate assignment statememts
    const password  = req.body.password
    const email = req.body.email
    
    // Verify email

    try {
        const newUser = await business.registerUser({email: email, username: username, password: password })
        await flash.setFlash(newUser._id, `Welcome, ${newUser.username}! Registration successful.`)
        res.redirect('/login')
        return
    } catch (error) {
        res.render('register', { message: `Registration unsuccessful. Please ensure all fields are correct` })
        return
    }
})



//login route
app.get('/login',  (req, res) => {
    res.render('login')
})

// Handle user login
app.post('/login', async (req, res) => {
    const username = req.body.username //Changed from req.query to 2 separate assignment statememts
    const password  = req.body.password

    try {
        // Validate user credentials
        const { sessionKey, user } = await business.loginUser(username, password)

        // Set session cookie and flash message
        res.cookie('sessionKey', sessionKey, { httpOnly: true })
        await flash.setFlash(sessionKey, `Welcome back, ${user.username}!`)

        // Redirect to personalized user page
        res.redirect('/user')
        return
    } catch (error) {
        console.log(error)
        res.render('login', {message: `Could not authenticate the user.`})
        return

    }
})

//index route for Dashboard
app.get('/index', (req, res) => {
    res.render('index')
})

//register route

// Start server
app.listen(8000, () => {
    console.log("App running on port 8000")
})
