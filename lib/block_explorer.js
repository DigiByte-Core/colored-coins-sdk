var ChainAdapterRpc = require('blockexplorer-rpc')

var BlockExplorer = function(settings) {
  var self = this
  self.settings = settings || {}

  self.rpc = new ChainAdapterRpc(settings.host)
}

BlockExplorer.prototype.onProgress = function(blockexplorer, callback) {}

BlockExplorer.prototype.onConnect = function(blockexplorer, callback) {
  return callback()
}

BlockExplorer.prototype.getAddressesUtxos = function(addresses, callback) {
  this.rpc.post('getaddressesutxos', {addresses: addresses}, function(err, addressesUtxos) {
    if (err) return callback(err)
    var utxosTxidsAndIndexes = {}
    var utxos = []
    addressesUtxos.forEach(addressUtxos => {
      addressUtxos.utxos.forEach(utxo => {
        // ensure no duplications (multisig utxos may appear in more than one address-utxos pair)
        if (!utxosTxidsAndIndexes[utxo.txid + ':' + utxo.index]) {
          utxos.push(utxo)
          utxosTxidsAndIndexes[utxo.txid + ':' + utxo.index] = true
        }
      })
    })
    callback(null, utxos)
  })
}

BlockExplorer.prototype.getUtxos = function (utxos, callback) {
  this.rpc.post('getutxos', {utxos: utxos}, callback)
}

BlockExplorer.prototype.getAddressesTransactions = function(addresses, callback) {
  this.rpc.post('getaddressesinfowithtransactions', {addresses: addresses}, callback)
}

BlockExplorer.prototype.importAddresses = function(addresses, reindex, callback) {
  callback(null)
}

BlockExplorer.prototype.transmit = function (signedTxHex, callback) {
  this.rpc.post('transmit', {txHex: signedTxHex}, callback)
}

BlockExplorer.prototype.onNewTransaction = function(callback) {
  this.rpc.on('newtransaction', function (data) {
    callback(data.newtransaction)
  })
}

BlockExplorer.prototype.joinNewTransaction = function() {
  this.rpc.join('newtransaction')
}

BlockExplorer.prototype.onNewDATransaction = function(callback) {
  this.rpc.on('newdatransaction', function (data) {
    callback(data.newdatransaction)
  })
}

BlockExplorer.prototype.joinNewDATransaction = function() {
  this.rpc.join('newdatransaction')
}

BlockExplorer.prototype.onRevertedTransaction = function(callback) {
  this.rpc.on('revertedtransaction', function (data) {
    callback(data.revertedtransaction)
  })
}

BlockExplorer.prototype.joinRevertedTransaction = function() {
  this.rpc.join('revertedtransaction')
}

BlockExplorer.prototype.onRevertedDATransaction = function(callback) {
  this.rpc.on('reverteddatransaction', function (data) {
    callback(data.reverteddatransaction)
  })
}

BlockExplorer.prototype.joinRevertedDATransaction = function() {
  this.rpc.join('reverteddatransaction')
}

module.exports = BlockExplorer
