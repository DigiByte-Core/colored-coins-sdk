var util = require('util')
var async = require('async')
var events = require('events')
var request = require('request')
var debug = require('debug')('digiassets-sdk')
var HDWallet = require('digiasset-hdwallet')
var DigiAssetsRpc = require('digiassets-rpc')
var BlockExplorerRpc = require('blockexplorer-rpc')
var DigiAssetsBuilder = require('digiasset-transaction-builder')
var BlockExplorer = require('../lib/block_explorer')
var FullNode = require('../lib/full_node')
var MetadataServer = require('../lib/metadata_server')

var mainnetColoredCoinsHost = 'https://api.digiassets.net/v3'
var testnetColoredCoinsHost = 'https://testnet.api.coloredcoins.org/v3'

var mainnetBlockExplorerHost = 'https://explorerapi.digiassets.net'
var testnetBlockExplorerHost = 'https://testnet.explorer.coloredcoins.org'

var metadataServerHost = 'https://metadata.digiassets.net'

var verifierPath = 'https://www.coloredcoins.org/explorer/verify/api.php'

var DigiAssets = function (settings) {
  var self = this
  settings = settings || {}
  if (settings.network === 'testnet') {
    settings.coloredCoinsHost = settings.coloredCoinsHost || testnetColoredCoinsHost
    settings.blockExplorerHost = settings.blockExplorerHost || testnetBlockExplorerHost
  } else {
    settings.coloredCoinsHost = settings.coloredCoinsHost || mainnetColoredCoinsHost
    settings.blockExplorerHost = settings.blockExplorerHost || mainnetBlockExplorerHost
  }
  self.da = new DigiAssetsRpc(settings.coloredCoinsHost)
  self.dab = new DigiAssetsBuilder({ network: settings.network })
  self.blockexplorer = new BlockExplorerRpc(settings.blockExplorerHost)
  if (settings.fullNodeHost) {
    self.chainAdapter = new FullNode({ host: settings.fullNodeHost })
    self.usingFullNode = true
  } else {
    self.chainAdapter = new BlockExplorer({ host: settings.blockExplorerHost })
  }

  self.metadataServer = new MetadataServer({ host: settings.metadataServerHost || metadataServerHost })

  self.redisPort = settings.redisPort || 6379
  self.redisHost = settings.redisHost || '127.0.0.1'
  self.redisUrl = settings.redisUrl
  self.hdwallet = new HDWallet(settings)
  self.network = self.hdwallet.network
  self.eventsSecure = settings.eventsSecure || false
  self.allTransactions = settings.allTransactions || false
  self.events = settings.events || false
  self.addresses = []

  self.reindex = !!settings.reindex || false
}

util.inherits(DigiAssets, events.EventEmitter)

DigiAssets.encryptPrivateKey = HDWallet.encryptPrivateKey
DigiAssets.decryptPrivateKey = HDWallet.decryptPrivateKey
DigiAssets.createNewKey = HDWallet.createNewKey
DigiAssets.generateMnemonic = HDWallet.generateMnemonic
DigiAssets.validateMnemonic = HDWallet.validateMnemonic

DigiAssets.prototype.init = function (cb) {
  var self = this

  function handleError (err) {
    self.emit('error', err)
    if (cb) return cb(err)
  }

  self.hdwallet.init(function (err) {
    if (err) return handleError(err)
    self.ds = self.hdwallet.ds
    self.hdwallet.on('registerAddress', function (address) {
      if (!~self.addresses.indexOf(address)) {
        self.addresses.push(address)
        self.chainAdapter.importAddresses([address], false, function(err) {
          if (err) {
            return handleError(err)
          }
        })
      }
    })
    self.hdwallet.getAddresses(function (err, addresses) {
      if (err) return handleError
      self.addresses = addresses
      self.chainAdapter.importAddresses(addresses, self.reindex, function(err) {
        if (err) {
          return handleError(err)
        }
      })
      self.chainAdapter.onConnect(self.blockexplorer, function() {
        self.emit('connect')
        if (cb) cb()
      })
    })
  })
}

