"use strict";
// DVNP Broadbaster by Roger Hardiman
// (c) Roger Hardiman and (c) RJH Technical Consultancy Ltd 2022
// Dual Licence. GNU GPL version 3 licence with Commercial Licence Options available
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Based on Document Reference: TEC4502/E/30.03.2020
// Digital Video Network Protocol Interface Specification
//
// A DVNP Broadcaster allows Consumers (CCTV Viewers) to obtain a list of cameras (called Nodes) and request video URLs (eg RTSP URLs)
// A DVNP Broadcaster also requires a Media server for example a RTSP Server
//
// To compile:        npx tsc
// To run             node dist/dvnp_server.js
// To lint            npx eslint . --ext .ts
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
// You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const express_1 = __importDefault(require("express"));
const https_1 = __importDefault(require("https"));
const pem_1 = __importDefault(require("pem"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const port = 9000; // 443
const username = "admin";
const password = "abc123";
const dvnp_broadcaster = () => __awaiter(void 0, void 0, void 0, function* () {
    // Use Arrays as a mini databases
    let validSessions = [];
    let requestedStreams = [];
    // Constants
    const JSessionIDCookieName = 'JSESSIONID';
    const cameraList = [
        {
            "cameraid": "00026.00001",
            "description": "Camera 1 Front Entrance",
            "faulty": false,
            "latitude": 51.89738,
            "longitude": -2.09944,
            "fixed": true,
            "height": 2.3,
            "bearing": 90.0,
            "owner": "Cheltenham"
        },
        {
            "cameraid": "00026.00002",
            "description": "Camera 2 Side Entrance",
            "faulty": false,
            "latitude": 51.89751,
            "longitude": -2.10009,
            "fixed": false,
            "height": 2,
            "owner": "Cheltenham"
        },
        {
            "cameraid": "00026.00003",
            "description": "Camera 3 Platform",
            "faulty": false,
            "latitude": 51.89733,
            "longitude": -2.09976,
            "fixed": false,
            "height": 2,
            "owner": "Cheltenham"
        }
    ];
    // Use OpenSSL to create a self signed certificate
    const certProps = {
        days: 3650,
        selfSigned: true,
    };
    // Create Keys
    pem_1.default.createCertificate(certProps, (error, keys) => {
        if (error) {
            console.log(error);
            throw error;
        }
        const credentials = { key: keys.serviceKey, cert: keys.certificate };
        // Initialise Express Web Server and a HTTPS Socket
        const app = (0, express_1.default)();
        // Add Pre-Processors
        app.use((0, cookie_parser_1.default)()); // pass http requests through the cookie parser (populates .cookies item in the 'req' object)
        ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // DVNP Login.action
        // Example HTTP GET request: https://xxx.xxx.xx.xxx/Login.action?username=TFLOPS1&password=352980a9dd90ce16b17771ee56df895b5d8cf78a
        ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        app.get('/Login.action', function (req, res) {
            if (req.query.username == undefined || req.query.password == undefined) {
                // Error - Username or Password are missing
                const reply = {
                    "action": "Login",
                    "errorCode": 1,
                    "message": "Invalid Username or Password",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // Check if user has already logged in
            const found = validSessions.find(item => item.username == req.query.username);
            if (found != undefined) {
                // Error - User already logged in
                const reply = {
                    "action": "Login",
                    "errorCode": 4,
                    "message": "User Already Logged In",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // Check username and Password are valid
            let loginOK = false;
            // TODO. Expand with array of users
            if (req.query.username == username && req.query.password == password) {
                loginOK = true;
            }
            if (loginOK == false) {
                // Login failed
                const reply = {
                    "action": "Login",
                    "errorCode": 1,
                    "message": "Invalid Username or Password",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // Everything is OK
            const reply = {
                "action": "Login",
                "data": {
                    "heartbeatInterval": 30,
                },
                "success": true
            };
            // Create and Send JSessionID cookie, used in future requests. Have a 1 minute timeout on the cookie
            const now = new Date();
            const sessionId = "Session" + now.toString() + (Math.random() * 1000000).toString(); // TODO switch to UUID
            const cookieOptions = {}; // Not using expiry. Server side will check for expiry. expires: new Date(expires) };
            const newSessionItem = {
                sessionId: sessionId,
                username: req.query.username.toString(),
                lastHeartbeat: now
            };
            validSessions.push(newSessionItem);
            res.cookie(JSessionIDCookieName, sessionId, cookieOptions).json(reply);
            return;
        });
        ///////////////////////////////////////////////////////////////////////
        // DVNP Logout.action
        // Example HTTP GET request:  https://xxx.xxx.xx.xxx/Logout.action
        ///////////////////////////////////////////////////////////////////////
        app.get('/Logout.action', function (req, res) {
            console.log("Logout.action");
            let sessionIdNotRecognised = false;
            let session = null;
            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            }
            else {
                session = validSessions.find(item => item.sessionId == req.cookies[JSessionIDCookieName]);
                if (session == undefined) {
                    // Error - Session was not found
                    sessionIdNotRecognised = true;
                }
            }
            if (sessionIdNotRecognised) {
                const reply = {
                    "action": "Logout",
                    "errorCode": 2,
                    "message": "Session ID Not Recognised",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // Everything is OK.
            // Remove the cookie from the array of Sessions
            //validSessions = validSessions.filter(item => item.sessionId != req.cookies[JSessionIDCookieName])
            validSessions = validSessions.filter(item => item != session); // object level match
            const reply = {
                "action": "Logout",
                "data": null,
                "success": true
            };
            res.clearCookie(JSessionIDCookieName).json(reply); // The cookie is now stale so clear it
            return;
        });
        ///////////////////////////////////////////////////////////////////////////////////////////////
        // Heartbeat.action
        // Example HTTP GET request: https://xxx.xxx.xx.xxx/Heartbeat.action
        ///////////////////////////////////////////////////////////////////////////////////////////////
        app.get('/Heartbeat.action', function (req, res) {
            let sessionIdNotRecognised = false;
            let session = null;
            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            }
            else {
                session = validSessions.find(item => item.sessionId == req.cookies[JSessionIDCookieName]);
                if (session == undefined) {
                    // Error - Session was not found
                    sessionIdNotRecognised = true;
                }
            }
            if (sessionIdNotRecognised) {
                const reply = {
                    "action": "Heartbeat",
                    "errorCode": 2,
                    "message": "Session ID Not Recognised",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // Everything is OK
            // Update the last heartbeat time in the validSessions array
            const now = new Date();
            session.lastHeartbeat = now;
            const reply = {
                "action": "Heartbeat",
                "data": [],
                "success": true,
                "timestamp": Math.round(now.getTime() / 1000) // time in seconds since 1970
            };
            res.json(reply);
            return;
        });
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // DVNP GetNodes.action  
        // This function returns a list of Cameras based on the user's search query eg search by Latitude/Longitude/Radius
        // Example HTTP GET requests: https://xxx.xxx.xx.xxx/GetNodes.action?pointX=52.30&pointY=-
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        app.get('/GetNodes.action', function (req, res) {
            let sessionIdNotRecognised = false;
            let session = null;
            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            }
            else {
                session = validSessions.find(item => item.sessionId == req.cookies[JSessionIDCookieName]);
                if (session == undefined) {
                    // Error - Session was not found
                    sessionIdNotRecognised = true;
                }
            }
            if (sessionIdNotRecognised) {
                const reply = {
                    "action": "GetNodes",
                    "errorCode": 2,
                    "message": "Session ID Not Recognised",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // Everything is OK
            // Extra.. Update the heartbeat for any DVNP command, not just Heartbeat commands
            const now = new Date();
            session.lastHeartbeat = now;
            // TODO - The HTTP GET request can pass in latitude, longitude and radius. These could be used to filter the results
            const reply = {
                "action": "GetNodes",
                "data": cameraList,
                "success": true
            };
            res.json(reply);
            return;
        });
        ///////////////////////////////////////////////////////////////////////
        // DVNP GetProfiles.action
        // Example HTTP GET requests: https://xxx.xxx.xx.xxx/GetProfiles.action
        ///////////////////////////////////////////////////////////////////////
        app.get('/GetProfiles.action', function (req, res) {
            let sessionIdNotRecognised = false;
            let session = null;
            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            }
            else {
                session = validSessions.find(item => item.sessionId == req.cookies[JSessionIDCookieName]);
                if (session == undefined) {
                    // Error - Session was not found
                    sessionIdNotRecognised = true;
                }
            }
            if (sessionIdNotRecognised) {
                const reply = {
                    "action": "GetProfiles",
                    "errorCode": 2,
                    "message": "Session ID Not Recognised",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // Everything is OK
            // Extra.. Update the heartbeat for any DVNP command, not just Heartbeat commands
            const now = new Date();
            session.lastHeartbeat = now;
            // TODO - The HTTP GET request can pass in latitude, longitude and radius. These could be used to filter the results
            const reply = {
                "action": "GetProfiles",
                "data": [
                    {
                        "profileName": "rtsp",
                        "frameRate": 25,
                        "resolution": "1280, 720",
                        "codec": "H264" // The DVNP spec is unclear and says TDB.
                    }
                    // Would add in RTMP or HLS etc if supported
                ],
                "success": true
            };
            res.json(reply);
            return;
        });
        ///////////////////////////////////////////////////////////////////////
        // DVNP GetProfiles.action
        // Example HTTP GET requests: https://xxx.xxx.xx.xxx/GetStreamURI.action?cameraid=00054.01234&profile=rtmpt&info=operator2
        // Example HTTP GET requests: https://xxx.xxx.xx.xxx/GetStreamURI.action?cameraid=00013.09988
        ///////////////////////////////////////////////////////////////////////
        app.get('/GetStreamURI.action', function (req, res) {
            let sessionIdNotRecognised = false;
            let session = null;
            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            }
            else {
                session = validSessions.find(item => item.sessionId == req.cookies[JSessionIDCookieName]);
                if (session == undefined) {
                    // Error - Session was not found
                    sessionIdNotRecognised = true;
                }
            }
            if (sessionIdNotRecognised) {
                const reply = {
                    "action": "GetStreamURI",
                    "errorCode": 2,
                    "message": "Session ID Not Recognised",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // Check the Camera ID is valid
            // Extra.. Update the heartbeat for any DVNP command, not just Heartbeat commands
            const now = new Date();
            session.lastHeartbeat = now;
            // Parse the cameraid. Check the cameraid is in the cameraList
            let cameraIdNotRecognised = false;
            let camera = null;
            if (req.query.cameraid == undefined) {
                // Error - no cameraid parameter
                cameraIdNotRecognised = true;
            }
            else {
                camera = cameraList.find(item => item.cameraid == req.query.cameraid);
                if (camera == undefined) {
                    // Error - cameraid not in the camera list
                    cameraIdNotRecognised = true;
                }
            }
            if (cameraIdNotRecognised) {
                const reply = {
                    "action": "GetStreamURI",
                    "errorCode": 3,
                    "message": "Camera ID Not Recognised",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // TODO - We can check the Profile passed in the URL to decide which StreamURI to use
            // TODO - The parameter is optional. In this demo we will ignore the Profile
            // In this example we hard code the RTSP URL and have no expiry date
            const streamURL = "rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4";
            const expires = "2099-12-31T23:59";
            // In a real system we would now communicate with a RTSP Proxy or an RTSP Server to allow video to stream to the viewer/Consumer.
            // <ADD RTSP SERVER CODE>
            // Add an entry to our RequestedStreams database. This is also used in StopVideo.action
            // Get the username from the Session
            // Avoid duplicates
            const check = requestedStreams.find(item => item.username == session.username && item.cameraId == req.query.cameraid.toString());
            if (check == null) {
                // We have not already started this Camera by this User
                const newRequest = {
                    username: session.username,
                    cameraId: req.query.cameraid.toString(),
                    streamUrl: streamURL
                };
                requestedStreams.push(newRequest);
            }
            // Send the reply
            const reply = {
                "action": "GetStreamURI",
                "data": // The official spec has a square bracket here. Is 'data' supposed to be a single item or an Array of URL/Expiry objects
                {
                    "streamURL": streamURL,
                    "expires": expires
                },
                "success": true
            };
            res.json(reply);
            return;
        });
        ///////////////////////////////////////////////////////////////////////
        // DVNP GetProfiles.action
        // Example HTTP GET requests: https://xxx.xxx.xx.xxx/StopVideo.action?cameraid=00054.01234&info=operator1
        // Example HTTP GET requests: https://xxx.xxx.xx.xxx/StopVideo.action?cameraid=00013.09988
        ///////////////////////////////////////////////////////////////////////
        app.get('/StopVideo.action', function (req, res) {
            let sessionIdNotRecognised = false;
            let session = null;
            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            }
            else {
                session = validSessions.find(item => item.sessionId == req.cookies[JSessionIDCookieName]);
                if (session == undefined) {
                    // Error - Session was not found
                    sessionIdNotRecognised = true;
                }
            }
            if (sessionIdNotRecognised) {
                const reply = {
                    "action": "StopVideo",
                    "errorCode": 2,
                    "message": "Session ID Not Recognised",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // Extra.. Update the heartbeat for any DVNP command, not just Heartbeat commands
            const now = new Date();
            session.lastHeartbeat = now;
            // Parse the cameraid. Check the cameraid is in the cameraList
            let cameraIdNotRecognised = false;
            let camera = null;
            if (req.query.cameraid == undefined) {
                // Error - no cameraid parameter
                cameraIdNotRecognised = true;
            }
            else {
                camera = cameraList.find(item => item.cameraid == req.query.cameraid);
                if (camera == undefined) {
                    // Error - cameraid not in the camera list
                    cameraIdNotRecognised = true;
                }
            }
            if (cameraIdNotRecognised) {
                const reply = {
                    "action": "StopVideo",
                    "errorCode": 3,
                    "message": "Camera ID Not Recognised",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // Check the video stream was requested
            const request = requestedStreams.find(item => item.cameraId == req.query.cameraid && item.username == session.username);
            if (request == undefined) {
                // Error - This User (via the JSessionID) has not requested this CameraID in GetStreamURI
                const reply = {
                    "action": "StopVideo",
                    "errorCode": 8,
                    "message": "Streaming ID Not Recognised",
                    "success": false
                };
                res.json(reply);
                return;
            }
            // In our example we have hard coded URL for the RTSP stream.
            // In a real world example we would use the JSessionID-or-Username + CameraID to talk to a RTSP Server or RTSP Proxy to stop streaming
            // and free resources
            // Remove the entry from requestedStreams
            requestedStreams = requestedStreams.filter(item => item != request); // object level match
            // Everything is OK. Send the reply.
            const reply = {
                "action": "StopVideo",
                "data": null,
                "success": true
            };
            res.json(reply);
            return;
        });
        ////////////////////////////////////////////////////
        // Home Page
        ////////////////////////////////////////////////////
        app.get('/', function (req, res) {
            res.send('DVNP Broadcaster Server, by Roger Hardiman (c) RJH Technical Consultancy Ltd 2022');
        });
        ////////////////////////////////////////////////////
        // Catch All
        // Echo back the URL received
        ////////////////////////////////////////////////////
        app.get('*', function (req, res) {
            res.send("Invalid URL: " + req.originalUrl);
        });
        const httpsServer = https_1.default.createServer(credentials, app);
        httpsServer.listen(port);
        console.log('HTTPS server started on Port ' + port);
    });
});
// Start the Server
dvnp_broadcaster();
//# sourceMappingURL=dvnp_broadcaster.js.map