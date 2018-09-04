'use strict';
const db = require('@arangodb').db;
const joi = require('joi');
const createAuth = require('@arangodb/foxx/auth');
const createRouter = require('@arangodb/foxx/router');
const sessionsMiddleware = require('@arangodb/foxx/sessions');
const accessToken = require('./accessToken');
let request = require('@arangodb/request');
const errors = require('@arangodb').errors;
const DOC_NOT_FOUND = errors.ERROR_ARANGO_DOCUMENT_NOT_FOUND.code;

const auth = createAuth();
const router = createRouter();
const users = db._collection('users');
const sessions = sessionsMiddleware({
    storage: db._collection('sessions'),
    transport: ['header', 'cookie']
});

const {git, google, facebook, linkedin, urlRedirect} = require('./config');

const createOAuth2Client = require('@arangodb/foxx/oauth2');
const oauth2Git = createOAuth2Client({
    authEndpoint: 'https://github.com/login/oauth/authorize?scope=user',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    activeUserEndpoint: 'https://api.github.com/user',
    clientId: git.clientId,
    clientSecret: git.clientSecret
});

const oauth2Google = createOAuth2Client({
    authEndpoint: 'https://accounts.google.com/o/oauth2/auth?access_type=offline&scope=email',
    tokenEndpoint: 'https://accounts.google.com/o/oauth2/token',
    activeUserEndpoint: 'https://www.googleapis.com/plus/v1/people/me',
    clientId: google.clientId,
    clientSecret: google.clientSecret
});

const oauth2Facebook = createOAuth2Client({
    authEndpoint: 'https://www.facebook.com/dialog/oauth',
    tokenEndpoint: 'https://graph.facebook.com/oauth/access_token',
    activeUserEndpoint: 'https://graph.facebook.com/v2.0/me?fields=id,name,email,picture',
    clientId: facebook.clientId,
    clientSecret: facebook.clientSecret
});

const oauth2Linkedin = createOAuth2Client({
    authEndpoint: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
    activeUserEndpoint: 'https://api.linkedin.com/v1/people/~:(id,first-name,last-name,email-address)?format=json',
    clientId: linkedin.clientId,
    clientSecret: linkedin.clientSecret
});

module.context.use(router);
router.use(sessions);

/**
 *  authorization api
 */
router.use('/docs', module.context.createDocumentationRouter(function (req, res) {
    // if (req.suffix === 'swagger.json' && !req.arangoUser) {
    //     res.throw(401, 'Not authenticated');
    // }
    return {
        indexFile: "index.html",
        mount: req.context.mount
    }
}));
/**
 *  GET /whoami
 */
router.get('/whoami', function (req, res) {
    try {
        const user = users.document(req.session.uid);
        res.send(user);
    } catch (e) {
        if (!e.isArangoError || e.errorNum !== DOC_NOT_FOUND) {
            throw e;
        }
        res.throw(404, 'The entry does not exist', e);
    }
})
    .response(joi.object().required(), 'Return user data.')
    .summary('Active user ')
    .description('Returns the currently active user.');

/**
 *  POST /login
 */
router.post('/login', function (req, res) {
    // This may return a user object or null
    const user = users.firstExample({
        username: req.body.username
    });
    const valid = auth.verify(
        // Pretend to validate even if no user was found
        user ? user.authData : {},
        req.body.password
    );
    if (!valid) res.throw('unauthorized');
    // Log the user in
    req.session.uid = user._key;
    req.sessionStorage.save(req.session);
    res.send({sid: req.session._key, userName: user.username});
})
    .body(joi.object({
        username: joi.string().required(),
        password: joi.string().required()
    }).required(), 'Credentials')
    .response(joi.object().required(), 'Return user data.')
    .summary('Login user ')
    .description('Logs a registered user in.');


/**
 *  POST /logout
 */
router.post('/logout', function (req, res) {
    if (req.session.uid) {
        req.session.uid = null;
        req.sessionStorage.save(req.session);
    }
    res.send({success: true});
})
    .response(joi.object().required(), 'Return success true.')
    .summary('Logout user ')
    .description('Logs the current user out.');


/**
 *  POST /signup
 */