DigiAssets.prototype.buildTransaction = function (type, daArgs, callback) {
  var self = this

  var functionName

  daArgs.flags = daArgs.flags || {}
  daArgs.flags.injectPreviousOutput = true
  daArgs.financeChangeAddress = daArgs.financeChangeAddress || self.hdwallet.getAddress()
  daArgs.flags.splitChange = typeof daArgs.flags.splitChange !== 'undefined' ? daArgs.flags.splitChange : true

  self.metadataServer.upload(daArgs, function(err, dargs) {
    if(err) return callback(err)
    var tx
    try {
      if (type === 'send') {
        tx = self.dab.buildSendTransaction(daArgs)
      } else if (type === 'burn') {
        tx = self.dab.buildBurnTransaction(daArgs)
      } else if (type === 'issue') {
        tx = self.dab.buildIssueTransaction(daArgs)
      } else {
        return callback('Unknown type.')
      }
    } catch (err) {
      return callback(err)
    }
    tx.sha1 = daArgs.sha1
    return callback(null, tx)
  })
}

DigiAssets.prototype.signAndTransmit = function (assetInfo, callback) {
  var self = this
  async.waterfall([
    function(cb) {
      self.metadataServer.seed(assetInfo.sha1, cb)
    },
    function (data, cb) {
      self.sign(assetInfo.txHex, cb)
    },
    function (signedTxHex, cb) {
      assetInfo.txHex = signedTxHex
      self.transmit(signedTxHex, cb)
    }
  ],
  function (err, result) {
    if (err) return callback(err)
    assetInfo.txid = result.txid
    callback(null, assetInfo)
  })
}

DigiAssets.prototype.sign = function (txHex, callback) {
  this.hdwallet.sign(txHex, callback)
}

DigiAssets.prototype.transmit = function (signedTxHex, callback) {
  this.chainAdapter.transmit(signedTxHex, callback)
}

DigiAssets.prototype.issueAsset = function (args, callback) {
  var self = this

  var transmit = args.transmit !== false
  args.transfer = args.transfer || []
  if (!args.issueAddress) {
    return callback(new Error('Must have "issueAddress"'))
  }
  var hdwallet = self.hdwallet

  var assetInformation

  async.waterfall([
    function (cb) {
      self._getUtxosForAddresses([args.issueAddress], function(err, utxos) {
        if (err) {
          return cb(err)
        } else {
          args.utxos = utxos
          return cb()
        }
      })
    },
    function (cb) {
      self.buildTransaction('issue', args, cb)
    },
    function (assetInfo, cb) {
      if (typeof assetInfo === 'function') return assetInfo('wrong server response')
      if (!assetInfo || !assetInfo.txHex) return cb('wrong server response')
      if (!transmit) {
        return self.sign(assetInfo.txHex, cb)
      }
      assetInformation = assetInfo
      self.signAndTransmit(assetInfo, cb)
    },
    function (res, cb) {
      if (!transmit) {
        return cb(null, {signedTxHex: res})
      }
      res.receivingAddresses = args.transfer
      res.issueAddress = args.issueAddress
      res.assetId = assetInformation.assetId
      res.txHex = assetInformation.txHex
      cb(null, res)
    }
  ],
  callback)
}

DigiAssets.prototype.sendAsset = function (args, callback) {
  var self = this
  var transmit = args.transmit !== false
  async.waterfall([
    function (cb) {
      if (args.from && Array.isArray(args.from) && args.from.length) {
        self._getUtxosForAddresses(args.from, function(err, utxos) {
          if (err) {
            return cb(err)
          } else {
            delete args.from
            args.utxos = utxos
            return cb()
          }
        })
      } else if (args.sendutxo && Array.isArray(args.sendutxo) && args.sendutxo.length) {
        var objectUtxos = args.sendutxo.filter(utxo => typeof utxo === 'object')
        if (objectUtxos.length === args.sendutxo.length) {
          // 'sendutxo' is given as a UTXO object array, no need to fetch by txid:index
          args.utxos = args.sendutxo
          delete args.sendutxo
          return cb()
        }
        var stringUtxos = args.sendutxo.filter(utxo => typeof utxo === 'string')
        debug('stringUtxos', stringUtxos)
        var txidsIndexes = stringUtxos.map(utxo => {
          var utxoParts = utxo.split(':')
          return {
            txid: utxoParts[0],
            index: utxoParts[1]
          }
        })
        debug('txidsIndexes', txidsIndexes)
        self.chainAdapter.getUtxos(txidsIndexes, function (err, populatedObjectUtxos) {
          if (err) return cb(err)
          debug('populatedObjectUtxos', populatedObjectUtxos)
          args.utxos = objectUtxos.concat(populatedObjectUtxos)
          delete args.sendutxo
          return cb()
        })
      } else {
        return cb('Must have "from" as array of addresses or "sendutxo" as array of utxos.')
      }
    },
    function (cb) {
      self.buildTransaction('send', args, cb)
    },
    function (assetInfo, cb) {
      if (!transmit) {
        return self.sign(assetInfo.txHex, cb)
      }
      self.signAndTransmit(assetInfo, cb)
    },
    function (res, cb) {
      if (!transmit) {
        return cb(null, {signedTxHex: res})
      }
      cb(null, res)
    }
  ],
  callback)
}

