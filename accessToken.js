const db = require('@arangodb').db;
const google_session = db._collection('google_session');
const aql = require('@arangodb').aql;
const request = require('@arangodb/request');

const jsrsasign = require('jsrsasign');
const iisGoogle = require('./config').iisGoogle;
const privatKey = require('./config').privatKey;

function authorize() {
    // Header
    const oHeader = {alg: 'RS256', typ: 'JWT'};
    // Payload
    let oPayload = {};
    const tNow = jsrsasign.jws.IntDate.get('now');
    const tEnd = jsrsasign.jws.IntDate.get('now + 1hour');
    oPayload.iss = iisGoogle;
    oPayload.scope = "https://www.googleapis.com/auth/spreadsheets";
    oPayload.aud = "https://www.googleapis.com/oauth2/v4/token";
    oPayload.exp = tEnd;
    oPayload.iat = tNow;

    const sHeader = JSON.stringify(oHeader);
    const sPayload = JSON.stringify(oPayload);
    const sJWT = jsrsasign.jws.JWS.sign("RS256", sHeader, sPayload, privatKey);
    const getToken = request(
        {
            method: 'POST',
            url: 'https://www.googleapis.com/oauth2/v4/token',
            form: {
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: sJWT
            }
        });

    if (getToken && getToken.json && getToken.json.access_token) {
        const token = `${getToken.json.token_type} ${getToken.json.access_token}`;
        google_session.truncate();
        google_session.insert({
                accessToken: token,
                exp: oPayload.exp,
                iat: oPayload.iat
            }
        );
        return token
    } else {
        return {error: true, getToken, sJWT}
    }
}

function getAutorise () {
    const dbToken = db._query(aql`
        FOR session IN google_session
            FILTER session.exp > (DATE_NOW()/1000 + 60)
            RETURN session.accessToken
        `);
    if (dbToken._documents[0]) {
        return dbToken._documents[0]
    } else {
        return authorize()
    }
}

module.exports = {
    authorize,
    getAutorise
};