router.post('/signup', function (req, res) {
    const user = req.body;
    try {
        // Create an authentication hash
        user.authData = auth.create(user.password);
        delete user.password;
        const meta = users.save(user);
        Object.assign(user, meta);
    } catch (e) {
        // Failed to save the user
        // We'll assume the UniqueConstraint has been violated
        res.throw('bad request', 'Username already taken', e);

    }
    // Log the user in
    req.session.uid = user._key;
    req.sessionStorage.save(req.session);
    res.send({sid: req.session._key, userName: user.username});
})
    .body(joi.object({
        username: joi.string().required(),
        password: joi.string().required()
    }).required(), 'Credentials')
    .response(joi.object().required().keys({
        sid: joi.string().required(),
        userName: joi.string().required()
    }), 'Return new user sid, userName.')
    .summary('Creates a new user')
    .description('Creates a new user and logs them in.');


/**
 *  GET authorization token
 */
router.get('/access', function (req, res) {
    try {
        const a = accessToken.getAutorise();
        res.send(a)
    } catch (e) {
        if (!e.isArangoError || e.errorNum !== DOC_NOT_FOUND) {
            throw e;
        }
        res.throw(404, 'The entry does not exist', e);
    }
})
    .response('Return google bearer authorization token.')
    .summary('Get google authorization token.')
    .description('Returns google authorization token for get data from google spreadsheets.');


/**
 *  Linkedin
 */
router.get('/lauth2code', function (req, res) {
    // Make sure the URL contains a grant token
    if (!req.queryParams.code || !req.queryParams.state) {
        res.throw(400, 'Provider did not pass grant token.');
    }
    // Fetch an access token from the provider
    const authData = oauth2Linkedin.exchangeGrantToken(
        req.queryParams.code,
        linkedin.redirect_uri
    );
    const linkedinToken = authData.access_token;
    // Fetch the active user's profile info
    const profileHandle = request(
        {
            method: 'GET',
            url: 'https://api.linkedin.com/v1/people/~:(id,first-name,picture-url,last-name,email-address)?format=json',
            headers: {'authorization': `Bearer ${linkedinToken}`}
        });
    // Try to find an existing user with the user ID
    // (this requires the users collection)
    let user = users.firstExample({email: profileHandle.json.emailAddress});
    if (user) {
        // Update the Token if it has changed
        if (user.linkedinToken !== linkedinToken) {
            users.update(user, {
                username: `${profileHandle.json.firstName}_${profileHandle.json.lastName}`,
                linkedinToken,
                picture_url: profileHandle.json.pictureUrl
            });
        }
    } else {
        // Create a new user document
        user = {
            username: `${profileHandle.json.firstName}_${profileHandle.json.lastName}`,
            email: profileHandle.json.emailAddress,
            linkedinToken,
            picture_url: profileHandle.json.pictureUrl
        };
        const meta = users.save(user);
        Object.assign(user, meta);
    }
    // Log the user in (this requires the session middleware)
    req.session.uid = user._key;
    req.session.linkedinToken = authData.access_token;
    req.sessionStorage.save(req.session);
    // Redirect to the default route
    res.redirect(303, `${urlRedirect}/${req.session._key}/${user.username}`)// ;
}, 'oauth2_callback')
    .queryParam('code', joi.string().optional())
    .queryParam('state', joi.string().optional())
    .summary('Authorization via linkedin.')
    .description(`Authorization via linkedin. Echange code to access_token. 
    Update exist user or create newUser with linkedin user data in db. Redirect to app user page.`);

/**
 *  Facebook
 */
router.get('/fauth2code', function (req, res) {
    // Make sure the URL contains a grant token
    if (!req.queryParams.code) {
        res.throw(400, 'Provider did not pass grant token.');
    }
    // Fetch an access token from the provider
    const authData = oauth2Facebook.exchangeGrantToken(
        req.queryParams.code,
        facebook.redirect_uri
    );
    const facebookToken = authData.access_token;
    // Fetch the active user's profile info
    const profile = oauth2Facebook.fetchActiveUser(facebookToken);
    const facebookId = profile.id;
    // Try to find an existing user with the user ID
    // (this requires the users collection)
    let user = users.firstExample({email: profile.email});
    if (user) {
        // Update the Token if it has changed
        if (user.facebookToken !== facebookToken) {
            users.update(user, {
                username: profile.name,
                facebookToken: facebookToken,
                picture_url: profile.picture.data.url
            });
        }
    } else {
        // Create a new user document
        user = {
            username: profile.name,
            email: profile.email,
            facebookId,
            facebookToken,
            picture_url: profile.picture.data.url
        };
        const meta = users.save(user);
        Object.assign(user, meta);
    }
    // Log the user in (this requires the session middleware)
    req.session.uid = user._key;
    req.session.facebookToken = authData.facebookToken;
    req.sessionStorage.save(req.session);
    // Redirect to the default route
    // res.redirect(303, req.makeAbsolute('/'))// ;
    res.redirect(303, `${urlRedirect}/${req.session._key}/${user.username}`)// ;
    // res.send({key: req.session._key})
}, 'oauth2_callback')
    .queryParam('code', joi.string().optional())
    .summary('Authorization via Facebook.')
    .description(`Authorization via Facebook. Echange code to access_token. 
    Update exist user or create newUser with Facebook user data in db. Redirect to app user page.`);