DigiAssets.prototype.burnAsset = function (args, callback) {
  var self = this
  var transmit = args.transmit !== false
  args.transfer = args.transfer || []

  async.waterfall([
    function (cb) {
      if (args.from && Array.isArray(args.from) && args.from.length) {
        self._getUtxosForAddresses(args.from, function(err, utxos) {
          if (err) {
            return cb(err)
          } else {
            delete args.from
            args.utxos = utxos
            return cb()
          }
        })
      } else if (args.sendutxo && Array.isArray(args.sendutxo) && args.sendutxo.length) {
        args.utxos = args.sendutxo
        delete args.sendutxo
        return cb()
      } else {
        return cb('Should have from as array of addresses or sendutxo as array of utxos.')
      }
    },
    function (cb) {
      self.buildTransaction('burn', args, cb)
    },
    function (assetInfo, cb) {
      if (!transmit) {
        return self.sign(assetInfo.txHex, cb)
      }
      self.signAndTransmit(assetInfo, cb)
    },
    function (res, cb) {
      if (!transmit) {
        return cb(null, {signedTxHex: res})
      }
      cb(null, res)
    }
  ],
  callback)
}

DigiAssets.prototype.getUtxos = function (callback) {
  var self = this
  self.hdwallet.getAddresses(function(err, addresses) {
    if (err) {
      callback(err)
    } else {
      self._getUtxosForAddresses(addresses, callback)
    }
  })
}

DigiAssets.prototype._getUtxosForAddresses = function (addresses, callback) {
  this.chainAdapter.getAddressesUtxos(addresses, callback)
}

DigiAssets.prototype.getAssets = function (callback) {
  this.getUtxos((err, utxos) => {
    if (err) return callback(err)
    var assets = []
    utxos.forEach(function (utxo) {
      if (utxo.assets) {
        utxo.assets.forEach(function (asset, i) {
          assets.push({
            address: utxo.scriptPubKey.addresses[0],
            txid: utxo.txid,
            index: utxo.index,
            assetId: asset.assetId,
            amount: asset.amount,
            issueTxid: asset.issueTxid,
            divisibility: asset.divisibility,
            lockStatus: asset.lockStatus,
            aggregationPolicy: asset.aggregationPolicy,
            assetIndex: i
          })
        })
      }
    })
    callback(null, assets)
  })
}

DigiAssets.prototype.getTransactions = function (addresses, callback) {
  var self = this

  if (typeof addresses === 'function') {
    callback = addresses
    addresses = null
  }

  if (!addresses) {
    self.hdwallet.getAddresses(function (err, addresses) {
      if (err) return callback(err)
      self.getTransactionsFromAddresses(addresses, callback)
    })
  } else {
    self.getTransactionsFromAddresses(addresses, callback)
  }
}

DigiAssets.prototype.getTransactionsFromAddresses = function (addresses, callback) {
  this.chainAdapter.getAddressesTransactions(addresses, function (err, addressesInfos) {
    if (err) return callback(err)
    var txids = {}
    var transactions = []
    addressesInfos.forEach(addressInfo => {
      addressInfo.transactions.forEach(transaction => {
        if (!txids[transaction.txid]) {
          transactions.push(transaction)
          txids[transaction.txid] = true
        }
      })
    })
    callback(null, transactions)
  })
}

DigiAssets.prototype.getAssetMetadata = function (assetId, utxo, full, callback) {
  var self = this

  if (typeof full === 'undefined') {
    full = true // default value
  }
  if (typeof full === 'function') {
    callback = full
    full = true
  }

  var metadata
  async.waterfall([
    function (cb) {
      // get the metadata from cache
      if (full) return cb(null, null)
      getCachedAssetMetadata(self.ds, assetId, utxo, cb)
    },
    function (md, cb) {
      metadata = md
      // if got metadata from cache
      if (metadata) {
        return cb()
      }
      var params = [assetId]
      if (utxo) {
        params.push(utxo)
      }
      self.da.get('assetmetadata', params, function (err, md) {
        if (err) return cb(err)
        metadata = md
        // cache data
        cacheAssetMetadata(self.ds, assetId, utxo, getPartialMetadata(metadata))
        cb()
      })
    }
  ],
  function (err) {
    if (err) return callback(err)
    // return the metadata (if !full, just the partial)
    var partial = getPartialMetadata(metadata)
    if (!full) {
      metadata = partial
    } else {
      for (var attr in partial) {
        metadata[attr] = partial[attr]
      }
    }
    return callback(null, metadata)
  })
}

