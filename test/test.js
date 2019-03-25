/* eslint-env mocha */
var DigiAssets = require('..')
var assert = require('assert')
var jf = require('jsonfile')
var path = require('path')

describe('Test DigiAssets SDK', function () {
  var da

  var fromAddress = 'mxNTyQ3WdFMQE7SGVpSQGXnSDevGMLq7dg'
  var toAddress = 'mgNcWJp4hPd7MN6ets2P8HcB5k99aCs8cy'
  var assetId = 'Ua3Kt8WJtsx61VC8DUJiRmseQ45NfW2dwLbG6s'
  var utxo = '661380f92f9094786657dc35753a51db4dba04526b57b799385ee401293860fd:1'
  var expectedAssetName = 'random asset'
  var signedTxHex = '0100000001d542409c9006cf73af5a09fa6814156b635b57a7c8929c7ad6d514254bb6d108020000006a47304402207b67c24b1602aef5e9da57685a1bf19ad4267f331ef061cfeace70ba7ab119b302206928a96dc9a86c443190759fddf2e372aed450305954a2db9deb36dc2a6115fd01210240042f2cfb410b4fab76a33dd36376fc752b03ee6f14708da6cd4d306670068bffffffff0358020000000000001976a9140964477fbc5bcce8c2ddbd8b4c705ef60c5a91e788ac00000000000000000a6a084343010501000110207a0100000000001976a9143dccfff7d33c163957d94949789baf660bed5a6c88ac00000000'
  var issuerAssetId = 'La39iBSrbqSvsvtJj7SPJSsCqw6njDewER7dQk'
  var issuerJson = {
    social: {
      facebook: {
        page_id: 1790094654575050
      }
    }
  }

  var issuanceUtxo

  before(function (done) {
    this.timeout(15000)
    var settings
    try {
      settings = jf.readFileSync(path.join(__dirname, '/settings.json'))
    } catch (e) {
      settings = {
        network: 'testnet'
      }
    }
    // read from command line arguments
    da = new DigiAssets(settings)
    da.init(done)
  })

  it('should create an issuance transaction', function (done) {
    this.timeout(15000)
    var args = {
      issueAddress: fromAddress,
      amount: 1,
      fee: 1000,
      transfer: [
        {
          address: toAddress,
          amount: 1
        }
      ]
    }
    da._getUtxosForAddresses([args.issueAddress], function(err, utxos) {
      assert.ifError(err)
      args.utxos = utxos
      da.buildTransaction('issue', args, function (err, ans) {
        assert.ifError(err)
        assert.equal(typeof ans.txHex, 'string')
        assert(ans.txHex.length)
        assert.equal(typeof ans.assetId, 'string')
        assert(ans.assetId.length)
        assert(Array.isArray(ans.coloredOutputIndexes))
        assert(ans.coloredOutputIndexes.length)
        done()
      })
    })
  })

  it('should create a transfer transaction', function (done) {
    this.timeout(15000)
    var args = {
      from: [fromAddress],
      fee: 1000,
      to: [
        {
          address: toAddress,
          amount: 1,
          assetId: assetId
        }
      ]
    }
    da._getUtxosForAddresses(args.from, function(err, utxos) {
      assert.ifError(err)
      delete args.from
      args.utxos = utxos
      da.buildTransaction('send', args, function (err, ans) {
        assert.ifError(err)
        assert.equal(typeof ans.txHex, 'string')
        assert(ans.txHex.length)
        assert(Array.isArray(ans.coloredOutputIndexes))
        assert(ans.coloredOutputIndexes.length)
        assert(Array.isArray(ans.multisigOutputs))
        done()
      })
    })
  })

  it('should create a burn transaction', function (done) {
    this.timeout(15000)
    var args = {
      from: [fromAddress],
      fee: 1000,
      burn: [
        {
          amount: 1,
          assetId: assetId
        }
      ]
    }
    da._getUtxosForAddresses(args.from, function(err, utxos) {
      assert.ifError(err)
      delete args.from
      args.utxos = utxos
      da.buildTransaction('burn', args, function (err, ans) {
        assert.ifError(err)
        assert.equal(typeof ans.txHex, 'string')
        assert(ans.txHex.length)
        assert(Array.isArray(ans.coloredOutputIndexes))
        assert(Array.isArray(ans.multisigOutputs))
        done()
      })
    })
  })

  it('should transmit a transaction', function (done) {
    this.timeout(15000)
    da.transmit(signedTxHex, function (err, ans) {
      assert(err)
      done()
    })
  })

  it('should get address info', function (done) {
    this.timeout(15000)
    da.getAddressInfo(da.hdwallet.getAddress(0, 0), function (err, ans) {
      assert.ifError(err)
      assert.equal(ans.address, da.hdwallet.getAddress(0, 0))
      assert(Array.isArray(ans.utxos))
      assert(ans.utxos.length)
      done()
    })
  })

  it('should get stakeholders', function (done) {
    this.timeout(15000)
    da.getStakeHolders(assetId, function (err, ans) {
      assert.ifError(err)
      assert.equal(ans.assetId, assetId)
      assert(Array.isArray(ans.holders))
      assert(ans.holders.length)
      done()
    })
  })

  it('should verify issuer', function (done) {
    this.timeout(15000)
    da.verifyIssuer(issuerAssetId, issuerJson, function (err, ans) {
      assert.ifError(err)
      assert.deepEqual(ans, {
        verifications: {
          social: {
            facebook: 'https://www.facebook.com/permalink.php?story_fbid=1790490524535463&id=1790094654575050'
          }
        }
      })
      done()
    })
  })

  it('should get error when issue address does not have BTC', function (done) {
    var issueAddress = da.hdwallet.getAddress()
    da._getUtxosForAddresses([issueAddress], function(err, utxos) {
      assert.ifError(err)
      da.issueAsset({ amount: 36, issueAddress: issueAddress, fee: 1000, utxos: utxos }, function (err, result) {
        assert(err)
        assert.equal(err.name, 'NotEnoughFundsError')
        done()
      })
    })
  })

  it('should create and transmit an issuance transaction', function (done) {
    this.timeout(15000)
    var args = {
      issueAddress: da.hdwallet.getAddress(0, 0),
      amount: 36,
      fee: 1000,
      metadata: {
        assetName: expectedAssetName
      },
      financeChangeAddress: da.hdwallet.getAddress(0, 0)
    }
    da.issueAsset(args, function (err, result) {
      assert.ifError(err)
      assert(result.txHex)
      assert(result.txid)
      assert(result.assetId)
      assetId = result.assetId
      issuanceUtxo = result.txid + ":" + result.coloredOutputIndexes[0]
      done()
    })
  })

  it('should create and transmit a transfer transaction', function (done) {
    this.timeout(15000)
    var args = {
      from: [da.hdwallet.getAddress(0, 0)],
      to: [
        {
          assetId: assetId,
          address: da.hdwallet.getAddress(),
          amount: 12
        }
      ],
      fee: 1000,
      financeChangeAddress: da.hdwallet.getAddress(0, 0)
    }
    da.sendAsset(args, function (err, result) {
      assert.ifError(err)
      assert(result.txHex)
      assert(result.txid)
      done()
    })
  })

  it('should create and transmit a burn transaction', function (done) {
    this.timeout(15000)
    var args = {
      from: [da.hdwallet.getAddress(0, 0)],
      burn: [
        {
          assetId: assetId,
          amount: 3
        }
      ],
      fee: 1000,
      financeChangeAddress: da.hdwallet.getAddress(0, 0)
    }
    da.burnAsset(args, function (err, result) {
      assert.ifError(err)
      assert(result.txHex)
      assert(result.txid)
      done()
    })
  })

  it('should get assetmetadata', function (done) {
    this.timeout(15000)
    da.getAssetMetadata(assetId, issuanceUtxo, function (err, ans) {
      assert.ifError(err)
      assert.equal(ans.assetId, assetId)
      assert.equal(ans.assetName, expectedAssetName)
      assert.equal(typeof ans.issuanceTxid, 'string')
      assert(ans.issuanceTxid.length)
      done()
    })
  })

  it('should get all utxos in wallet', function (done) {
    this.timeout(15000)
    da.getUtxos(function (err, res) {
      assert.ifError(err)
      assert(Array.isArray(res) && res.length)
      res.forEach(elem => {
        assert(elem.txid)
        assert(typeof elem.index !== 'undefined')
        if (typeof utxo.confirmations === 'undefined' || utxo.confirmations) {
          assert(elem.blockheight)
        }
        assert(elem.value)
        assert(elem.scriptPubKey)
        assert(elem.scriptPubKey.hex)
        assert(elem.scriptPubKey.addresses)
      })
      done()
    })
  })

  it('should get assets in wallet', function (done) {
    this.timeout(15000)
    da.getAssets(function (err, res) {
      assert.ifError(err)
      assert(Array.isArray(res) && res.length)
      res.forEach(elem => {
        assert(elem.txid)
        assert(typeof elem.index !== 'undefined')
        assert(typeof elem.assetIndex !== 'undefined')
        assert(elem.assetId)
        assert(elem.amount)
        assert(elem.issueTxid)
        assert(typeof elem.divisibility !== 'undefined')
        assert(typeof elem.lockStatus !== 'undefined')
      })
      done()
    })
  })

  it('should get issued assets', function (done) {
    this.timeout(15000)
    da.getIssuedAssets(function (err, res) {
      assert.ifError(err)
      assert(Array.isArray(res))
      res.forEach(elem => {
        assert(elem.txid)
        assert(elem.assetId)
        assert(elem.amount)
        assert(elem.issueTxid)
        assert(typeof elem.divisibility !== 'undefined')
        assert(typeof elem.lockStatus !== 'undefined')
      })
      assert(res.find(elem => elem.assetId === assetId))
      done()
    })
  })

  it('should get all transactions of wallet addresses', function (done) {
    this.timeout(15000)
    da.getTransactions(function (err, transactions) {
      assert.ifError(err)
      assert(Array.isArray(transactions))
      transactions.forEach(transaction => {
        assert(transaction.hex)
        assert(transaction.txid)
        assert(typeof transaction.confirmations !== 'undefined')
        assert(transaction.blockheight)
        assert(transaction.blocktime)
        assert(typeof transaction.fee !== 'undefined')
        assert(transaction.totalsent)
        assert(Array.isArray(transaction.vin) && transaction.vin.length)
        assert(Array.isArray(transaction.vout) && transaction.vout.length)
      })
      done()
    })
  })

  it('should receive a \'newTransaction\' event when eventsSecure = true', function (done) {
    this.timeout(15000)
    da.events = true
    da.eventsSecure = true

    var txids = []
    var txid
    var once = 0
    da.on('newTransaction', function (transaction) {
      txids.push(transaction.txid)
      if (txid && ~txids.indexOf(txid) && !once++) return done()
    })
    var args = {
      amount: 36,
      issueAddress: da.hdwallet.getAddress(0, 0),
      fee: 1000,
      financeChangeAddress: da.hdwallet.getAddress(0, 0)
    }
    da.issueAsset(args, function (err, ans) {
      assert.ifError(err)
      txid = ans.txid
      if (txid && ~txids.indexOf(txid) && !once++) return done()
    })
  })

  it('should receive a \'newTransaction\' event when eventsSecure = false', function (done) {
    this.timeout(15000)
    da.eventsSecure = false

    var txids = []
    var txid
    var once = 0
    da.on('newTransaction', function (transaction) {
      txids.push(transaction.txid)
      if (txid && ~txids.indexOf(txid) && !once++) return done()
    })
    var args = {
      amount: 36,
      issueAddress: da.hdwallet.getAddress(0, 0),
      fee: 1000,
      financeChangeAddress: da.hdwallet.getAddress(0, 0)
    }
    da.issueAsset(args, function (err, ans) {
      assert.ifError(err)
      txid = ans.txid
      if (txid && ~txids.indexOf(txid) && !once++) return done()
    })
  })

  it('should receive a \'newDATransaction\' event when eventsSecure = true', function (done) {
    this.timeout(15000)
    da.eventsSecure = true

    var txids = []
    var txid
    var once = 0
    da.on('newDATransaction', function (transaction) {
      txids.push(transaction.txid)
      if (txid && ~txids.indexOf(txid) && !once++) return done()
    })
    var args = {
      amount: 36,
      issueAddress: da.hdwallet.getAddress(0, 0),
      fee: 1000,
      financeChangeAddress: da.hdwallet.getAddress(0, 0)
    }
    da.issueAsset(args, function (err, ans) {
      assert.ifError(err)
      txid = ans.txid
      if (txid && ~txids.indexOf(txid) && !once++) return done()
    })
  })

  it('should receive a \'newDATransaction\' event when eventsSecure = false', function (done) {
    this.timeout(15000)
    da.eventsSecure = false

    var txids = []
    var txid
    var once = 0
    da.on('newDATransaction', function (transaction) {
      txids.push(transaction.txid)
      if (txid && ~txids.indexOf(txid) && !once++) return done()
    })
    var args = {
      amount: 36,
      issueAddress: da.hdwallet.getAddress(0, 0),
      fee: 1000,
      financeChangeAddress: da.hdwallet.getAddress(0, 0)
    }
    da.issueAsset(args, function (err, ans) {
      assert.ifError(err)
      txid = ans.txid
      if (txid && ~txids.indexOf(txid) && !once++) return done()
    })
  })
})
