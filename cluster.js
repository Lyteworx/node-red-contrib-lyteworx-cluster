'use strict';

/**
 * @license CC BY-NC 3.0 US
 * Copyright DigitalArsenal.IO, Inc., Lyteworx LLC.
 * ALL RIGHTS RESERVED.
 **/

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var cluster = _interopDefault(require('cluster'));
var EventEmitter = _interopDefault(require('events'));

const getEligibleWorkers = (nodeID) => {
  let _r = Object
    .keys(cluster.workers).map(m => {
      return cluster.workers[m]
    });
  if (nodeID) {
    _r = _r.filter(w => w.nodeREDCOMM[nodeID]);
  }
  return _r;
};

function randomWorker (ipc) {
    let _available = getEligibleWorkers(); //TODO
    let _r = Math.floor(Math.random() * _available.length);
    return [cluster.workers[_available[_r].id]];
}

function getBingo (_worker) {
  let bingo = false;
  let workers = [];
  for (let _id in cluster.workers) {
    let _w = cluster.workers[_id];
    workers.push(_w);
    if (_w.process.bingo) {
      bingo = _w;
    }
  }

  if (!bingo) {
    let _stuckee = randomWorker();
    bingo = _stuckee[0];
    _stuckee[0].process.bingo = true;
  }

  workers.ipc = {
    method: 'setBingo',
    msg: {
      strategies: Object.keys(globalThis.clusteRED.strategies)
    }
  };

  globalThis.clusteRED.bingo = bingo;

  workers.ipc.msg[globalThis.CONSTANTS.BINGO] = bingo.process.pid;

  return workers;
}

function broadcast (ipc, emittingWorker) {

  let workers = Object.keys(cluster.workers).map(function (workerID) {
    let _worker = cluster.workers[workerID];
    let _omit = ipc && ipc.msg && ipc.msg.omitEmitter && _worker.id === emittingWorker.id;
    if (_worker.isConnected() && !_omit) {
      return _worker;
    }
  });
  return workers;
}

let roundRobin = 0;

function roundRobin$1 (ipc) {
  if (ipc) {
    let _available = getEligibleWorkers(ipc.nodeID);
    roundRobin = (roundRobin + 1) % (_available.length);
    return [_available[roundRobin]];
  }
}

function sendToBingo () {
  return [globalThis.clusteRED.bingo];
}

function noop(){}

var console$1 = global.console ? global.console : {
  log: noop,
  info: noop,
  warn: noop,
  error: noop,
  dir: noop,
  assert: noop,
  time: noop,
  timeEnd: noop,
  trace: noop
};

let _RED;

const clusterized = (ipc, _worker) => {
  if (globalThis.clusteRED.redHalted) return;
  globalThis.runtime.stop();
  if (_RED) {
    _RED.server.close();
  }
  console$1.info(`stopped Node-RED on Master Process: ${process.pid}`);
  globalThis.clusteRED.redHalted = true;
};

let currentRev = null;

const flowRev = (ipc, _worker) => {
  let workers = [];
  if (currentRev !== ipc.msg.rev) {
    currentRev = ipc.msg.rev;
    workers = broadcast();
    workers.ipc = {
      method: 'reloadWorkerFlows',
      msg: {
        ...ipc.msg
      }
    };
  }
  return workers;
};

const loadClusterWorkerFlows = function (ipc, _worker) {
  let workers = broadcast(_worker);
  workers.ipc = {
    method: 'reloadWorkerFlows'
  };
  return workers;
};

const masterInit = (RED, app, settings, server) => {

  _RED = RED;

  globalThis.clusteRED = {
    methods: {
      flowRev,
      broadcast,
      getBingo,
      roundRobin: roundRobin$1,
      clusterized,
      loadClusterWorkerFlows,
      randomWorker,
      sendToBingo
    },
    strategies: {
      randomWorker,
      sendToBingo,
      broadcast,
      roundRobin: roundRobin$1
    },
    initialized: false,
    bingo: undefined,
    isBingo: false,
    redHalted: false,
    clusterizedWorkers: {}
  };

  /**
   * Route a message from a worker to the correct location.
   * 
   * @param {Object} ipc - The serialized ipc message
   * @param {string} ipc.node - Node-RED node sending the message
   * @param {string} ipc.msg - Message to send
   * @param {object} worker - The worker that sent the message
   */

  const router = function (ipc, worker) {
    const f = globalThis.clusteRED.methods[ipc.node.mode];
    const func = typeof f === 'function' ? f : globalThis.clusteRED.methods['broadcast'];
    let workers = func(ipc, worker);
    if (!workers) return null;
    if (ipc && ipc.node && workers) {
      for (let i = 0; i < workers.length; i++) {
        if (workers.ipc) {
          Object.assign(ipc, workers.ipc);
        }
        ipc.msg.fromMaster = ipc.node.id || true;
        if (workers[i] && workers[i].isConnected()) {
          workers[i].send({
            method: ipc.method,
            msg: ipc.msg
          });
        }
      }
    }
  };

  let cpus = settings.cluster && parseInt(settings.cluster.cpus) ? settings.cluster.cpus : require('os').cpus().length;

  /**
   * Fork a new worker
   * 
   * @param {Object} [deadWorker] - The terminated worker that kicked off the fork
   **/

  let forkFunc = (len) => {
    if (Object.keys(cluster.workers).length >= cpus) return;
    for (let i = 0; i < len; i++) {
      let cp = _fork();
    }  };

  let _fork = function (deadWorker) {
    let redWorker = cluster.fork();
    redWorker.on('message', (ipc) => {
      router(ipc, redWorker);
    });
    redWorker.on('error', (_e) => {
      try {
        console$1.log(`IPC error ${_e}`);
      } catch (e) { }
    });
    return redWorker;
  };

  forkFunc(cpus);

  cluster.on('exit', function (worker, code, signal) {
    if (code !== 99) {
      _fork();
    }
  });
};