var getCachedAssetMetadata = function (ds, assetId, utxo, callback) {
  utxo = utxo || 0
  ds.hget(assetId, utxo, function (err, metadataStr) {
    if (err) return callback(err)
    if (!metadataStr) return callback(null, null)
    return callback(null, JSON.parse(metadataStr))
  })
}

var cacheAssetMetadata = function (ds, assetId, utxo, metadata) {
  utxo = utxo || 0
  ds.hset(assetId, utxo, JSON.stringify(metadata))
}

var getPartialMetadata = function (metadata) {
  var ans = {
    assetId: metadata.assetId
  }
  var utxoMetadata = metadata.metadataOfUtxo || metadata.metadataOfIssuence
  if (utxoMetadata && utxoMetadata.data) {
    ans.assetName = utxoMetadata.data.assetName
    ans.description = utxoMetadata.data.description
    ans.issuer = utxoMetadata.data.issuer
    if (utxoMetadata.data.urls) {
      utxoMetadata.data.urls.forEach(function (url) {
        if (url.name === 'icon') ans.icon = url.url
        if (url.name === 'large_icon') ans.large_icon = url.url
      })
    }
  } else {
    ans.assetName = metadata.assetName
    ans.description = metadata.description
    ans.issuer = metadata.issuer
    ans.icon = metadata.icon
    ans.large_icon = metadata.large_icon
  }
  return ans
}

DigiAssets.prototype.on = function (eventKey, callback) {
  switch (eventKey) {
    case 'newTransaction':
      return this.onNewTransaction(callback)
    case 'newDATransaction':
      return this.onNewDATransaction(callback)
    case 'revertedTransaction':
      return this.onRevertedTransaction(callback)
    case 'revertedDATransaction':
      return this.onRevertedDATransaction(callback)
    case 'scanProgress':
      return this.onProgress(callback)
    default:
      return this.blockexplorer.on.call(this, eventKey, callback)
  }
}

DigiAssets.prototype.onRevertedTransaction = function (callback) {
  this.chainAdapter.onRevertedTransaction(callback)
  this.chainAdapter.joinRevertedTransaction()
}

DigiAssets.prototype.onRevertedDATransaction = function (callback) {
  this.chainAdapter.onRevertedDATransaction(callback)
  this.chainAdapter.joinRevertedDATransaction()
}

DigiAssets.prototype.onNewTransaction = function (callback) {
  var self = this

  if (!self.events) return
  if (self.usingFullNode || self.eventsSecure || self.allTransactions) {
    self.chainAdapter.onNewTransaction(function (data) {
      if (isLocalTransaction(self.addresses, data)) {
        self.hdwallet.discover()
        callback(data)
      } else if (self.allTransactions) {
        callback(data)
      }
    })
    this.chainAdapter.joinNewTransaction()
  } else {
    var addresses = []
    var transactions = []
    self.hdwallet.on('registerAddress', function (address) {
      registerAddress(self, address, addresses, transactions, callback)
    })
    self.addresses.forEach(function (address) {
      registerAddress(self, address, addresses, transactions, callback)
    })
  }
}

DigiAssets.prototype.onNewDATransaction = function (callback) {
  var self = this

  if (!self.events) return false
  if (self.usingFullNode || self.eventsSecure || self.allTransactions) {
    self.chainAdapter.onNewDATransaction(function (data) {
      if (isLocalTransaction(self.addresses, data)) {
        self.hdwallet.discover()
        callback(data)
      } else if (self.allTransactions) {
        callback(data)
      }
    })
    this.chainAdapter.joinNewDATransaction()
  } else {
    self.onNewTransaction(function (transaction) {
      if (transaction.colored) {
        callback(transaction)
      }
    })
  }
}

DigiAssets.prototype.onProgress = function(callback) {
  this.chainAdapter.onProgress(this.blockexplorer, callback)
}

