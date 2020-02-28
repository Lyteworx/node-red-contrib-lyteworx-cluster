<img src="./readme/logo.jpg" width="300">


# node-red-contrib-lyteworx-cluster

## Run Node-RED on all your CPU cores


### Description

##### The [Node-RED](https://nodered.org/) framework runs on [Node.js®](https://nodejs.org), which by default runs in a single process and which uses a single cpu core.  This node allows Node-RED to run flows on multiple cores.

##### Most computers, from the smartphone to the enterprise server, have multiple cores.  To take advantage of this, Node.js has a module (called the [cluster](https://nodejs.org/api/cluster.html#cluster_cluster) module) that allows a Node.js program to run on multiple cores.


### Getting Started

### Installing

`npm i node-red-contrib-lyteworx-cluster`


### Runtime Modes

- enableOnly
- randomWorker
- sendToBingo
- runOnBingo
- broadcast
- roundRobin
