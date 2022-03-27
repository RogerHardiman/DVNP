# DVNP Broadcast Server
## What is DVNP
The Digital Video Network Protocol (DVNP) allows one Video Management System (VMS or PSIM) to request live video from another make of Video Management System (VMS or PSIM) without need for proprietary SDKs or propriatary APIs. The protocol is available from Transport for London and is standardised in Document TEC4502/E/30.03.2020 Digital Video Network Protocol Issue 1.2

## What can DVNP do
DVNP allows one VMS or PSIM to access the cameras and recordings of another VMS or PSIM using a vendor neutral protocol. A CCTV Viewer can look at their own local cameas but also access the cameras and recordings of a remote CCTV system even if that system has completely different CCTV software and completely different video recorders.

DVNP has the following key features
* Authenticate the connection between two or more VMS/PSIM systems
* Get a List of Cameras from the other VMS/PSIM
* Get the RTSP Stream URLs of cameras on the other VMS/PSIM for live viewing (which may be via a RTSP or RTMP Proxy)
* Carry out PTZ control of cameras on the other VMS/PSIM
* Send Goto Preset commands to the other VMS/PSIM
* Replay Recordings from the other VMS/PSIM system

## History
DVNP was created by Costain/Simulation Systems Ltd (SSL), Transport for London, Highways England and the Metropolitan Police to create integrated CCTV system in the UK.
The specification is freely available from Transport for London.
DNVP replaces the older TeleVision Network Protocol (TVNP) that was designed by Philips/Tyco https://en.wikipedia.org/wiki/TV_Network_Protocol

## Software and Licence
The software is licenced under GPL version 3. This requires projects making use of this software to be open source and release their source code. Commercial Licence terms are available along with Professional Consultancy Services.

The DVNP Broadcast Server is written in Typescript and compiles into Javascript.

## DVNP Consumer / Viewer
The DVNP Consumer connects to the DVNP Broadcaster (server), authenticates, asks for a list of cameras and requests a StreamURI for each camera it wants to view. These are all implemented with HTTP GET commands with JSON replies.