var isLocalTransaction = function (addresses, transaction) {
  var localTx = false

  if (!localTx && transaction.vin) {
    transaction.vin.forEach(function (input) {
      if (!localTx && input.previousOutput && input.previousOutput.addresses) {
        input.previousOutput.addresses.forEach(function (address) {
          if (!localTx && ~addresses.indexOf(address)) {
            localTx = true
          }
        })
      }
    })
  }

  if (!localTx && transaction.vout) {
    transaction.vout.forEach(function (output) {
      if (!localTx && output.scriptPubKey && output.scriptPubKey.addresses) {
        output.scriptPubKey.addresses.forEach(function (address) {
          if (!localTx && ~addresses.indexOf(address)) {
            localTx = true
          }
        })
      }
    })
  }

  return localTx
}

var registerAddress = function (self, address, addresses, transactions, callback) {
  if (!~addresses.indexOf(address)) {
    var channel = 'address/' + address
    self.blockexplorer.on(channel, function (data) {
      self.hdwallet.discover()
      var transaction = data.transaction
      if (!~transactions.indexOf(transaction.txid)) {
        transactions.push(transaction.txid)
        callback(transaction)
      }
    })
    addresses.push(address)
    self.blockexplorer.join(channel)
  }
}

DigiAssets.prototype.getIssuedAssetsFromTransactions = function (addresses, transactions) {
  var issuances = []
  transactions.forEach(function (transaction) {
    if (transaction.colored && transaction.dadata && transaction.dadata.length && transaction.dadata[0].type === 'issuance') {
      var issuance = {
        issueTxid: transaction.txid,
        txid: transaction.txid,
        lockStatus: transaction.dadata[0].lockStatus,
        divisibility: transaction.dadata[0].divisibility,
        aggregationPolicy: transaction.dadata[0].aggregationPolicy,
        amount: transaction.dadata[0].amount
      }
      var assetId
      var indexes = []
      var inputsAssetIds = {}
      transaction.vin.forEach(input => {
        if (input.assets) {
          input.assets.forEach(asset => {
            inputsAssetIds[asset.assetId] = true
          })
        }
      })
      // the issued asset is the one with the assetId which is not found in the transaction's inputs
      transaction.vout.forEach((output, index) => {
        if (output.assets) {
          output.assets.forEach(asset => {
            if (!inputsAssetIds[asset.assetId]) {
              assetId = asset.assetId
              indexes.push(index)
            }
          })
        }
      })
      if (!assetId) {
        return
      }
      issuance.assetId = assetId
      issuance.outputIndexes = indexes
      if (!transaction.vin || !transaction.vin.length || !transaction.vin[0].previousOutput || !transaction.vin[0].previousOutput.addresses || !transaction.vin[0].previousOutput.addresses.length) {
        return
      }

      var address = transaction.vin[0].previousOutput.addresses[0]
      if (~addresses.indexOf(address)) {
        issuance.address = address
        issuances.push(issuance)
      }
    }
  })
  return issuances
}

DigiAssets.prototype.getIssuedAssets = function (transactions, callback) {
  var self = this
  if (typeof transactions === 'function') {
    callback = transactions
    transactions = null
  }

  self.hdwallet.getAddresses(function (err, addresses) {
    if (err) return callback(err)
    if (!transactions) {
      self.getTransactions(addresses, function (err, transactions) {
        if (err) return callback(err)
        return callback(null, self.getIssuedAssetsFromTransactions(addresses, transactions))
      })
    } else {
      return callback(null, self.getIssuedAssetsFromTransactions(addresses, transactions))
    }
  })
}

DigiAssets.prototype.getAddressInfo = function (address, cb) {
  this._getUtxosForAddresses([address], function(err, data) {
    if (err) return cb(err)
    cb(null, { 'address': address, 'utxos': data})
  })
}

DigiAssets.prototype.getStakeHolders = function (assetId, numConfirmations, cb) {
  if (typeof numConfirmations === 'function') {
    cb = numConfirmations
    numConfirmations = 0
  }
  this.blockexplorer.get('getassetholders', { 'assetId': assetId, 'confirmations': numConfirmations }, cb)
}

DigiAssets.prototype.verifyIssuer = function (assetId, json, cb) {
  if (typeof json === 'function') {
    cb = json
    json = null
  }
  var args = {
    asset_id: assetId,
    json: json
  }
  request.post(verifierPath, {form: args}, function (err, response, body) {
    if (err) return cb(err)
    if (response.statusCode === 204) return cb('No Content')
    if (response.statusCode !== 200) return cb(body)
    if (body && typeof body === 'string') {
      body = JSON.parse(body)
    }
    cb(null, body)
  })
}

module.exports = DigiAssets