let startup = () => {

  process.send({
    node: {
      mode: 'clusterized'
    }
  });
  process.send({
    node: {
      mode: 'getBingo'
    }
  });

};

let opts = {
  user: undefined,
  deploymentType: 'reload',
  req: {
    user: undefined,
    path: '/flows',
    ip: '127.0.0.1'
  }
};

const workerInit = (RED, node, settings, nodeOptions) => {

  startup();

  Object.assign(node, nodeOptions);

  const setBingo = (ipc) => {
    globalThis.clusteRED.masterMethods = ipc.msg.strategies;
    globalThis.clusteRED.bingo = ipc.msg[globalThis.CONSTANTS.BINGO];
    globalThis.clusteRED.isBingo = globalThis.clusteRED.bingo === process.pid;
  };

  RED.events.on('nodes-stopped', () => {
    globalThis.runtime.flows.getFlows(opts).then((flow) => {
      process.send({
        node: {
          mode: "flowRev"
        },
        msg: {
          rev: flow.rev,
          clusterNodes: flow.flows.filter(n => n.type === "cluster").length
        }

      });
    }).catch(function (e) {
      console.log(e);
    });
  });

  setInterval(() => {

    if (RED.settings.adminAuth) {
      globalThis.tokens.init(RED.settings.adminAuth, globalThis.runtime.storage).catch(e => {
        console.log(e);
      });
    }
  }, 5000);

  const reloadWorkerFlows = (ipc) => {
    if (!ipc.msg.clusterNodes && !globalThis.clusteRED.isBingo) {
      globalThis.runtime.stop().then(() => {
        RED.server.close();
        process.exit(99);
      });
    }
    globalThis.runtime.flows.setFlows(opts).then(function (msg) {
      node.log(`PID ${process.pid} rev: ${msg.rev}`);
    });

  };

  const runOnBingo = () => {
    return node.mode !== 'runOnBingo' || globalThis.clusteRED.isBingo;
  };

  globalThis.clusteRED = {
    methods: {
      setBingo,
      reloadWorkerFlows
    },
    initialized: false,
    bingo: undefined,
    isBingo: false,
    workers: [],
    nodeREDEvents: new EventEmitter(),
    masterMethods: [],
    workerMethods: {
      runOnBingo
    }
  };

  node._inputCallback = function (msg) {
    if (runOnBingo()) {
      process.send({
        node,
        msg: node.payloadOnly ? {
          payload: msg.payload
        } : msg,
      });
    }
  };

  let _send = node.send;

  node.send = function (msg) {
    if ((msg && msg.fromMaster) && runOnBingo()) {
      delete msg.fromMaster;
      _send.call(node, msg);
    }
  };

  node.on("input", node.send);

  const ipcCallback = function (ipc) {
    if (ipc && ipc.method && globalThis.clusteRED.methods[ipc.method]) {
      globalThis.clusteRED.methods[ipc.method](ipc);
    } else if (ipc.msg && ipc.msg.fromMaster === node.id) {
      node.send(ipc.msg);
    }
  };

  process.on('message', ipcCallback);

  let serverID = '6660d4cd-cc89-4f2a-a20b-1ff66353d26b';

  RED.httpAdmin.get(`/${serverID}`, function (req, res) {
    res.send(globalThis.clusteRED.masterMethods.concat(Object.keys(globalThis.clusteRED.workerMethods)));
  });

  node.on('close', function () {

    process.removeListener('message', ipcCallback);

    RED.httpAdmin._router.stack = RED.httpAdmin._router.stack.filter((route, i, routes) => {
      return route.regexp.toString().indexOf(serverID) === -1
    });

  });
};

(function (Object) {
  typeof globalThis !== 'object' && (
    this ?
      get() :
      (Object.defineProperty(Object.prototype, '_T_', {
        configurable: true,
        get: get
      }), _T_)
  );
  function get() {
    this.globalThis = this;
    delete Object.prototype._T_;
  }
}(Object));

/*TODO
  - Consume system information on the cluster.html node
  - Create affinity code (getSpecificWorker)
*/

/*CONSTANTS*/
globalThis.CONSTANTS = {
  BINGO: 'bf4cef5d-25d9-4356-9193-c514d15ad818'
};

for (let pp in require.cache) {
  if (pp.indexOf('lib/auth/tokens.js') > -1) {
    globalThis.tokens = require(pp);
  }
  if (pp.indexOf('runtime/lib/index.js') > -1) {
    globalThis.runtime = require(pp);
  }
}

function main (RED) {

  function ClusterNode(n) {

    RED.nodes.createNode(this, n);

    let node = this;

    if (cluster.isMaster && !node.___clusterized) {

      node.___clusterized = true;

      masterInit(RED, null, RED.settings);

    } else if (cluster.isWorker) {
      workerInit(RED, node, RED.settings, n);
    }


  }

  RED.nodes.registerType("cluster", ClusterNode);
}

module.exports = main;
