/**
 * Enter your values in blank lines and rename config.sample.js to config.js
 * @type {string}
 */


const iisGoogle = ` <- you google maill ->@cobalt-anchor-197213.iam.gserviceaccount.com`;
const privatKey = `-----BEGIN PRIVATE KEY-----
                    must be you key:)
                   -----END PRIVATE KEY-----`;

const hostname = `http://localhost:8529/`;

const urlRedirect = `${hostname}login`;

const git = {
    clientId: '',
    clientSecret: '',
    redirect_uri: `${hostname}_db/cad/auth/auth2code`
};

const google = {
    clientId: '',
    clientSecret: '',
    redirect_uri: `${hostname}_db/cad/auth/gauth2code`
};

const facebook = {
    clientId: '',
    clientSecret: '',
    redirect_uri: `${hostname}_db/cad/auth/fauth2code`
};

const linkedin = {
    clientId: '',
    clientSecret: '',
    redirect_uri: `${hostname}_db/cad/auth/lauth2code`
};

module.exports = {
    iisGoogle,
    privatKey,
    urlRedirect,
    git,
    google,
    facebook,
    linkedin
};