/**
 *  Google
 */
router.get('/gauth2code', function (req, res) {
    // Make sure the URL contains a grant token
    if (!req.queryParams.code) {
        res.throw(400, 'Provider did not pass grant token.');
    }
    // Fetch an access token from the provider
    const authData = oauth2Google.exchangeGrantToken(
        req.queryParams.code,
        google.redirect_uri
    );
    const googleToken = authData.access_token;
    // Fetch the active user's profile info
    const profile = oauth2Google.fetchActiveUser(googleToken);
    const googleId = profile.id;
    // Try to find an existing user with the user ID
    // (this requires the users collection)
    let user = users.firstExample({email: profile.emails[0].value});
    if (user) {
        // Update the Token if it has changed
        if (user.googleToken !== googleToken) {
            users.update(user, {
                username: profile.displayName,
                googleToken: googleToken,
                picture_url: profile.image.url
            });
        }
    } else {
        // Create a new user document
        user = {
            username: profile.displayName,
            email: profile.emails[0].value,
            googleId,
            googleToken,
            picture_url: profile.image.url
        };
        const meta = users.save(user);
        Object.assign(user, meta);
    }
    // Log the user in (this requires the session middleware)
    req.session.uid = user._key;
    req.session.googleToken = authData.googleToken;
    req.sessionStorage.save(req.session);
    // Redirect to the default route
    // res.redirect(303, req.makeAbsolute('/'))// ;
    res.redirect(303, `${urlRedirect}/${req.session._key}/${user.username}`)// ;
    // res.send({key: req.session._key})
}, 'oauth2_callback')
    .queryParam('code', joi.string().optional())
    .summary('Authorization via Google.')
    .description(`Authorization via Google. Echange code to access_token. 
    Update exist user or create newUser with Google user data in db. Redirect to app user page.`);

/**
 *  Github
 */
router.get('/auth2code', function (req, res) {
    // Make sure the URL contains a grant token
    if (!req.queryParams.code) {
        res.throw(400, 'Provider did not pass grant token.');
    }

    // Fetch an access token from the provider
    const authData = oauth2Git.exchangeGrantToken(
        req.queryParams.code,
        git.redirect_uri
    );
    const githubToken = authData.access_token;
    // Fetch the active user's profile info
    const profile = oauth2Git.fetchActiveUser(githubToken);
    const githubId = profile.id;
    // Try to find an existing user with the user ID
    // (this requires the users collection)
    let user = users.firstExample({githubId});
    if (user) {
        // Update the Token if it has changed
        if (user.githubToken !== githubToken) {
            users.update(user, {githubToken});
            console.log("update git user");
        }
    } else {
        // Create a new user document
        console.log("create new git user");
        user = {
            username: profile.login,
            githubId,
            githubToken,
            dataGit: profile
        };
        const meta = users.save(user);
        Object.assign(user, meta);
    }
    // Log the user in (this requires the session middleware)
    req.session.uid = user._key;
    req.session.githubToken = authData.githubToken;
    req.sessionStorage.save(req.session);
    // Redirect to the default route
    // res.redirect(303, req.makeAbsolute('/'))// ;
    res.redirect(303, `${urlRedirect}/${req.session._key}/${user.username}`)// ;
    // res.send({key: req.session._key})
}, 'oauth2_callback')
    .queryParam('code', joi.string().optional())
    .summary('Authorization via Github.')
    .description(`Authorization via Google. Github code to access_token. 
    Update exist user or create newUser with Github user data in db. Redirect to app user page.`);
