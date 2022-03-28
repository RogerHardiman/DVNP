// DVNP Broadbaster by Roger Hardiman
// (c) Roger Hardiman and (c) RJH Technical Consultancy Ltd 2022
// Dual Licence. GNU GPL version 3 licence with Commercial Licence Options available

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

import express, { CookieOptions } from 'express';
import https, { ServerOptions } from 'https';
import pem from 'pem';
import cookieParser from 'cookie-parser';

const port = 9000; // 443
const username = "admin";
const password = "abc123";

const dvnp_broadcaster = async () => {

    // List of valid Session Cookies
    type Session = {
        sessionId: string;
        username: string;
        lastHeartbeat: Date;
    }

    type RequestedStream = {
        username: string;
        cameraId: string;
        streamUrl: string;
    }

    // Use Arrays as a mini databases
    let validSessions: Session[] = [];
    let requestedStreams: RequestedStream[] = [];

    // Constants
    const JSessionIDCookieName = 'JSESSIONID';

    const cameraList = [
        {
            "cameraid": "00026.00001", // must be 5 digits, then Dot, then 5 digits
            "description": "Camera 1 Front Entrance",
            "faulty": false,
            "latitude": 51.89738,
            "longitude": -2.09944,
            "fixed": true,
            "height": 2.3,
            "bearing": 90.0,
            "owner": "RJH"
        },
        {
            "cameraid": "00026.00002",
            "description": "Camera 2 Side Entrance",
            "faulty": false,
            "latitude": 51.89751,
            "longitude": -2.10009,
            "fixed": false,
            "height": 2,
            "owner": "RJH"
        },
        {
            "cameraid": "00026.00003",
            "description": "Camera 3 Platform",
            "faulty": false,
            "latitude": 51.89733,
            "longitude": -2.09976,
            "fixed": false,
            "height": 2,
            "owner": "RJH"
        }
    ];

    // Use OpenSSL to create a self signed certificate
    const certProps = {
        days: 3650, // Validity in days
        selfSigned: true,
    };

    // Create Keys
    pem.createCertificate(certProps, (error, keys) => {
        if (error) {
            console.log(error);
            throw error;
        }
        const credentials = { key: keys.serviceKey, cert: keys.certificate } as ServerOptions;

        // Initialise Express Web Server and a HTTPS Socket
        const app = express();

        // Add Pre-Processors
        app.use(cookieParser()); // pass http requests through the cookie parser (populates .cookies item in the 'req' object)


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
                }
                res.json(reply);
                return;
            }

            // Check if user has already logged in
            const found = validSessions.find(item => item.username == req.query.username)
            if (found != undefined) {
                // Error - User already logged in
                const reply = {
                    "action": "Login",
                    "errorCode": 4,
                    "message": "User Already Logged In",
                    "success": false
                }
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
                }
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
            const cookieOptions: CookieOptions = {} // Not using expiry. Server side will check for expiry. expires: new Date(expires) };

            const newSessionItem: Session = {
                sessionId: sessionId,
                username: req.query.username.toString(),
                lastHeartbeat: now
            }
            validSessions.push(newSessionItem)

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
            let session: Session = null;

            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            } else {
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
            let session: Session = null;

            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            } else {
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
                "data": [], // list of video streams that have been disconnected (optional)
                "success": true,
                "timestamp": Math.round(now.getTime() / 1000) // time in seconds since 1970
            }
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
            let session: Session = null;

            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            } else {
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
            let session: Session = null;

            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            } else {
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

            const reply =
            {
                "action": "GetProfiles",
                "data": [
                    {
                        "profileName": "rtsp", // or should this be "High Resolution". really this needs a profile name and a transport protocol
                        "frameRate": 25,
                        "resolution": "1280, 720", // The DVNP Spec is unclear and says TBD but seems to imply "X, Y"
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
            let session: Session = null;

            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            } else {
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
            } else {
                camera = cameraList.find(item => item.cameraid == req.query.cameraid)
                if (camera == undefined) {
                    // Error - cameraid not in the camera list
                    cameraIdNotRecognised = true;
                }
            }

            if (cameraIdNotRecognised) {
                const reply =
                {
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
            //    EG const streamURL = "rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4";
            //    EG const expires = "2099-12-31T23:59";

            // In this example we will use the RTSL URLs from  HikVision 7716 NVR
            // cameraid is already validated to match a real Camera ID so will be 5 digita DOT 5 digits
            const split = req.query.cameraid.toString().split(".");
            //const siteIdString = split[0];
            const siteCameraId = Number(split[1]); // convert to Int

            // Hik Live URLs are
            //    rtsp://ip:port/Streaming/channels/101   - Camera 1, Stream 1
            //    rtsp://ip:port/Streaming/channels/102   - Camera 1, Stream 2 (usually lower resolution)
            //    rtsp://ip:port/Streaming/channels/201   - Camera 1, Stream 1
            //    rtsp://ip:port/Streaming/channels/201   - Camera 2, Stream 2

            const streamURL = `rtsp://192.168.1.10/Streaming/channels/${siteCameraId}01`;
            const expires = "2099-12-31T23:59";

            // Note - DVNP Consumer will probably try and authenticate with the RTSP Server.
            // Either the RTSP server needs to know the DVNP usernane/password
            // or the DVNP Consumner would have config options for the RTSP username/password


            // With other VMS systems we may need to communicate with a RTSP Proxy or an RTSP Server to produce a live video stream for the DVNP Consumer
            // <ADD RTSP SERVER CODE>


            // Add an entry to our RequestedStreams database. This is also used in StopVideo.action
            // Get the username from the Session
            // Avoid duplicates

            const check = requestedStreams.find(item => item.username == session.username && item.cameraId == req.query.cameraid.toString());
            if (check == null) {
                // We have not already started this Camera by this User


                const newRequest: RequestedStream = {
                    username: session.username,
                    cameraId: req.query.cameraid.toString(),
                    streamUrl: streamURL
                }
                requestedStreams.push(newRequest);

            }

            // Send the reply
            const reply =
            {
                "action": "GetStreamURI",
                "data":  // The official spec has a square bracket here. Is 'data' supposed to be a single item or an Array of URL/Expiry objects
                {
                    "streamURL": streamURL,
                    "expires": expires
                },
                "success": true
            }

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
            let session: Session = null;

            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            } else {
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
            } else {
                camera = cameraList.find(item => item.cameraid == req.query.cameraid)
                if (camera == undefined) {
                    // Error - cameraid not in the camera list
                    cameraIdNotRecognised = true;
                }
            }

            if (cameraIdNotRecognised) {
                const reply =
                {
                    "action": "StopVideo",
                    "errorCode": 3,
                    "message": "Camera ID Not Recognised", // This reply is not mentioned in the DVNP Spec but seems logical
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

            const reply =
            {
                "action": "StopVideo",
                "data": null,
                "success": true
            }

            res.json(reply);
            return;
        });


        ///////////////////////////////////////////////////////////////////////
        // DVNP GetRecordings.action
        // Example HTTP GET requests: https://xxx.xxx.xx.xxx/GetRecordings.action?recordingid=asd1231                          <- TODO - Search bookmarks on the recorder
        // Example HTTP GET requests: https://xxx.xxx.xx.xxx/GetRecordings.action?startpoint=1541403241&endpoint=1541603241    <- Sould return ALL recordings (for all camerasid) in this time period in an array
        //                                                                                                                     <- AND these are times in seconds. The Spec says it is to be Milliseconds!
        ///////////////////////////////////////////////////////////////////////
        app.get('/GetRecordings.action', function (req, res) {

            let sessionIdNotRecognised = false;
            let session: Session = null;

            // Validate JSessionID
            if (req.cookies[JSessionIDCookieName] == undefined) {
                // Error - no JSessionID cookie provided (perhaps it had expired at the client end)
                sessionIdNotRecognised = true;
            } else {
                session = validSessions.find(item => item.sessionId == req.cookies[JSessionIDCookieName]);
                if (session == undefined) {
                    // Error - Session was not found
                    sessionIdNotRecognised = true;
                }
            }

            if (sessionIdNotRecognised) {
                const reply = {
                    "action": "GetRecordings",
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


            // The HTTP Get can include a recordingid OR a cameraid OR Metadata (but metadata comes in a POST message)
            // This spec indicates that if there is no camerasid, we would return an array of URLs, one for each recording we have (ie one for each camera)

            // TODO - Currently this code REQUIRES the cameraid to be present
            // TODO - We do not support the recordingid (from the StartRecording.action) [but that would be a NVR bookmark or recording session's database]
            // TODO - We do not support Metadata (that comes in a POST message)

            // Parse the cameraid. Check the cameraid is in the cameraList
            let cameraIdNotRecognised = false;
            let camera = null;
            if (req.query.cameraid == undefined) {
                // Error - no cameraid parameter
                cameraIdNotRecognised = true;
            } else {
                camera = cameraList.find(item => item.cameraid == req.query.cameraid)
                if (camera == undefined) {
                    // Error - cameraid not in the camera list
                    cameraIdNotRecognised = true;
                }
            }

            if (cameraIdNotRecognised) {
                const reply =
                {
                    "action": "GetRecordings",
                    "errorCode": 3,
                    "message": "Camera ID Not Recognised", // This reply is not mentioned in the DVNP Spec but seems logical
                    "success": false
                };
                res.json(reply);
                return;
            }


            // This demo supports the HikVision 7716 NVR beause I have one in the office and because it supports playback via a RTSP URL which makes it simple to use
            // Other VMS systems may a RTSP Server or RTSP Proxy (or RTMP Server) to me initialised to deliver video


            const split = req.query.cameraid.toString().split("."); 12345.67890 // site id DOT camera number
            //const siteIdString = split[0];
            const cameraNumber = Number(split[1]); // convert to Int


            // eg 20170313T230652Z

            // Hik Replay URL example (from ISAPI manual)
            // rtsp://10.17.133.46:554/ISAPI/streaming/tracks/101?starttime=20170313T230652Z&endtime=20170314T025706Z
            // Check starttime parameter
            let startTimeUTC8601 = null;
            let endTimeUTC8601 = null;

            // Starttime
            if (req.query.startpoint == undefined) {
                // Error. No start time
                const reply =
                {
                    "action": "GetRecordings",
                    "errorCode": 26,
                    "message": "No Associated Recording Found", // not sure if this is the best error code to use or not
                    "success": false
                };
                res.json(reply);
                return;

            } else {
                startTimeUTC8601 = new Date(Number(req.query.startpoint)).toISOString().replace(/[-:]/g, '').split('.')[0] + "Z"; // remove - and : then find the milliseconds and chop them off, then re-add "Z"
            }

            // Endtime
            if (req.query.endpoint == undefined) {
                // End time is optional
                endTimeUTC8601 = null;
            } else {
                endTimeUTC8601 = new Date(Number(req.query.endpoint)).toISOString().replace(/[-:]/g, '').split('.')[0] + "Z"; // remove - and : then find the milliseconds and chop them off, then re-add "Z"
            }

            const streamURL = (endTimeUTC8601 == null ? `rtsp://192.168.1.10/ISAPI/streaming/tracks/${cameraNumber}01?starttime=${startTimeUTC8601}`
                : `rtsp://192.168.1.10/ISAPI/streaming/tracks/${cameraNumber}01?starttime=${startTimeUTC8601}&endtime=${endTimeUTC8601}`
            );
            const expires = "2099-12-31T23:59";


            // Send the reply
            const reply =
            {
                "action": "GetStreamURI",
                "data":  // The official spec has a square bracket here. Is 'data' supposed to be a single item or an Array of URL/Expiry objects
                {
                    "streamURL": streamURL,
                    "expires": expires
                },
                "success": true
            }

            res.json(reply);
            return;
        });



        ////////////////////////////////////////////////////
        // Home Page
        ////////////////////////////////////////////////////

        app.get('/', function (req, res) {
            res.send('DVNP Broadcaster Server, by Roger Hardiman (c) RJH Technical Consultancy Ltd 2022')
        });

        ////////////////////////////////////////////////////
        // Catch All
        // Echo back the URL received
        ////////////////////////////////////////////////////
        app.get('*', function (req, res) {
            res.send("Invalid URL: " + req.originalUrl);
        });



        const httpsServer = https.createServer(credentials, app);
        httpsServer.listen(port);
        console.log('HTTPS server started on Port ' + port);
    });
}


// Start the Server
dvnp_broadcaster();

