# Uber-CAD foxx  authorization service

To see authorization API go (https://uber-cad.ml/_db/cad/auth/docs/index.html)

## Use local server.
Clone this repository and .zip them.

To use a local server, you need to install Arangodb.
Look at the official [documentation](https://www.arangodb.com/download-major/).

After installation, go to (http://localhost:8529). 
Authorize.
Default userName: `root`,
Password: `your password when installing Arangodb`
  
In the db _system, create a database named `cad`.
In db `cad` go to SERVICES -> UPLOAD -> UPLOAD FILE select the zip file and INSTAL. 
  Mountpoint: auth

## License

This code is distributed under the [Apache License](http://www.apache.org/licenses/LICENSE-2.0).

