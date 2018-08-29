'use strict';
const db = require('@arangodb').db;

const sessions = 'sessions';
const users = 'users';
const google_session = 'google_session';

const collectionName = 'projects';


if (!db._collection(collectionName)) {
    db._createDocumentCollection(collectionName);
}

if (!db._collection(sessions)) {
    db._createDocumentCollection(sessions);
}

if (!db._collection(users)) {
    db._createDocumentCollection(users);
}

if (!db._collection(google_session)) {
    db._createDocumentCollection(google_session);
}

db._collection(users).ensureIndex({
    type: 'hash',
    fields: ['username'],
    unique: true
});